//! Streaming parsing: StreamingContext (growable buffer) + StreamingEngine + StreamingDriver.

use std::cell::{Cell, RefCell};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};

use redb::Durability;

use crate::Schema;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::parser::{JsonParser, ParseResult};
use crate::storage::{RedbClient, RedbEncoder};

/// Yield request from generator to driver
pub enum YieldRequest {
    /// Need at least N more bytes
    NeedMoreData(usize),
    /// An array element at the given index has been fully encoded
    ElementReady(u32),
}

/// Snapshot of internal buffer state for profiling
pub struct MemoryStats {
    pub input_buffer_size: usize,
    pub input_buffer_capacity: usize,
    pub parse_position: usize,
    pub committed_position: usize,
    pub compaction_count: u64,
    pub pending_writes_count: usize,
    pub pending_writes_bytes: usize,
}

/// Owned buffer for generator-based streaming
pub struct StreamingContext {
    pub(crate) input_buffer: Vec<u8>,
    /// TODO: add reason why we have this
    pub(crate) position: usize,
    /// Bytes before this position can be safely discarded
    pub(crate) committed: usize,
    /// TODO: add reason why we have this
    eof_signaled: bool,
    /// Union nesting depth — prevents buffer compaction during backtracking
    in_union_depth: usize,
    /// Set by the driver to signal early termination (e.g., JS `break` in parseEach)
    aborted: bool,
    /// When true, parse_array yields each element to the driver as it completes
    yield_elements: bool,
    /// Shared cell for passing yield requests to the driver
    yield_cell: Rc<Cell<Option<YieldRequest>>>,
    /// How many times the buffer has been compacted (for profiling)
    pub(crate) compaction_count: u64,
}

impl StreamingContext {
    pub fn new(yield_cell: Rc<Cell<Option<YieldRequest>>>) -> Self {
        Self {
            input_buffer: Vec::new(),
            position: 0,
            committed: 0,
            eof_signaled: false,
            in_union_depth: 0,
            aborted: false,
            yield_elements: false,
            yield_cell,
            compaction_count: 0,
        }
    }

    pub fn feed(&mut self, chunk: &[u8]) {
        self.input_buffer.extend_from_slice(chunk);
    }

    pub fn signal_eof(&mut self) {
        self.eof_signaled = true;
    }

    pub fn is_eof_signaled(&self) -> bool {
        self.eof_signaled
    }

    /// Yield until at least `n` bytes are available, or EOF is signaled.
    pub async fn ensure_data(&mut self, n: usize) {
        loop {
            if self.remaining().len() >= n || self.eof_signaled {
                return;
            }
            self.maybe_commit();
            self.yield_cell.set(Some(YieldRequest::NeedMoreData(n)));
            SuspendOnce(false).await;
        }
    }

    pub fn abort(&mut self) {
        self.aborted = true;
    }

    #[inline(always)]
    pub fn is_aborted(&self) -> bool {
        self.aborted
    }

    #[inline(always)]
    pub fn enter_union(&mut self) {
        self.in_union_depth += 1;
    }

    #[inline(always)]
    pub fn exit_union(&mut self) {
        self.in_union_depth -= 1;
    }

    pub fn set_yield_elements(&mut self, val: bool) {
        self.yield_elements = val;
    }

    #[inline(always)]
    pub fn should_yield_elements(&self) -> bool {
        self.yield_elements
    }

    /// Signal that an array element has been fully encoded and is ready for consumption.
    /// Suspends the parser so the driver can flush and yield the element to JS.
    pub async fn yield_element(&mut self, index: u32) {
        self.maybe_commit();
        self.yield_cell.set(Some(YieldRequest::ElementReady(index)));
        SuspendOnce(false).await;
    }

    /// Commit buffer position if not inside a union (allows buffer compaction).
    #[inline]
    fn maybe_commit(&mut self) {
        if self.in_union_depth == 0 {
            self.commit();
        }
    }

    fn commit(&mut self) {
        self.committed = self.position;
        self.maybe_compact();
    }

    fn maybe_compact(&mut self) {
        const COMPACT_THRESHOLD: usize = 64 * 1024;

        if self.committed > COMPACT_THRESHOLD {
            self.input_buffer.drain(..self.committed);
            self.position -= self.committed;
            self.committed = 0;
            self.compaction_count += 1;
        }
    }
}

impl ParserContext for StreamingContext {
    #[inline(always)]
    fn peek_byte(&self) -> Option<u8> {
        self.input_buffer.get(self.position).copied()
    }

