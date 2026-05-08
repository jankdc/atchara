#![feature(portable_simd)]

use mimalloc::MiMalloc;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

pub mod bytes;
pub mod direct;
pub mod encoder;
pub mod errors;
pub mod hash;
pub mod input;
pub mod parser;
pub mod schema;
pub mod storage;
pub mod streaming;

pub use bytes::ByteWriter;
pub use direct::{BufferEncoder, DirectContext};
pub use encoder::StorageEncoder;
pub use errors::AtcharaError;
pub use hash::fnv1a_64;
pub use input::ParserContext;
pub use parser::{JsonParser, ParseResult};
pub use schema::{Schema, SchemaKind};
pub use storage::{IteratingHandle, KahonEncoder, KahonHandle};
pub use streaming::{IteratingDriver, StreamingDriver, StreamingEngine};

use std::rc::Rc;

use kahon::raw::RawWriter;
use kahon::{BuildPolicy, WriterOptions};
use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::errors::encode_error;
use crate::storage::KahonSink;

/// FNV-1a 64-bit hash function for record key lookup.
/// Must match the encoding side exactly for binary search to work.
#[napi]
pub fn fnv1a64(input: String) -> BigInt {
    let hash = fnv1a_64(input.as_bytes());
    BigInt::from(hash)
}

#[napi]
pub struct Atchara {
    schema: Rc<Schema>,
    defs: Rc<Vec<Schema>>,
}

/// `BuildPolicy::disk_aligned(16384)` sizes B+tree nodes to one 16 KiB page
/// and pads the body so no node straddles a page boundary. This matches
/// kahon-js's default `CachedByteSource` chunk size — each container lookup
/// at read time hits exactly one chunk in the LRU cache.
const KAHON_PAGE_SIZE: usize = 16 * 1024;

/// Buffer size for the parseLarge sink. Big enough that scalar emits coalesce
/// into a handful of `write(2)` syscalls per chunk, small enough not to bloat
/// resident memory. Matches the typical input chunk size.
const KAHON_WRITE_BUFFER_BYTES: usize = 64 * 1024;

/// Open a fresh `.kahon` temp file with the chosen sink mode and a `RawWriter`
/// configured for random-access reads. Returns the writer and the temp path
/// so the driver can clean up on failure.
fn create_kahon_writer(
    prefix: &str,
    buffered: bool,
) -> Result<(RawWriter<KahonSink>, std::path::PathBuf)> {
    let path =
        std::env::temp_dir().join(format!("atchara-{}-{}.kahon", prefix, uuid::Uuid::new_v4()));

    let file = std::fs::OpenOptions::new()
        .create_new(true)
        .read(true)
        .write(true)
        .open(&path)
        .map_err(|e| Error::from_reason(e.to_string()))?;

    // parseLarge has a clean write-then-read boundary, so it can buffer
    // freely. parseEach yields snapshots mid-stream and the JS side reads
    // the live file, so it has to stay unbuffered until kahon-rs exposes a
    // public flush hook.
    let sink = if buffered {
        KahonSink::buffered(file, KAHON_WRITE_BUFFER_BYTES)
    } else {
        KahonSink::unbuffered(file)
    };

    let opts = WriterOptions {
        policy: BuildPolicy::disk_aligned(KAHON_PAGE_SIZE),
        ..Default::default()
    };
    let writer =
        RawWriter::with_options(sink, opts).map_err(|e| Error::from_reason(e.to_string()))?;
    Ok((writer, path))
}

#[napi]
impl Atchara {
    #[napi(constructor)]
    pub fn new(schema_js: Object, defs_js: Option<Vec<Object>>) -> Result<Self> {
        let schema =
            Schema::from_napi_object(&schema_js).map_err(|e| Error::from_reason(e.to_string()))?;

        let defs = match defs_js {
            Some(def_objects) => {
                let mut defs = Vec::with_capacity(def_objects.len());
                for (i, def_obj) in def_objects.into_iter().enumerate() {
                    defs.push(Schema::from_napi_object(&def_obj).map_err(|e| {
                        Error::from_reason(format!("Failed to deserialize def {i}: {e}"))
                    })?);
                }
                defs
            }
            None => Vec::new(),
        };

        Ok(Atchara {
            schema: Rc::new(schema),
            defs: Rc::new(defs),
        })
    }

