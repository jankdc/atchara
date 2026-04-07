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
pub use storage::{RedbClient, RedbEncoder};
pub use streaming::{IteratingDriver, StreamingDriver, StreamingEngine};

use std::rc::Rc;

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::errors::encode_error;

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
        let db_path =
            std::env::temp_dir().join(format!("atchara-stream-{}.redb", uuid::Uuid::new_v4()));

        let db = redb::Builder::new()
            .set_cache_size(64 * 1024 * 1024)
            .create(&db_path)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        let engine = StreamingEngine::new(Rc::clone(&self.schema), Rc::clone(&self.defs), false);
        let driver = StreamingDriver::new(engine, db, db_path);

        Ok(StreamingSession {
            state: StreamingSessionState::Active(driver),
        })
    }

    /// Begin an iterating parse session for streaming array element access.
    /// Only valid when the root schema is an array.
    /// Returns (IteratingSession, RedbClient) — session for feeding data, redb for reading.
    #[napi]
    pub fn create_iterating_session(&self) -> Result<(IteratingSession, RedbClient)> {
        if !matches!(self.schema.kind, SchemaKind::Array(_, _)) {
            return Err(Error::from_reason(
                "parseEach requires the root schema to be an array",
            ));
        }

        let db_path =
            std::env::temp_dir().join(format!("atchara-each-{}.redb", uuid::Uuid::new_v4()));

        let db = redb::Builder::new()
            .set_cache_size(64 * 1024 * 1024)
            .create(&db_path)
            .map_err(|e| Error::from_reason(e.to_string()))?;

        let redb_client = RedbClient::new(db, db_path);

        let engine = StreamingEngine::new(Rc::clone(&self.schema), Rc::clone(&self.defs), true);
        let driver = IteratingDriver::new(engine, Rc::clone(&redb_client.db));

        Ok((
            IteratingSession {
                state: IteratingSessionState::Active(driver),
            },
            redb_client,
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
    pub pending_writes_count: u32,
    pub pending_writes_bytes: u32,
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

    /// Finish parsing and return the session for accessing parsed data.
    #[napi]
    pub fn finish(&mut self) -> (bool, Buffer, Option<RedbClient>) {
        fn error_result(e: &AtcharaError) -> (bool, Buffer, Option<RedbClient>) {
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
            Ok(session) => {
                self.state = StreamingSessionState::Finished;
                (false, Buffer::from(Vec::new()), Some(session))
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
        let stats = driver.get_memory_stats();
        Ok(NativeMemoryStats {
            input_buffer_size: stats.input_buffer_size as u32,
            input_buffer_capacity: stats.input_buffer_capacity as u32,
            parse_position: stats.parse_position as u32,
            committed_position: stats.committed_position as u32,
            compaction_count: stats.compaction_count as u32,
            pending_writes_count: stats.pending_writes_count as u32,
            pending_writes_bytes: stats.pending_writes_bytes as u32,
        })
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
}

#[napi]
pub struct IteratingSession {
    state: IteratingSessionState,
}

enum IteratingSessionState {
    Active(IteratingDriver),
    Errored,
}

#[napi]
impl IteratingSession {
    /// Feed a chunk and return all element indices that became ready.
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

        let result = driver.feed(&chunk);
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
        IteratingFeedResult {
            status,
            ready_indices: result.ready_indices,
            error_bytes,
        }
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

        let result = driver.finish();
        let error_bytes = match &result.error {
            Some(e) => {
                let mut output = Vec::new();
                let mut writer = ByteWriter::new(&mut output);
                encode_error(e, &mut writer);
                Buffer::from(output)
            }
            None => Buffer::from(Vec::new()),
        };
        let status = if result.error.is_some() { -1 } else { 0 };
        // Keep state as Active so feed() can be retried if needed.
        IteratingFeedResult {
            status,
            ready_indices: result.ready_indices,
            error_bytes,
        }
    }

    /// Abort iteration, dropping the driver. Idempotent.
    /// RedbClient handles database cleanup independently.
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
        let stats = driver.get_memory_stats();
        Ok(NativeMemoryStats {
            input_buffer_size: stats.input_buffer_size as u32,
            input_buffer_capacity: stats.input_buffer_capacity as u32,
            parse_position: stats.parse_position as u32,
            committed_position: stats.committed_position as u32,
            compaction_count: stats.compaction_count as u32,
            pending_writes_count: stats.pending_writes_count as u32,
            pending_writes_bytes: stats.pending_writes_bytes as u32,
        })
    }
}