    #[inline(always)]
    fn remaining(&self) -> &[u8] {
        &self.input_buffer[self.position..]
    }

    #[inline(always)]
    fn advance_byte(&mut self) {
        self.position += 1;
    }

    #[inline(always)]
    fn advance_bytes(&mut self, count: usize) {
        self.position += count;
    }

    #[inline(always)]
    fn position(&self) -> usize {
        self.position
    }

    #[inline(always)]
    fn set_position(&mut self, pos: usize) {
        debug_assert!(
            pos >= self.committed,
            "Cannot restore to position {} before committed position {}",
            pos,
            self.committed
        );
        self.position = pos;
    }

    #[inline(always)]
    fn is_eof(&self) -> bool {
        self.position >= self.input_buffer.len()
    }

    #[inline(always)]
    fn slice_bytes(&self, start: usize, end: usize) -> &[u8] {
        &self.input_buffer[start..end]
    }
}

/// Minimal future that yields control once
/// Returns Pending on first poll, Ready on second.
struct SuspendOnce(bool);

impl Future for SuspendOnce {
    type Output = ();
    fn poll(mut self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<()> {
        if self.0 {
            Poll::Ready(())
        } else {
            self.0 = true;
            Poll::Pending
        }
    }
}

// ============================================================================
// StreamingEngine - async future-based streaming parser
// ============================================================================

type ParseFuture = Pin<Box<dyn Future<Output = Result<(), AtcharaError>>>>;

pub struct StreamingEngine {
    /// Heap-allocated parser + encoder state. Accessed via raw pointers from
    /// the async future — must not be moved or dropped while `future` is alive.
    _state: Pin<Box<StreamingEngineState>>,
    /// Raw pointer to JsonParser inside `_state`. Stable because `_state` is pinned.
    parser_ptr: *mut JsonParser<StreamingContext>,
    /// Raw pointer to RedbEncoder inside `_state`.
    encoder_ptr: *mut RedbEncoder,
    /// The parse future (None before first step, consumed on completion).
    future: Option<ParseFuture>,
    schema: Rc<Schema>,
    defs: Rc<Vec<Schema>>,
    /// When true, the parser yields each array element to the driver as it completes
    yield_elements: bool,
    /// Shared cell for yield requests between the async future and the driver
    yield_cell: Rc<Cell<Option<YieldRequest>>>,
}

struct StreamingEngineState {
    parser: JsonParser<StreamingContext>,
    encoder: RedbEncoder,
}

impl StreamingEngine {
    pub fn new(schema: Rc<Schema>, defs: Rc<Vec<Schema>>, yield_elements: bool) -> Self {
        let yield_cell = Rc::new(Cell::new(None));

        let state = Box::pin(StreamingEngineState {
            parser: JsonParser::new(StreamingContext::new(yield_cell.clone())),
            encoder: RedbEncoder::new(),
        });

        // Stable raw pointers — valid as long as _state is alive and pinned
        let parser_ptr = &state.parser as *const JsonParser<StreamingContext>
            as *mut JsonParser<StreamingContext>;
        let encoder_ptr = &state.encoder as *const RedbEncoder as *mut RedbEncoder;

        Self {
            _state: state,
            parser_ptr,
            encoder_ptr,
            future: None,
            schema,
            defs,
            yield_elements,
            yield_cell,
        }
    }

    fn create_future(&self) -> ParseFuture {
        let parser_ptr = self.parser_ptr;
        let encoder_ptr = self.encoder_ptr;
        let schema = Rc::clone(&self.schema);
        let defs = Rc::clone(&self.defs);
        let yield_elements = self.yield_elements;

        Box::pin(async move {
            let parser = unsafe { &mut *parser_ptr };
            let encoder = unsafe { &mut *encoder_ptr };
            if yield_elements {
                parser.context.set_yield_elements(true);
            }
            JsonParser::parse_value_gen(parser, &schema, encoder, &defs).await
        })
    }

    pub fn feed(&mut self, chunk: &[u8]) {
        let parser = unsafe { &mut *self.parser_ptr };
        parser.context.feed(chunk);
    }

    pub fn signal_eof(&mut self) {
        let parser = unsafe { &mut *self.parser_ptr };
        parser.context.signal_eof();
    }

    pub fn abort_parse(&mut self) {
        let parser = unsafe { &mut *self.parser_ptr };
        parser.context.abort();
    }