    /// Parse JSON from UTF-8 encoded bytes to schema-driven binary format.
    /// Returns (is_error, json_encoded_data) tuple:
    #[napi]
    pub fn parse(&self, input: &[u8]) -> (bool, Buffer) {
        let mut output = Vec::with_capacity(input.len() / 2 + 2);
        let mut writer = ByteWriter::new(&mut output);

        let ctx = DirectContext::new(input);
        let mut parser = JsonParser::new(ctx);
        let mut encoder = BufferEncoder::new(&mut writer);

        if let Err(e) = JsonParser::parse_value(&mut parser, &self.schema, &mut encoder, &self.defs)
        {
            writer.truncate(0);
            encode_error(&e, &mut writer);
            return (true, Buffer::from(output));
        }

        let trailing_line = parser.line();
        let trailing_column = parser.column();

        parser.parse_whitespace();

        if !parser.context.is_eof() {
            writer.truncate(0);
            let e = AtcharaError::ValidationError {
                expected: "end of input".to_string(),
                found: "trailing content".to_string(),
                line: trailing_line,
                column: trailing_column,
            };
            encode_error(&e, &mut writer);
            return (true, Buffer::from(output));
        }

        encoder.finish();

        (false, Buffer::from(output))
    }

    /// Begin a streaming parse session for incremental large document parsing.
    /// Returns a StreamingSession that accepts chunks of data.
    #[napi]
    pub fn create_streaming_session(&self) -> Result<StreamingSession> {
        let (writer, path) = create_kahon_writer("stream", true)?;

        let engine = StreamingEngine::new(
            Rc::clone(&self.schema),
            Rc::clone(&self.defs),
            false,
            writer,
        );
        let driver = StreamingDriver::new(engine, path);

        Ok(StreamingSession {
            state: StreamingSessionState::Active(driver),
        })
    }

    /// Begin an iterating parse session for streaming array element access.
    /// Only valid when the root schema is an array.
    /// Returns (IteratingSession, IteratingHandle) — the session for feeding
    /// chunks, and a handle that exposes the live `.kahon` file path so the
    /// JS side can stitch trailer snapshots over it.
    #[napi]
    pub fn create_iterating_session(&self) -> Result<(IteratingSession, IteratingHandle)> {
        if !matches!(self.schema.kind, SchemaKind::Array(_, _)) {
            return Err(Error::from_reason(
                "parseEach requires the root schema to be an array",
            ));
        }

        let (writer, path) = create_kahon_writer("each", false)?;
        let handle = IteratingHandle::new(path);

        let engine =
            StreamingEngine::new(Rc::clone(&self.schema), Rc::clone(&self.defs), true, writer);
        let driver = IteratingDriver::new(engine);

        Ok((
            IteratingSession {
                state: IteratingSessionState::Active(driver),
            },
            handle,
        ))
    }
}

/// Get version information
#[napi]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[napi(object)]
pub struct NativeMemoryStats {
    pub input_buffer_size: u32,
    pub input_buffer_capacity: u32,
    pub parse_position: u32,
    pub committed_position: u32,
    pub compaction_count: u32,
    /// Bytes written to the kahon document so far (excludes trailer).
    pub bytes_written: BigInt,
    /// Approximate live in-memory footprint of buffered B+tree state.
    pub buffered_bytes: u32,
}

fn memory_stats_to_napi(stats: streaming::MemoryStats) -> NativeMemoryStats {
    NativeMemoryStats {
        input_buffer_size: stats.input_buffer_size as u32,
        input_buffer_capacity: stats.input_buffer_capacity as u32,
        parse_position: stats.parse_position as u32,
        committed_position: stats.committed_position as u32,
        compaction_count: stats.compaction_count as u32,
        bytes_written: BigInt::from(stats.bytes_written),
        buffered_bytes: stats.buffered_bytes as u32,
    }
}

