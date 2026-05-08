//! Streaming parsing: StreamingContext (growable buffer) + StreamingEngine + StreamingDriver.
//!
//! Persistent storage is a kahon binary document written to a temp file.
//! `StreamingDriver` produces a finalized document (trailer written) and
//! returns a [`KahonHandle`] to the JS side. `IteratingDriver` keeps the
//! writer live and synthesizes [`TrailerSnapshot`]s at top-level array
//! element boundaries so the JS side can read newly-parsed elements while
//! later ones are still streaming in.

use std::cell::Cell;
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll};

use kahon::TrailerSnapshot;
use kahon::raw::RawWriter;

use crate::Schema;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::parser::{JsonParser, ParseResult};
use crate::storage::{IteratingHandle, KahonEncoder, KahonHandle, KahonSink};

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
    pub bytes_written: u64,
    pub buffered_bytes: usize,
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
    /// Raw pointer to KahonEncoder inside `_state`.
    encoder_ptr: *mut KahonEncoder,
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
    encoder: KahonEncoder,
}

impl StreamingEngine {
    pub fn new(
        schema: Rc<Schema>,
        defs: Rc<Vec<Schema>>,
        yield_elements: bool,
        writer: RawWriter<KahonSink>,
    ) -> Self {
        let yield_cell = Rc::new(Cell::new(None));

        let state = Box::pin(StreamingEngineState {
            parser: JsonParser::new(StreamingContext::new(yield_cell.clone())),
            encoder: KahonEncoder::new(writer),
        });

        // Stable raw pointers — valid as long as _state is alive and pinned
        let parser_ptr = &state.parser as *const JsonParser<StreamingContext>
            as *mut JsonParser<StreamingContext>;
        let encoder_ptr = &state.encoder as *const KahonEncoder as *mut KahonEncoder;

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

    /// Resume (or start) the parse future.
    ///
    /// Kahon writes hit the underlying file directly during the future's
    /// await points, so there's no flush step here — the driver only needs
    /// to drain encoder errors after each call.
    pub fn step(&mut self) -> ParseResult {
        if self.future.is_none() {
            self.future = Some(self.create_future());
        }
        self.poll_future()
    }

    fn poll_future(&mut self) -> ParseResult {
        let waker = std::task::Waker::noop();
        let mut cx = Context::from_waker(waker);

        match self.future.as_mut().unwrap().as_mut().poll(&mut cx) {
            Poll::Ready(Ok(())) => self.check_encoder_error(ParseResult::Complete),
            Poll::Ready(Err(e)) => ParseResult::Error(e),
            Poll::Pending => {
                let request = self
                    .yield_cell
                    .take()
                    .expect("async future suspended without setting yield request");
                match request {
                    YieldRequest::NeedMoreData(n) => {
                        self.check_encoder_error(ParseResult::NeedMoreData(n))
                    }
                    YieldRequest::ElementReady(index) => {
                        self.check_encoder_error(ParseResult::ElementReady(index))
                    }
                }
            }
        }
    }

    /// If the encoder latched a kahon write error during the last poll,
    /// surface it as a parse error instead of returning the parse outcome.
    fn check_encoder_error(&mut self, ok: ParseResult) -> ParseResult {
        let encoder = unsafe { &mut *self.encoder_ptr };
        if let Some(err) = encoder.take_error() {
            ParseResult::Error(AtcharaError::InvalidSchema(err.to_string()))
        } else {
            ok
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

    /// Take a trailer snapshot for the live writer (used by `parseEach`).
    /// Returns `None` if the writer has already been finalized or has no
    /// document state to snapshot yet.
    pub fn snapshot_trailer(&self) -> Option<std::result::Result<TrailerSnapshot, AtcharaError>> {
        let encoder = unsafe { &*self.encoder_ptr };
        encoder
            .snapshot_trailer()
            .map(|res| res.map_err(|e| AtcharaError::InvalidSchema(e.to_string())))
    }

    /// Pull the kahon writer out so the driver can call `.finish()` on it.
    pub fn take_writer(&mut self) -> Option<RawWriter<KahonSink>> {
        let encoder = unsafe { &mut *self.encoder_ptr };
        encoder.take_writer()
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
            bytes_written: encoder.bytes_written(),
            buffered_bytes: encoder.buffered_bytes(),
        }
    }
}

// ============================================================================
// StreamingDriver - parse orchestration for streaming mode
// ============================================================================

pub struct StreamingDriver {
    engine: StreamingEngine,
    phase: StreamingDriverPhase,
    /// Path of the live `.kahon` temp file. Cleared once ownership transfers
    /// to `KahonHandle` on a successful `finish()`. Drop deletes the file
    /// otherwise.
    db_path: Option<PathBuf>,
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
        // Ensure the kahon file is removed when the driver is dropped without
        // a successful finish() (which transfers ownership to KahonHandle).
        if let Some(path) = self.db_path.take() {
            std::fs::remove_file(&path).ok();
        }
    }
}

impl StreamingDriver {
    pub fn new(engine: StreamingEngine, db_path: PathBuf) -> Self {
        Self {
            engine,
            phase: StreamingDriverPhase::Parsing,
            db_path: Some(db_path),
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
            StreamingDriverPhase::Parsing => match self.engine.step() {
                ParseResult::Complete => {
                    self.phase = StreamingDriverPhase::TrailingCheck;
                    if let Some(err) = self.engine.check_trailing_content() {
                        return Err(err);
                    }
                    Ok(())
                }
                ParseResult::NeedMoreData(_) | ParseResult::ElementReady(_) => Ok(()),
                ParseResult::Error(e) => Err(e),
            },
        }
    }