    /// Resume (or start) the parse future, returning parse progress.
    ///
    /// The caller must create a write transaction and pass it here.
    /// On `NeedMoreData`: pending writes are flushed to the transaction.
    /// On `Complete`: the caller should call `flush` then `txn.commit()`.
    pub fn step(&mut self, txn: &mut redb::WriteTransaction) -> ParseResult {
        if self.future.is_none() {
            self.future = Some(self.create_future());
        }
        self.poll_future(txn)
    }

    fn poll_future(&mut self, txn: &mut redb::WriteTransaction) -> ParseResult {
        let encoder = unsafe { &mut *self.encoder_ptr };

        let waker = std::task::Waker::noop();
        let mut cx = Context::from_waker(waker);

        match self.future.as_mut().unwrap().as_mut().poll(&mut cx) {
            Poll::Ready(Ok(())) => ParseResult::Complete,
            Poll::Ready(Err(e)) => ParseResult::Error(e),
            Poll::Pending => {
                let request = self
                    .yield_cell
                    .take()
                    .expect("async future suspended without setting yield request");
                match request {
                    YieldRequest::NeedMoreData(n) => {
                        if let Err(e) = encoder.flush(txn) {
                            return ParseResult::Error(AtcharaError::InvalidSchema(e.to_string()));
                        }
                        ParseResult::NeedMoreData(n)
                    }
                    YieldRequest::ElementReady(index) => {
                        if let Err(e) = encoder.flush(txn) {
                            return ParseResult::Error(AtcharaError::InvalidSchema(e.to_string()));
                        }
                        ParseResult::ElementReady(index)
                    }
                }
            }
        }
    }

    /// Skip whitespace and check for non-whitespace trailing content.
    pub fn check_trailing_content(&mut self) -> Option<AtcharaError> {
        let parser = unsafe { &mut *self.parser_ptr };
        let (line, column) = (parser.line(), parser.column());

        // Scalar whitespace skip (no yielding needed — caller ensures all data is fed)
        parser.parse_whitespace_scalar();

        if !parser.context.is_eof() {
            Some(AtcharaError::ValidationError {
                expected: "end of input".to_string(),
                found: "trailing content".to_string(),
                line,
                column,
            })
        } else {
            None
        }
    }

    /// Produce an error describing what was expected when parsing ended prematurely.
    pub fn finalize_error(&self) -> AtcharaError {
        let parser = unsafe { &*self.parser_ptr };
        AtcharaError::ValidationError {
            expected: "value".to_string(),
            found: "end of input".to_string(),
            line: parser.line(),
            column: parser.column(),
        }
    }

    /// Flush remaining pending writes to the transaction.
    pub fn flush(&mut self, txn: &mut redb::WriteTransaction) -> std::result::Result<(), String> {
        let encoder = unsafe { &mut *self.encoder_ptr };
        encoder.flush(txn)
    }

    pub fn get_memory_stats(&self) -> MemoryStats {
        let parser = unsafe { &*self.parser_ptr };
        let encoder = unsafe { &*self.encoder_ptr };
        let ctx = &parser.context;
        MemoryStats {
            input_buffer_size: ctx.input_buffer.len(),
            input_buffer_capacity: ctx.input_buffer.capacity(),
            parse_position: ctx.position,
            committed_position: ctx.committed,
            compaction_count: ctx.compaction_count,
            pending_writes_count: encoder.pending_writes_count(),
            pending_writes_bytes: encoder.pending_writes_bytes(),
        }
    }
}

// ============================================================================
// StreamingDriver - parse orchestration for streaming mode
// ============================================================================

pub struct StreamingDriver {
    engine: StreamingEngine,
    phase: StreamingDriverPhase,
    db: Option<redb::Database>,
    db_path: PathBuf,
}

/// Parse lifecycle phase — encodes valid state transitions at the type level.
enum StreamingDriverPhase {
    /// Actively parsing — feed() runs parse_step()
    Parsing,
    /// Parse returned Complete — feed() only checks trailing content
    TrailingCheck,
}

impl Drop for StreamingDriver {
    fn drop(&mut self) {
        // Ensure the redb file is removed when the driver is dropped without
        // a successful finish() (which transfers ownership to RedbClient).
        self.db.take();
        std::fs::remove_file(&self.db_path).ok();
    }
}

impl StreamingDriver {
    pub fn new(engine: StreamingEngine, db: redb::Database, db_path: PathBuf) -> Self {
        Self {
            engine,
            phase: StreamingDriverPhase::Parsing,
            db: Some(db),
            db_path,
        }
    }

