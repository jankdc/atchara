//! Kahon writer-backed storage for streaming parses.
//!
//! Each schema-driven write is funneled into a `kahon::raw::RawWriter<File>`
//! that emits a JSON-shaped binary document to a temp file. Schema-aware
//! types that don't exist in kahon's JSON value model are mapped:
//!
//! - `nullable<T>` present  → value of `T`
//! - `nullable<T>` null     → kahon `null`
//! - `optional<T>` present  → key + value (parent object)
//! - `optional<T>` absent   → key omitted
//! - `tuple<T₁..Tₙ>`        → kahon array
//! - `record<V>`            → kahon object (no schema-time keys)
//! - `union` variant `i`    → kahon array `[i, value]`
//!
//! The decoder uses the schema to interpret the JSON-shape representation.

use std::cell::RefCell;
use std::io::{self, Seek, SeekFrom, Write};
use std::path::PathBuf;
use std::rc::Rc;

use kahon::raw::{Checkpoint, RawWriter};
use kahon::{RewindableSink, TrailerSnapshot, WriteError};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::encoder::StorageEncoder;

// ============================================================================
// KahonSink - file sink with optional in-memory buffering.
// ============================================================================

/// File-backed kahon sink. Optionally buffers writes (BufWriter-like) to
/// amortise the per-`push_*` syscall cost of feeding kahon's raw writer.
///
/// Buffering is opt-in per session because parseEach's `snapshot_trailer`
/// path needs the on-disk file to be consistent at any moment (the JS side
/// reads from the live file). parseLarge has a clean write-then-read
/// boundary, so it can always buffer.
pub struct KahonSink {
    file: std::fs::File,
    buf: Vec<u8>,
}

impl KahonSink {
    /// Sink that batches writes through an in-memory buffer of the given
    /// capacity. A capacity of 0 falls back to direct writes.
    pub fn buffered(file: std::fs::File, capacity: usize) -> Self {
        Self {
            file,
            buf: Vec::with_capacity(capacity),
        }
    }

    /// Sink that writes directly to the file with no in-memory buffering.
    pub fn unbuffered(file: std::fs::File) -> Self {
        Self::buffered(file, 0)
    }

    /// Drain any buffered bytes to disk.
    fn flush_buffer(&mut self) -> io::Result<()> {
        if !self.buf.is_empty() {
            self.file.write_all(&self.buf)?;
            self.buf.clear();
        }
        Ok(())
    }

    /// Flush and unwrap the underlying file. Required after `RawWriter::finish`
    /// so callers (and any concurrent JS readers) see the trailer on disk.
    pub fn into_inner(mut self) -> io::Result<std::fs::File> {
        self.flush_buffer()?;
        Ok(self.file)
    }
}

impl Write for KahonSink {
    fn write(&mut self, data: &[u8]) -> io::Result<usize> {
        let cap = self.buf.capacity();
        // Unbuffered (capacity == 0) — passthrough.
        if cap == 0 {
            return self.file.write(data);
        }
        // Single write larger than the buffer: flush then write through to
        // the file directly so we don't waste a copy through the buffer.
        if data.len() >= cap {
            self.flush_buffer()?;
            return self.file.write(data);
        }
        // Wouldn't fit alongside what's already buffered: flush first.
        if self.buf.len() + data.len() > cap {
            self.flush_buffer()?;
        }
        self.buf.extend_from_slice(data);
        Ok(data.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.flush_buffer()?;
        self.file.flush()
    }
}

impl RewindableSink for KahonSink {
    fn rewind_to(&mut self, len: u64) -> io::Result<()> {
        // Empty the in-memory buffer first; otherwise the next write would
        // re-emit bytes past `len` that the writer has logically discarded.
        self.flush_buffer()?;
        self.file.set_len(len)?;
        self.file.seek(SeekFrom::Start(len))?;
        Ok(())
    }
}

// ============================================================================
// KahonEncoder - StorageEncoder implementation backed by kahon::raw::RawWriter
// ============================================================================

/// Encoder that streams schema-driven values into a kahon binary document.
///
/// Holds the kahon writer until the streaming driver pulls it out via
/// [`KahonEncoder::take_writer`] to call `.finish()` and write the trailer.
pub struct KahonEncoder {
    /// `Option` so the streaming driver can extract the writer on `finish()`
    /// without leaving a dangling encoder in invalid state.
    writer: Option<RawWriter<KahonSink>>,
    /// First write error encountered. Subsequent writes become no-ops.
    /// Drained by the driver after each parse step.
    error: Option<WriteError>,
}

impl KahonEncoder {
    pub fn new(writer: RawWriter<KahonSink>) -> Self {
        Self {
            writer: Some(writer),
            error: None,
        }
    }

    pub fn take_writer(&mut self) -> Option<RawWriter<KahonSink>> {
        self.writer.take()
    }

    pub fn take_error(&mut self) -> Option<WriteError> {
        self.error.take()
    }

    pub fn has_writer(&self) -> bool {
        self.writer.is_some()
    }