    /// Signal EOF, finalize the kahon document, and return the JS-facing handle.
    /// On success, transfers the temp-file path to `KahonHandle` (Drop becomes a no-op).
    /// On error, Drop cleans up the file.
    pub fn finish(mut self) -> Result<KahonHandle, AtcharaError> {
        if let StreamingDriverPhase::Parsing = self.phase {
            self.engine.signal_eof();

            match self.engine.step() {
                ParseResult::Complete => {}
                ParseResult::NeedMoreData(_) | ParseResult::ElementReady(_) => {
                    return Err(self.engine.finalize_error());
                }
                ParseResult::Error(e) => return Err(e),
            }
        }

        if let Some(err) = self.engine.check_trailing_content() {
            return Err(err);
        }

        // Pull the kahon writer out and write the trailer.
        let writer = self
            .engine
            .take_writer()
            .ok_or_else(|| AtcharaError::InvalidSchema("kahon writer already taken".to_string()))?;
        let length = writer.bytes_written();
        let sink = writer
            .finish()
            .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
        // Drain any buffered bytes and close the file. into_inner() surfaces
        // flush errors that a plain `drop` would silently swallow.
        let file = sink
            .into_inner()
            .map_err(|e| AtcharaError::InvalidSchema(e.to_string()))?;
        drop(file);

        let path = self
            .db_path
            .take()
            .ok_or_else(|| AtcharaError::InvalidSchema("temp path already taken".to_string()))?;
        let trailer_len = 12u64;
        Ok(KahonHandle::new(path, length + trailer_len))
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
    /// Indices of elements that were fully parsed during this step
    pub ready_indices: Vec<u32>,
    /// Whether the array has been fully parsed
    pub complete: bool,
    /// Parse error encountered after yielding ready elements
    pub error: Option<AtcharaError>,
    /// Trailer snapshot covering the elements yielded in this batch.
    /// `None` when no new elements became ready.
    pub trailer: Option<TrailerSnapshot>,
}

pub struct IteratingDriver {
    engine: StreamingEngine,
    /// Owns the temp file path until ownership transfers to IteratingHandle
    /// at session-creation time. After that, this field is `None` and we
    /// rely on the handle's lifecycle for cleanup.
    db_path: Option<PathBuf>,
    complete: bool,
}

impl Drop for IteratingDriver {
    fn drop(&mut self) {
        if let Some(path) = self.db_path.take() {
            std::fs::remove_file(&path).ok();
        }
    }
}

impl IteratingDriver {
    pub fn new(engine: StreamingEngine) -> Self {
        Self {
            engine,
            db_path: None,
            complete: false,
        }
    }

    /// Feed a chunk and parse until we need more data or finish.
    /// Returns all element indices that became ready during this feed,
    /// alongside a trailer snapshot the JS side can layer over the live file.
    pub fn feed(&mut self, chunk: &[u8]) -> IteratingFeedResult {
        self.engine.feed(chunk);
        self.drain_ready()
    }

    /// Drain all ready elements from the current buffer state.
    /// Returns ready indices even if a parse error occurs, so that
    /// successfully parsed elements can be yielded before throwing.
    fn drain_ready(&mut self) -> IteratingFeedResult {
        let mut ready_indices = Vec::new();

        loop {
            match self.engine.step() {
                ParseResult::ElementReady(index) => {
                    ready_indices.push(index);
                }
                ParseResult::NeedMoreData(_) => {
                    let trailer = self.maybe_snapshot(&ready_indices);
                    return IteratingFeedResult {
                        ready_indices,
                        complete: false,
                        error: None,
                        trailer,
                    };
                }
                ParseResult::Complete => {
                    self.complete = true;
                    let trailing_error = self.engine.check_trailing_content();
                    let trailer = self.maybe_snapshot(&ready_indices);
                    return IteratingFeedResult {
                        ready_indices,
                        complete: true,
                        error: trailing_error,
                        trailer,
                    };
                }
                ParseResult::Error(e) => {
                    let trailer = self.maybe_snapshot(&ready_indices);
                    return IteratingFeedResult {
                        ready_indices,
                        complete: false,
                        error: Some(e),
                        trailer,
                    };
                }
            }
        }
    }

    /// Take a trailer snapshot covering any newly-ready elements. Skips the
    /// snapshot (returns `None`) when nothing became ready in this batch
    /// since the JS side has nothing new to read.
    fn maybe_snapshot(&self, ready_indices: &[u32]) -> Option<TrailerSnapshot> {
        if ready_indices.is_empty() {
            return None;
        }
        self.engine.snapshot_trailer()?.ok()
    }

    /// Signal EOF and run the final parse step.
    pub fn finish(&mut self) -> IteratingFeedResult {
        if self.complete {
            return IteratingFeedResult {
                ready_indices: Vec::new(),
                complete: true,
                error: None,
                trailer: None,
            };
        }

        self.engine.signal_eof();
        self.drain_ready()
    }

    /// Hand off the temp file to a JS-owned handle. Caller is responsible
    /// for cleanup once this returns.
    pub fn take_handle(&mut self, path: PathBuf) -> IteratingHandle {
        // We don't actually own the path here — the lib.rs caller created
        // the file and gave the handle the same path. Clear the field if
        // we ever started holding it.
        self.db_path = None;
        IteratingHandle::new(path)
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
