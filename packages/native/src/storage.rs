//! redb storage backend for large document parsing.
//!
//! Stores each value with a path-based key for true per-field lazy loading.
//! Key format: d:{path} for data, m:{path}:{suffix} for metadata.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use redb::{Database, TableDefinition, WriteTransaction};
use std::cell::RefCell;
use std::path::PathBuf;
use std::rc::Rc;

use crate::encoder::StorageEncoder;

pub(crate) const TABLE: TableDefinition<&str, &[u8]> = TableDefinition::new("data");

// ============================================================================
// Object scalar packing — buffer primitive fields into a single blob per object
// ============================================================================

struct PackedFieldEntry {
    field_index: u16,
    data: Vec<u8>, // tag byte + optional encoded value
}

struct ObjectPackContext {
    base_depth: usize,
    packed_fields: Vec<PackedFieldEntry>,
    current_field_buf: Vec<u8>,
    current_field_index: u16,
    current_field_active: bool,
    current_field_structural: bool,
    /// Metadata buffered while we determine if the field is packable or structural.
    /// Flushed to storage if a structural begin is detected.
    buffered_metadata: Vec<(String, Vec<u8>)>,
}

impl ObjectPackContext {
    fn new(base_depth: usize) -> Self {
        Self {
            base_depth,
            packed_fields: Vec::new(),
            current_field_buf: Vec::new(),
            current_field_index: 0,
            current_field_active: false,
            current_field_structural: false,
            buffered_metadata: Vec::new(),
        }
    }
}

// ============================================================================
// RedbEncoder - StorageEncoder implementation for redb storage
// ============================================================================

pub struct RedbEncoder {
    path_stack: Vec<String>,
    pending_writes: Vec<(String, Vec<u8>)>,
    error: Option<String>,
    pack_stack: Vec<ObjectPackContext>,
}

impl Default for RedbEncoder {
    fn default() -> Self {
        Self::new()
    }
}

impl RedbEncoder {
    pub fn new() -> Self {
        Self {
            path_stack: Vec::new(),
            pending_writes: Vec::new(),
            error: None,
            pack_stack: Vec::new(),
        }
    }

    fn current_key(&self) -> String {
        if self.path_stack.is_empty() {
            "d:".to_string()
        } else {
            format!("d:{}", self.path_stack.join(":"))
        }
    }

    pub fn pending_writes_count(&self) -> usize {
        self.pending_writes.len()
    }

    pub fn pending_writes_bytes(&self) -> usize {
        self.pending_writes
            .iter()
            .map(|(k, v)| k.len() + v.len())
            .sum()
    }

    fn write_value(&mut self, value: &[u8]) {
        if self.error.is_some() {
            return;
        }
        let key = self.current_key();
        self.pending_writes.push((key, value.to_vec()));
    }

    fn write_metadata(&mut self, suffix: &str, value: &[u8]) {
        if self.error.is_some() {
            return;
        }
        let key = if self.path_stack.is_empty() {
            format!("m::{}", suffix)
        } else {
            format!("m:{}:{}", self.path_stack.join(":"), suffix)
        };
        self.pending_writes.push((key, value.to_vec()));
    }