    /// Capture a snapshot trailer for the live writer (for parseEach's
    /// "read while writing" semantics). Does not disturb the writer.
    pub fn snapshot_trailer(&self) -> Option<std::result::Result<TrailerSnapshot, WriteError>> {
        self.writer.as_ref().map(|w| w.snapshot_trailer())
    }

    /// Bytes written to the underlying sink so far.
    pub fn bytes_written(&self) -> u64 {
        self.writer.as_ref().map(|w| w.bytes_written()).unwrap_or(0)
    }

    /// Approximate live in-memory footprint of buffered B+tree state.
    pub fn buffered_bytes(&self) -> usize {
        self.writer
            .as_ref()
            .map(|w| w.buffered_bytes())
            .unwrap_or(0)
    }

    /// Run `f` on the live writer; if it errors, latch the error so future
    /// writes become no-ops until the driver drains it.
    fn with_writer<F>(&mut self, f: F)
    where
        F: FnOnce(&mut RawWriter<KahonSink>) -> std::result::Result<(), WriteError>,
    {
        if self.error.is_some() {
            return;
        }
        let Some(writer) = self.writer.as_mut() else {
            return;
        };
        if let Err(e) = f(writer) {
            self.error = Some(e);
        }
    }
}

// All handles are unit — kahon manages frame state internally.
pub struct KahonArrayHandle;
pub struct KahonObjectHandle;
pub struct KahonRecordHandle;

/// Snapshot wraps a kahon Checkpoint. `Option` so we can no-op restores
/// when the matching snapshot was never captured (encoder already errored).
pub struct KahonSnapshot {
    checkpoint: Option<Checkpoint>,
}

impl StorageEncoder for KahonEncoder {
    type ArrayHandle = KahonArrayHandle;
    type ObjectHandle = KahonObjectHandle;
    type RecordHandle = KahonRecordHandle;
    type Snapshot = KahonSnapshot;

    // --- primitives -----------------------------------------------------

    fn write_null_flag(&mut self) {
        self.with_writer(|w| w.push_null());
    }

    fn write_present_flag(&mut self) {
        // No marker needed — a present nullable is just the inner value, and
        // optional fields are simply present (keyed) in their parent object.
    }

    fn write_boolean(&mut self, value: bool) {
        self.with_writer(|w| w.push_bool(value));
    }

    fn write_number(&mut self, value: f64) {
        self.with_writer(|w| w.push_f64(value));
    }

    fn write_string(&mut self, value: &str) {
        self.with_writer(|w| w.push_str(value));
    }

    // --- array ----------------------------------------------------------

    fn begin_array(&mut self) -> KahonArrayHandle {
        self.with_writer(|w| w.begin_array());
        KahonArrayHandle
    }

    fn end_array(&mut self, _handle: &mut KahonArrayHandle, _count: u32) {
        self.with_writer(|w| w.end_array());
    }

    fn begin_array_element(&mut self, _handle: &mut KahonArrayHandle, _index: usize) {}
    fn end_array_element(&mut self, _handle: &mut KahonArrayHandle) {}

    // --- tuple (schema-fixed length, written as a kahon array) -----------

    fn begin_tuple(&mut self, _len: usize) {
        self.with_writer(|w| w.begin_array());
    }

    fn end_tuple(&mut self, _count: u32) {
        self.with_writer(|w| w.end_array());
    }

    fn begin_tuple_element(&mut self, _index: usize) {}
    fn end_tuple_element(&mut self) {}

    // --- object ---------------------------------------------------------

    fn begin_object(&mut self, _field_count: usize) -> KahonObjectHandle {
        self.with_writer(|w| w.begin_object());
        KahonObjectHandle
    }

    fn end_object(&mut self, _handle: &mut KahonObjectHandle) {
        self.with_writer(|w| w.end_object());
    }

    fn begin_object_field(
        &mut self,
        _handle: &mut KahonObjectHandle,
        _field_index: usize,
        field_key: &str,
    ) {
        // Push the key now; the next write_* call supplies the value.
        let key = field_key.to_string();
        self.with_writer(|w| w.push_key(&key));
    }

    fn end_object_field(&mut self, _handle: &mut KahonObjectHandle) {}

    fn mark_field_absent(&mut self, _handle: &mut KahonObjectHandle, _field_index: usize) {
        // Optional absent fields rely on the caller having captured a snapshot
        // before `begin_object_field` and restored it on the absent path. After
        // restore, kahon never saw the key. Nothing to clean up.
    }

    // --- record (kahon object with runtime keys) ------------------------

    fn begin_record(&mut self) -> KahonRecordHandle {
        self.with_writer(|w| w.begin_object());
        KahonRecordHandle
    }

    fn end_record(&mut self, _handle: &mut KahonRecordHandle) {
        self.with_writer(|w| w.end_object());
    }

    fn begin_record_entry(&mut self, _handle: &mut KahonRecordHandle, key: &str) {
        let key = key.to_string();
        self.with_writer(|w| w.push_key(&key));
    }