/// Streaming session for incremental large document parsing.
/// Thin N-API wrapper — delegates parse orchestration to `StreamingDriver`.
#[napi]
pub struct StreamingSession {
    state: StreamingSessionState,
}

enum StreamingSessionState {
    Active(StreamingDriver),
    Finished,
    Errored,
}

#[napi]
impl StreamingSession {
    /// Feed a chunk of data to the parser.
    /// Returns (status, error_bytes) where:
    /// - status = -1: error (error_bytes contains encoded error)
    /// - status = 1: ok (needs more data or parsing complete)
    #[napi]
    pub fn feed(&mut self, chunk: Buffer) -> (i32, Buffer) {
        fn error_result(e: &AtcharaError) -> (i32, Buffer) {
            let mut output = Vec::new();
            let mut writer = ByteWriter::new(&mut output);
            encode_error(e, &mut writer);
            (-1, Buffer::from(output))
        }

        let driver = match &mut self.state {
            StreamingSessionState::Active(d) => d,
            StreamingSessionState::Finished => {
                return error_result(&AtcharaError::InvalidSchema(
                    "Session is already finished".to_string(),
                ));
            }
            StreamingSessionState::Errored => {
                return error_result(&AtcharaError::InvalidSchema(
                    "Session is in error state".to_string(),
                ));
            }
        };

        match driver.feed(&chunk) {
            Ok(()) => (1, Buffer::from(Vec::new())),
            Err(e) => {
                self.state = StreamingSessionState::Errored;
                error_result(&e)
            }
        }
    }

    /// Finalize parsing, write the kahon trailer, and return the JS-facing handle.
    /// Returns (is_error, error_bytes, kahon_handle).
    #[napi]
    pub fn finish(&mut self) -> (bool, Buffer, Option<KahonHandle>) {
        fn error_result(e: &AtcharaError) -> (bool, Buffer, Option<KahonHandle>) {
            let mut output = Vec::new();
            let mut writer = ByteWriter::new(&mut output);
            encode_error(e, &mut writer);
            (true, Buffer::from(output), None)
        }

        // Take ownership of the driver; default to Errored so error paths don't need cleanup
        let driver = match std::mem::replace(&mut self.state, StreamingSessionState::Errored) {
            StreamingSessionState::Active(d) => d,
            StreamingSessionState::Finished => {
                return error_result(&AtcharaError::InvalidSchema(
                    "Session is already finished".to_string(),
                ));
            }
            StreamingSessionState::Errored => {
                return error_result(&AtcharaError::InvalidSchema(
                    "Session is in error state".to_string(),
                ));
            }
        };

        match driver.finish() {
            Ok(handle) => {
                self.state = StreamingSessionState::Finished;
                (false, Buffer::from(Vec::new()), Some(handle))
            }
            Err(e) => error_result(&e),
        }
    }

    /// Get memory stats for profiling.
    #[napi]
    pub fn get_memory_stats(&self) -> Result<NativeMemoryStats> {
        let driver = match &self.state {
            StreamingSessionState::Active(d) => d,
            _ => return Err(Error::from_reason("Session is not active")),
        };
        Ok(memory_stats_to_napi(driver.get_memory_stats()))
    }

    /// Abort the session, cleaning up resources.
    #[napi]
    pub fn abort(&mut self) -> Result<()> {
        if let StreamingSessionState::Active(driver) =
            std::mem::replace(&mut self.state, StreamingSessionState::Errored)
        {
            driver.abort();
        }
        Ok(())
    }
}

// ============================================================================
// IteratingSession - N-API wrapper for parseEach streaming array iteration
// ============================================================================