    /// Flush pending writes to the given transaction's table.
    pub fn flush(&mut self, txn: &WriteTransaction) -> std::result::Result<(), String> {
        if let Some(e) = self.error.take() {
            return Err(e);
        }

        let mut table = txn.open_table(TABLE).map_err(|e| e.to_string())?;
        for (key, value) in self.pending_writes.drain(..) {
            table
                .insert(key.as_str(), value.as_slice())
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// True when inside a pack context and at the direct field depth (one level below the object).
    fn at_packable_depth(&self) -> bool {
        if let Some(ctx) = self.pack_stack.last() {
            ctx.current_field_active
                && !ctx.current_field_structural
                && self.path_stack.len() == ctx.base_depth + 1
        } else {
            false
        }
    }

    /// Called when a structural begin (object/array/tuple/record/variant) is detected.
    /// If at direct field depth, marks the field as structural and flushes buffered metadata.
    fn check_and_mark_structural(&mut self) {
        let to_flush = if let Some(ctx) = self.pack_stack.last_mut() {
            if ctx.current_field_active
                && !ctx.current_field_structural
                && self.path_stack.len() == ctx.base_depth + 1
            {
                ctx.current_field_structural = true;
                ctx.current_field_buf.clear();
                Some(ctx.buffered_metadata.drain(..).collect::<Vec<_>>())
            } else {
                None
            }
        } else {
            None
        };

        if let Some(entries) = to_flush {
            for (key, value) in entries {
                if self.error.is_some() {
                    return;
                }
                self.pending_writes.push((key, value));
            }
        }
    }
}

pub struct RedbArrayHandle {}

pub struct RedbObjectHandle {
    field_count: u32,
}

pub struct RedbRecordHandle {
    count: u32,
}

#[derive(Copy, Clone)]
struct PackCtxSnapshot {
    packed_count: usize,
    field_buf_len: usize,
    structural: bool,
    field_active: bool,
    metadata_count: usize,
    field_index: u16,
}

#[derive(Copy, Clone)]
pub struct RedbSnapshot {
    path_depth: usize,
    pending_count: usize,
    pack_stack_depth: usize,
    pack_ctx_state: Option<PackCtxSnapshot>,
}

impl StorageEncoder for RedbEncoder {
    type ArrayHandle = RedbArrayHandle;
    type ObjectHandle = RedbObjectHandle;
    type RecordHandle = RedbRecordHandle;
    type Snapshot = RedbSnapshot;

    fn write_null_flag(&mut self) {
        if let Some(ctx) = self.pack_stack.last_mut()
            && ctx.current_field_active
            && !ctx.current_field_structural
            && self.path_stack.len() == ctx.base_depth + 1
        {
            ctx.current_field_buf.push(0x02);
        }
        // Always write metadata — redundant for packable fields but needed for
        // nullable(structural) null values where the reader checks metadata.
        self.write_metadata("nul", &[0x01]);
    }

    fn write_present_flag(&mut self) {
        if self.at_packable_depth() {
            // Buffer the present metadata; discard if field stays packable (implicit
            // in blob tag 0x01), flush to storage if a structural begin follows.
            let meta_key = if self.path_stack.is_empty() {
                "m::nul".to_string()
            } else {
                format!("m:{}:nul", self.path_stack.join(":"))
            };
            if let Some(ctx) = self.pack_stack.last_mut() {
                ctx.buffered_metadata.push((meta_key, vec![0x00]));
            }
            return;
        }
        self.write_metadata("nul", &[0x00]);
    }

    fn write_boolean(&mut self, value: bool) {
        if let Some(ctx) = self.pack_stack.last_mut()
            && ctx.current_field_active
            && !ctx.current_field_structural
            && self.path_stack.len() == ctx.base_depth + 1
        {
            ctx.current_field_buf.push(0x01);
            ctx.current_field_buf.push(if value { 1 } else { 0 });
            return;
        }
        self.write_value(&[if value { 1 } else { 0 }]);
    }

    fn write_number(&mut self, value: f64) {
        if let Some(ctx) = self.pack_stack.last_mut()
            && ctx.current_field_active
            && !ctx.current_field_structural
            && self.path_stack.len() == ctx.base_depth + 1
        {
            ctx.current_field_buf.push(0x01);
            ctx.current_field_buf
                .extend_from_slice(&value.to_be_bytes());
            return;
        }
        self.write_value(&value.to_be_bytes());
    }

    fn write_string(&mut self, s: &str) {
        if let Some(ctx) = self.pack_stack.last_mut()
            && ctx.current_field_active
            && !ctx.current_field_structural
            && self.path_stack.len() == ctx.base_depth + 1
        {
            ctx.current_field_buf.push(0x01);
            ctx.current_field_buf
                .extend_from_slice(&(s.len() as u32).to_be_bytes());
            ctx.current_field_buf.extend_from_slice(s.as_bytes());
            return;
        }
        self.write_value(s.as_bytes());
    }

    fn begin_array(&mut self) -> RedbArrayHandle {
        self.check_and_mark_structural();
        RedbArrayHandle {}
    }

    fn end_array(&mut self, _handle: &mut RedbArrayHandle, count: u32) {
        self.write_metadata("len", &count.to_be_bytes());
    }

    fn begin_array_element(&mut self, _handle: &mut RedbArrayHandle, index: usize) {
        self.path_stack.push(index.to_string());
    }

    fn end_array_element(&mut self, _handle: &mut RedbArrayHandle) {
        self.path_stack.pop();
    }

    fn begin_tuple(&mut self, _len: usize) {
        self.check_and_mark_structural();
    }

    fn end_tuple(&mut self, count: u32) {
        self.write_metadata("len", &count.to_be_bytes());
    }

    fn begin_tuple_element(&mut self, index: usize) {
        self.path_stack.push(index.to_string());
    }

    fn end_tuple_element(&mut self) {
        self.path_stack.pop();
    }

    fn begin_object(&mut self, _field_count: usize) -> RedbObjectHandle {
        self.check_and_mark_structural();
        self.pack_stack
            .push(ObjectPackContext::new(self.path_stack.len()));
        RedbObjectHandle { field_count: 0 }
    }

    fn end_object(&mut self, handle: &mut RedbObjectHandle) {
        if let Some(mut ctx) = self.pack_stack.pop() {
            if !ctx.packed_fields.is_empty() {
                // Serialize packed blob: [u16 count] [u16 field_index, bytes...]...
                ctx.packed_fields.sort_by_key(|e| e.field_index);
                let mut blob = Vec::new();
                blob.extend_from_slice(&(ctx.packed_fields.len() as u16).to_be_bytes());
                for entry in &ctx.packed_fields {
                    blob.extend_from_slice(&entry.field_index.to_be_bytes());
                    blob.extend_from_slice(&entry.data);
                }
                self.write_value(&blob);
            } else {
                // No packed fields — write len metadata as before
                self.write_metadata("len", &handle.field_count.to_be_bytes());
            }
        }
    }

    fn begin_object_field(
        &mut self,
        handle: &mut RedbObjectHandle,
        field_index: usize,
        field_key: &str,
    ) {
        handle.field_count += 1;
        if let Some(ctx) = self.pack_stack.last_mut() {
            ctx.current_field_buf.clear();
            ctx.current_field_index = field_index as u16;
            ctx.current_field_active = true;
            ctx.current_field_structural = false;
            ctx.buffered_metadata.clear();
        }
        self.path_stack.push(field_key.to_string());
    }

    fn end_object_field(&mut self, _handle: &mut RedbObjectHandle) {
        if let Some(ctx) = self.pack_stack.last_mut() {
            if ctx.current_field_active && !ctx.current_field_structural {
                let mut data = std::mem::take(&mut ctx.current_field_buf);
                if data.is_empty() {
                    // Present but no value bytes (e.g., literal null)
                    data.push(0x01);
                }
                ctx.packed_fields.push(PackedFieldEntry {
                    field_index: ctx.current_field_index,
                    data,
                });
            }
            ctx.buffered_metadata.clear();
            ctx.current_field_active = false;
        }
        self.path_stack.pop();
    }

    fn mark_field_absent(&mut self, _handle: &mut RedbObjectHandle, _field_index: usize) {
        if let Some(ctx) = self.pack_stack.last_mut() {
            ctx.current_field_active = false;
            ctx.buffered_metadata.clear();
        }
        self.path_stack.pop();
    }

    fn begin_record(&mut self) -> RedbRecordHandle {
        self.check_and_mark_structural();
        RedbRecordHandle { count: 0 }
    }

    fn end_record(&mut self, handle: &mut RedbRecordHandle) {
        self.write_metadata("len", &handle.count.to_be_bytes());
    }

    fn begin_record_entry(&mut self, handle: &mut RedbRecordHandle, key: &str) {
        handle.count += 1;
        self.path_stack.push(format!("k:{}", key));
    }

    fn end_record_entry(&mut self, _handle: &mut RedbRecordHandle) {
        self.path_stack.pop();
    }

    fn begin_variant(&mut self, index: usize) {
        self.check_and_mark_structural();
        self.write_metadata("var", &[index as u8]);
        // Push variant marker to path for nested union separation
        self.path_stack.push(format!("v{}", index));
    }

    fn end_variant(&mut self) {
        self.path_stack.pop();
    }

    fn snapshot(&self) -> RedbSnapshot {
        let pack_ctx_state = self.pack_stack.last().map(|ctx| PackCtxSnapshot {
            packed_count: ctx.packed_fields.len(),
            field_buf_len: ctx.current_field_buf.len(),
            structural: ctx.current_field_structural,
            field_active: ctx.current_field_active,
            metadata_count: ctx.buffered_metadata.len(),
            field_index: ctx.current_field_index,
        });
        RedbSnapshot {
            path_depth: self.path_stack.len(),
            pending_count: self.pending_writes.len(),
            pack_stack_depth: self.pack_stack.len(),
            pack_ctx_state,
        }
    }

    fn restore(&mut self, snapshot: RedbSnapshot) {
        self.path_stack.truncate(snapshot.path_depth);
        self.pending_writes.truncate(snapshot.pending_count);
        self.pack_stack.truncate(snapshot.pack_stack_depth);
        if let Some(ctx_snap) = snapshot.pack_ctx_state
            && let Some(ctx) = self.pack_stack.last_mut()
        {
            ctx.packed_fields.truncate(ctx_snap.packed_count);
            ctx.current_field_buf.truncate(ctx_snap.field_buf_len);
            ctx.current_field_structural = ctx_snap.structural;
            ctx.current_field_active = ctx_snap.field_active;
            ctx.current_field_index = ctx_snap.field_index;
            ctx.buffered_metadata.truncate(ctx_snap.metadata_count);
        }
    }

    fn begin_indexed(&mut self, _schema_index: usize) {}

    fn end_indexed(&mut self, _schema_index: usize) {}

    fn finish(&mut self) {}
}

// ============================================================================
// RedbClient - redb client handle for database access
// ============================================================================

/// Uses RefCell<Option<Database>> for explicit close() support while remaining GC-safe.
#[napi(custom_finalize)]
pub struct RedbClient {
    pub(crate) db: Rc<RefCell<Option<Database>>>,
    db_path: PathBuf,
}

impl ObjectFinalize for RedbClient {
    fn finalize(self, _env: napi::Env) -> Result<()> {
        if let Some(db) = self.db.borrow_mut().take() {
            drop(db);
            std::fs::remove_file(&self.db_path).ok();
        }
        Ok(())
    }
}

#[napi]
impl RedbClient {
    pub(crate) fn new(db: Database, db_path: PathBuf) -> Self {
        Self {
            db: Rc::new(RefCell::new(Some(db))),
            db_path,
        }
    }

    /// Execute a closure with the db, returning an error if closed.
    fn with_db<T, F>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Database) -> Result<T>,
    {
        let db_ref = self.db.borrow();
        match db_ref.as_ref() {
            Some(db) => f(db),
            None => Err(Error::from_reason("RedbClient is closed")),
        }
    }

    /// Whether the session has been closed
    #[napi(getter)]
    pub fn is_closed(&self) -> bool {
        self.db.borrow().is_none()
    }

    /// Close the session, releasing all resources.
    /// Safe to call multiple times (idempotent).
    #[napi]
    pub fn close(&self) -> Result<()> {
        if let Some(db) = self.db.borrow_mut().take() {
            drop(db);
            std::fs::remove_file(&self.db_path).ok();
        }
        Ok(())
    }

    /// Get value at key
    #[napi]
    pub fn get(&self, key: String) -> Result<Option<Buffer>> {
        self.with_db(|db| {
            let rtxn = db
                .begin_read()
                .map_err(|e| Error::from_reason(e.to_string()))?;

            let table = rtxn
                .open_table(TABLE)
                .map_err(|e| Error::from_reason(e.to_string()))?;

            match table.get(key.as_str()) {
                Ok(Some(guard)) => Ok(Some(Buffer::from(guard.value().to_vec()))),
                Ok(None) => Ok(None),
                Err(e) => Err(Error::from_reason(e.to_string())),
            }
        })
    }

    /// Get all keys with prefix (for record key enumeration)
    #[napi]
    pub fn keys_with_prefix(&self, prefix: String) -> Result<Vec<String>> {
        self.with_db(|db| {
            let rtxn = db
                .begin_read()
                .map_err(|e| Error::from_reason(e.to_string()))?;

            let table = rtxn
                .open_table(TABLE)
                .map_err(|e| Error::from_reason(e.to_string()))?;

            let mut keys = Vec::new();
            let range = table
                .range(prefix.as_str()..)
                .map_err(|e| Error::from_reason(e.to_string()))?;
            for entry in range {
                let (k, _) = entry.map_err(|e| Error::from_reason(e.to_string()))?;
                let key_str = k.value();
                if !key_str.starts_with(&prefix) {
                    break;
                }
                keys.push(key_str.to_string());
            }
            Ok(keys)
        })
    }
}