    fn end_record_entry(&mut self, _handle: &mut KahonRecordHandle) {}

    // --- union (encoded as 2-tuple [variant_index, value]) --------------

    fn begin_variant(&mut self, index: usize) {
        self.with_writer(|w| {
            w.begin_array()?;
            w.push_u64(index as u64)
        });
    }

    fn end_variant(&mut self) {
        self.with_writer(|w| w.end_array());
    }

    // --- backtracking ---------------------------------------------------

    fn snapshot(&self) -> KahonSnapshot {
        KahonSnapshot {
            // No checkpoint if we've already errored — kahon's poisoned
            // writer can't snapshot, and a missing checkpoint just means
            // restore() is a no-op (the parser will surface the error anyway).
            checkpoint: if self.error.is_some() {
                None
            } else {
                self.writer.as_ref().map(|w| w.checkpoint())
            },
        }
    }

    fn restore(&mut self, snapshot: KahonSnapshot) {
        let Some(checkpoint) = snapshot.checkpoint else {
            return;
        };
        // Clear any latched error first — restoring should give us a clean
        // state. If the rollback itself fails, latch the new error.
        self.error = None;
        if let Some(writer) = self.writer.as_mut()
            && let Err(e) = writer.rollback(checkpoint)
        {
            self.error = Some(e);
        }
    }

    fn begin_indexed(&mut self, _schema_index: usize) {}
    fn end_indexed(&mut self, _schema_index: usize) {}

    fn finish(&mut self) {
        // Trailer is written by the streaming driver via take_writer().finish().
    }
}

// ============================================================================
// KahonHandle - JS-facing handle to the finished kahon document on disk
// ============================================================================

/// Owns the temp `.kahon` file that holds a finished streaming parse result.
///
/// The JS side opens this path with `kahon-js`'s `FileSource` to read values.
/// Closing (or finalizing on GC) deletes the file.
#[napi(custom_finalize)]
pub struct KahonHandle {
    /// Wrapped in `Option<...>` so `close()` is idempotent — once cleared,
    /// finalize doesn't try to delete a file the user may have already removed.
    state: Rc<RefCell<Option<KahonHandleState>>>,
}

struct KahonHandleState {
    path: PathBuf,
    length: u64,
}

impl ObjectFinalize for KahonHandle {
    fn finalize(self, _env: napi::Env) -> Result<()> {
        if let Some(state) = self.state.borrow_mut().take() {
            std::fs::remove_file(&state.path).ok();
        }
        Ok(())
    }
}

#[napi]
impl KahonHandle {
    pub(crate) fn new(path: PathBuf, length: u64) -> Self {
        Self {
            state: Rc::new(RefCell::new(Some(KahonHandleState { path, length }))),
        }
    }

    /// Absolute path to the temp `.kahon` file. Empty string after close.
    #[napi(getter)]
    pub fn path(&self) -> String {
        self.state
            .borrow()
            .as_ref()
            .map(|s| s.path.to_string_lossy().into_owned())
            .unwrap_or_default()
    }

    /// File length in bytes (the entire kahon document including trailer).
    #[napi(getter)]
    pub fn length(&self) -> BigInt {
        let len = self.state.borrow().as_ref().map(|s| s.length).unwrap_or(0);
        BigInt::from(len)
    }

    /// Whether the handle has been closed (file deleted).
    #[napi(getter)]
    pub fn is_closed(&self) -> bool {
        self.state.borrow().is_none()
    }

    /// Close and delete the temp file. Idempotent.
    #[napi]
    pub fn close(&self) -> Result<()> {
        if let Some(state) = self.state.borrow_mut().take() {
            std::fs::remove_file(&state.path).ok();
        }
        Ok(())
    }
}

// ============================================================================
// IteratingHandle - JS-facing handle for parseEach (long-lived during parse)
// ============================================================================

/// Owns the temp `.kahon` file for a parseEach session. Unlike
/// [`KahonHandle`], the file is still being appended to while the JS side
/// reads from snapshot trailers, so the path is exposed up-front and we
/// avoid recording a final length.
#[napi(custom_finalize)]
pub struct IteratingHandle {
    state: Rc<RefCell<Option<PathBuf>>>,
}

impl ObjectFinalize for IteratingHandle {
    fn finalize(self, _env: napi::Env) -> Result<()> {
        if let Some(path) = self.state.borrow_mut().take() {
            std::fs::remove_file(&path).ok();
        }
        Ok(())
    }
}

#[napi]
impl IteratingHandle {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self {
            state: Rc::new(RefCell::new(Some(path))),
        }
    }

    #[napi(getter)]
    pub fn path(&self) -> String {
        self.state
            .borrow()
            .as_ref()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default()
    }

    #[napi(getter)]
    pub fn is_closed(&self) -> bool {
        self.state.borrow().is_none()
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        if let Some(path) = self.state.borrow_mut().take() {
            std::fs::remove_file(&path).ok();
        }
        Ok(())
    }
}