    /// Feed a chunk and advance the parse. Returns Ok(()) on success (whether
    /// parsing completed or needs more data).
    pub fn feed(&mut self, chunk: &[u8]) -> Result<(), AtcharaError> {
        self.engine.feed(chunk);

        match self.phase {
            StreamingDriverPhase::TrailingCheck => {
                if let Some(err) = self.engine.check_trailing_content() {
                    return Err(err);
                }
                Ok(())
            }
            StreamingDriverPhase::Parsing => {
                let db = self.db.as_ref().unwrap();
                let mut txn = db
                    .begin_write()
                    .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
                // Skip fsync — this is temporary session data
                txn.set_durability(Durability::None);

                match self.engine.step(&mut txn) {
                    ParseResult::Complete => {
                        self.phase = StreamingDriverPhase::TrailingCheck;

                        if let Some(err) = self.engine.check_trailing_content() {
                            drop(txn);
                            return Err(err);
                        }

                        self.engine
                            .flush(&mut txn)
                            .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
                        txn.commit()
                            .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
                        Ok(())
                    }
                    ParseResult::NeedMoreData(_) | ParseResult::ElementReady(_) => {
                        txn.commit()
                            .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
                        Ok(())
                    }
                    ParseResult::Error(e) => {
                        drop(txn);
                        Err(e)
                    }
                }
            }
        }
    }

    /// Signal EOF, run the final parse step, and return the completed RedbClient.
    /// On success, transfers db ownership to RedbClient (Drop becomes a no-op).
    /// On error, Drop cleans up the redb file.
    pub fn finish(mut self) -> Result<RedbClient, AtcharaError> {
        if let StreamingDriverPhase::Parsing = self.phase {
            self.engine.signal_eof();

            let db = self.db.as_ref().unwrap();
            let mut txn = db
                .begin_write()
                .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
            txn.set_durability(Durability::None);

            match self.engine.step(&mut txn) {
                ParseResult::Complete => {
                    self.engine
                        .flush(&mut txn)
                        .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
                    txn.commit()
                        .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
                }
                ParseResult::NeedMoreData(_) | ParseResult::ElementReady(_) => {
                    drop(txn);
                    return Err(self.engine.finalize_error());
                }
                ParseResult::Error(e) => {
                    drop(txn);
                    return Err(e);
                }
            }
        }

        if let Some(err) = self.engine.check_trailing_content() {
            return Err(err);
        }

        // Transfer db ownership to RedbClient — prevent Drop from deleting the file
        let db = self.db.take().unwrap();
        let db_path = std::mem::take(&mut self.db_path);
        Ok(RedbClient::new(db, db_path))
    }

    /// Explicit abort — Drop handles cleanup, this is just for clarity at call sites.
    pub fn abort(self) {
        drop(self);
    }

    pub fn get_memory_stats(&self) -> MemoryStats {
        self.engine.get_memory_stats()
    }
}

// ============================================================================
// IteratingDriver - parse orchestration for parseEach mode
// ============================================================================

/// Result of a single feed() call in iterating mode
pub struct IteratingFeedResult {
    /// Indices of elements that were fully parsed and flushed to redb
    pub ready_indices: Vec<u32>,
    /// Whether the array has been fully parsed
    pub complete: bool,
    /// Parse error encountered after yielding ready elements
    pub error: Option<AtcharaError>,
}

pub struct IteratingDriver {
    engine: StreamingEngine,
    db: Rc<RefCell<Option<redb::Database>>>,
    complete: bool,
}

impl IteratingDriver {
    pub fn new(engine: StreamingEngine, db: Rc<RefCell<Option<redb::Database>>>) -> Self {
        Self {
            engine,
            db,
            complete: false,
        }
    }

    /// Feed a chunk and parse until we need more data or finish.
    /// Returns all element indices that became ready during this feed.
    pub fn feed(&mut self, chunk: &[u8]) -> IteratingFeedResult {
        self.engine.feed(chunk);
        self.drain_ready()
    }

    /// Drain all ready elements from the current buffer state.
    /// Loops parse_each_step since one chunk may contain multiple elements.
    /// Returns ready indices even if a parse error occurs, so that
    /// successfully parsed elements can be yielded before throwing.
    fn drain_ready(&mut self) -> IteratingFeedResult {
        let mut ready_indices = Vec::new();

        loop {
            let db_ref = self.db.borrow();
            let db = match db_ref.as_ref() {
                Some(db) => db,
                None => {
                    return IteratingFeedResult {
                        ready_indices,
                        complete: false,
                        error: Some(AtcharaError::InvalidSchema(
                            "database is closed".to_string(),
                        )),
                    };
                }
            };
            let mut txn = match db
                .begin_write()
                .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))
            {
                Ok(t) => t,
                Err(e) => {
                    return IteratingFeedResult {
                        ready_indices,
                        complete: false,
                        error: Some(e),
                    };
                }
            };
            txn.set_durability(Durability::None);