#[napi(object)]
pub struct IteratingFeedResult {
    /// -1 = error, 0 = complete, 1 = needs more data
    pub status: i32,
    /// Element indices that are ready to read
    pub ready_indices: Vec<u32>,
    /// Encoded error bytes (only when status = -1)
    pub error_bytes: Buffer,
    /// Trailer snapshot prefix length — bytes from the start of the live
    /// `.kahon` file that participate in this snapshot. `None` when no new
    /// elements became ready during this step.
    pub snapshot_prefix_len: Option<BigInt>,
    /// Trailer snapshot tail bytes — concatenate after the prefix to form
    /// a complete kahon document covering all elements yielded so far.
    pub snapshot_tail: Option<Buffer>,
}

#[napi]
pub struct IteratingSession {
    state: IteratingSessionState,
}

enum IteratingSessionState {
    Active(IteratingDriver),
    Errored,
}

fn build_feed_result(result: streaming::IteratingFeedResult) -> IteratingFeedResult {
    let error_bytes = match &result.error {
        Some(e) => {
            let mut output = Vec::new();
            let mut writer = ByteWriter::new(&mut output);
            encode_error(e, &mut writer);
            Buffer::from(output)
        }
        None => Buffer::from(Vec::new()),
    };
    let status = if result.error.is_some() {
        -1
    } else if result.complete {
        0
    } else {
        1
    };
    let (snapshot_prefix_len, snapshot_tail) = match result.trailer {
        Some(t) => (
            Some(BigInt::from(t.prefix_len)),
            Some(Buffer::from(t.bytes)),
        ),
        None => (None, None),
    };
    IteratingFeedResult {
        status,
        ready_indices: result.ready_indices,
        error_bytes,
        snapshot_prefix_len,
        snapshot_tail,
    }
}

#[napi]
impl IteratingSession {
    /// Feed a chunk and return ready element indices + a trailer snapshot
    /// covering them.
    #[napi]
    pub fn feed(&mut self, chunk: Buffer) -> IteratingFeedResult {
        fn error_result(e: &AtcharaError) -> IteratingFeedResult {
            let mut output = Vec::new();
            let mut writer = ByteWriter::new(&mut output);
            encode_error(e, &mut writer);
            IteratingFeedResult {
                status: -1,
                ready_indices: Vec::new(),
                error_bytes: Buffer::from(output),
                snapshot_prefix_len: None,
                snapshot_tail: None,
            }
        }

        let driver = match &mut self.state {
            IteratingSessionState::Active(d) => d,
            IteratingSessionState::Errored => {
                return error_result(&AtcharaError::InvalidSchema(
                    "Session is in error state".to_string(),
                ));
            }
        };

        build_feed_result(driver.feed(&chunk))
    }

    /// Signal EOF and process any remaining data.
    #[napi]
    pub fn finish(&mut self) -> IteratingFeedResult {
        fn error_result(e: &AtcharaError) -> IteratingFeedResult {
            let mut output = Vec::new();
            let mut writer = ByteWriter::new(&mut output);
            encode_error(e, &mut writer);
            IteratingFeedResult {
                status: -1,
                ready_indices: Vec::new(),
                error_bytes: Buffer::from(output),
                snapshot_prefix_len: None,
                snapshot_tail: None,
            }
        }

        let driver = match &mut self.state {
            IteratingSessionState::Active(d) => d,
            IteratingSessionState::Errored => {
                return error_result(&AtcharaError::InvalidSchema(
                    "Session is in error state".to_string(),
                ));
            }
        };

        build_feed_result(driver.finish())
    }

    /// Abort iteration, dropping the driver. Idempotent.
    /// IteratingHandle handles file cleanup independently.
    #[napi]
    pub fn abort(&mut self) -> Result<()> {
        let _ = std::mem::replace(&mut self.state, IteratingSessionState::Errored);
        Ok(())
    }

    /// Get memory stats for profiling.
    #[napi]
    pub fn get_memory_stats(&self) -> Result<NativeMemoryStats> {
        let driver = match &self.state {
            IteratingSessionState::Active(d) => d,
            _ => return Err(Error::from_reason("Session is not active")),
        };
        Ok(memory_stats_to_napi(driver.get_memory_stats()))
    }
}