            match self.engine.step(&mut txn) {
                ParseResult::ElementReady(index) => {
                    if let Err(e) = txn.commit() {
                        return IteratingFeedResult {
                            ready_indices,
                            complete: false,
                            error: Some(AtcharaError::InvalidSchema(e.to_string())),
                        };
                    }
                    ready_indices.push(index);
                }
                ParseResult::NeedMoreData(_) => {
                    if let Err(e) = txn.commit() {
                        return IteratingFeedResult {
                            ready_indices,
                            complete: false,
                            error: Some(AtcharaError::InvalidSchema(e.to_string())),
                        };
                    }
                    return IteratingFeedResult {
                        ready_indices,
                        complete: false,
                        error: None,
                    };
                }
                ParseResult::Complete => {
                    if let Err(e) = self.engine.flush(&mut txn) {
                        return IteratingFeedResult {
                            ready_indices,
                            complete: false,
                            error: Some(AtcharaError::InvalidSchema(e)),
                        };
                    }
                    if let Err(e) = txn.commit() {
                        return IteratingFeedResult {
                            ready_indices,
                            complete: false,
                            error: Some(AtcharaError::InvalidSchema(e.to_string())),
                        };
                    }
                    self.complete = true;

                    let trailing_error = self.engine.check_trailing_content();
                    return IteratingFeedResult {
                        ready_indices,
                        complete: true,
                        error: trailing_error,
                    };
                }
                ParseResult::Error(e) => {
                    drop(txn);
                    return IteratingFeedResult {
                        ready_indices,
                        complete: false,
                        error: Some(e),
                    };
                }
            }
        }
    }

    /// Signal EOF and run the final parse step.
    pub fn finish(&mut self) -> IteratingFeedResult {
        if self.complete {
            return IteratingFeedResult {
                ready_indices: Vec::new(),
                complete: true,
                error: None,
            };
        }

        self.engine.signal_eof();
        self.drain_ready()
    }

    pub fn get_memory_stats(&self) -> MemoryStats {
        self.engine.get_memory_stats()
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gen_push_and_read() {
        let mut ctx = StreamingContext::new(Rc::new(Cell::new(None)));
        assert_eq!(ctx.remaining().len(), 0);
        assert!(ctx.is_eof());

        ctx.feed(b"hello");
        assert_eq!(ctx.remaining().len(), 5);
        assert!(!ctx.is_eof());

        assert_eq!(ctx.peek_byte(), Some(b'h'));
        ctx.advance_byte();
        assert_eq!(ctx.peek_byte(), Some(b'e'));
        assert_eq!(ctx.remaining().len(), 4);
    }

    #[test]
    fn test_gen_multiple_chunks() {
        let mut ctx = StreamingContext::new(Rc::new(Cell::new(None)));
        ctx.feed(b"hel");
        ctx.feed(b"lo");
        assert_eq!(ctx.remaining(), b"hello");
    }

    #[test]
    fn test_gen_set_position() {
        let mut ctx = StreamingContext::new(Rc::new(Cell::new(None)));
        ctx.feed(b"hello");

        ctx.advance_bytes(3);
        assert_eq!(ctx.peek_byte(), Some(b'l'));

        ctx.set_position(0);
        assert_eq!(ctx.peek_byte(), Some(b'h'));
    }

    #[test]
    fn test_gen_commit_and_compact() {
        let mut ctx = StreamingContext::new(Rc::new(Cell::new(None)));

        let chunk = vec![b'a'; 70 * 1024];
        ctx.feed(&chunk);

        ctx.advance_bytes(65 * 1024);
        ctx.commit();

        assert!(ctx.input_buffer.len() < 70 * 1024);
        assert_eq!(ctx.committed, 0);
        assert_eq!(ctx.position(), 0);
    }

    #[test]
    #[should_panic(expected = "Cannot restore to position")]
    #[cfg(debug_assertions)]
    fn test_gen_set_position_before_committed_panics() {
        let mut ctx = StreamingContext::new(Rc::new(Cell::new(None)));
        ctx.feed(b"hello world");

        ctx.advance_bytes(5);
        ctx.commit();

        ctx.set_position(0);
    }
}
