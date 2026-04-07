//! Full-document parsing: DirectContext (borrowed byte slice) + BufferEncoder.

use napi_derive::napi;

use crate::bytes::ByteWriter;
use crate::encoder::{ArrayHandle, ObjectHandle, RecordHandle, StorageEncoder};
use crate::hash::fnv1a_64;
use crate::input::ParserContext;

// ============================================================================
// Constants
// ============================================================================

/// Sentinel value for absent optional fields in object offset tables
#[napi]
pub const ABSENT_FIELD_MARKER: u32 = 0xFFFFFFFF;

/// Flag indicating null value in nullable types
#[napi]
pub const NULL_FLAG: u8 = 0x00;

/// Flag indicating value is present in nullable types
#[napi]
pub const PRESENT_FLAG: u8 = 0x01;

// ============================================================================
// DirectContext - borrowed byte slice for full-document parsing
// ============================================================================

pub struct DirectContext<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> DirectContext<'a> {
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            bytes: input,
            position: 0,
        }
    }

    /// All data is in memory — nothing to do.
    #[inline(always)]
    pub fn ensure_data(&self, _n: usize) {}

    #[inline(always)]
    pub fn enter_union(&mut self) {
        // No-op for sync: no buffer management needed
    }

    #[inline(always)]
    pub fn exit_union(&mut self) {
        // No-op for sync
    }

    #[inline(always)]
    pub fn should_yield_elements(&self) -> bool {
        false
    }

    #[inline(always)]
    pub fn set_yield_elements(&mut self, _val: bool) {}

    #[inline(always)]
    pub fn is_aborted(&self) -> bool {
        false
    }

    #[inline(always)]
    pub fn yield_element(&mut self, _index: u32) {}
}

impl<'a> ParserContext for DirectContext<'a> {
    #[inline(always)]
    fn peek_byte(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    #[inline(always)]
    fn remaining(&self) -> &[u8] {
        &self.bytes[self.position..]
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
        self.position = pos;
    }

    #[inline(always)]
    fn is_eof(&self) -> bool {
        self.position >= self.bytes.len()
    }

    #[inline(always)]
    fn slice_bytes(&self, start: usize, end: usize) -> &[u8] {
        &self.bytes[start..end]
    }
}

// ============================================================================
// BufferEncoder - schema-driven binary encoder for JSON values
// ============================================================================

/// Buffer-based encoder implementing the StorageEncoder trait.
/// Uses backpatching for arrays, objects, and records.
pub struct BufferEncoder<'a, 'w> {
    writer: &'a mut ByteWriter<'w>,
    offsets: Vec<(usize, u32)>, // (schema_index, offset) pairs
}

impl<'a, 'w> BufferEncoder<'a, 'w> {
    pub fn new(writer: &'a mut ByteWriter<'w>) -> Self {
        Self {
            writer,
            offsets: Vec::new(),
        }
    }
}

impl StorageEncoder for BufferEncoder<'_, '_> {
    type ArrayHandle = ArrayHandle;
    type ObjectHandle = ObjectHandle;
    type RecordHandle = RecordHandle;
    type Snapshot = (usize, usize);

    #[inline]
    fn write_null_flag(&mut self) {
        self.writer.write_u8(NULL_FLAG);
    }

    #[inline]
    fn write_present_flag(&mut self) {
        self.writer.write_u8(PRESENT_FLAG);
    }

    #[inline]
    fn write_boolean(&mut self, value: bool) {
        self.writer.write_u8(if value { 0x01 } else { 0x00 });
    }

    #[inline]
    fn write_number(&mut self, value: f64) {
        self.writer.write_f64(value);
    }

    #[inline]
    fn write_string(&mut self, s: &str) {
        self.writer.write_str(s);
    }

    #[inline]
    fn begin_array(&mut self) -> ArrayHandle {
        let length_pos = self.writer.buffer_len();
        self.writer.write_u32(0); // placeholder
        ArrayHandle { length_pos }
    }

    #[inline]
    fn end_array(&mut self, handle: &mut ArrayHandle, count: u32) {
        self.writer.overwrite_u32(handle.length_pos, count);
    }

    #[inline]
    fn begin_array_element(&mut self, _handle: &mut ArrayHandle, _index: usize) {
        // Buffer encoder doesn't need element tracking
    }

    #[inline]
    fn end_array_element(&mut self, _handle: &mut ArrayHandle) {
        // Buffer encoder doesn't need element tracking
    }

    #[inline]
    fn begin_tuple(&mut self, _len: usize) {
        // Buffer encoder doesn't write length for tuples (count from schema)
    }

    #[inline]
    fn end_tuple(&mut self, _count: u32) {
        // Buffer encoder doesn't write length for tuples (count from schema)
    }

    #[inline]
    fn begin_tuple_element(&mut self, _index: usize) {
        // Buffer encoder doesn't need element tracking (no length prefix)
    }

    #[inline]
    fn end_tuple_element(&mut self) {
        // Buffer encoder doesn't need element tracking
    }

    #[inline]
    fn begin_object(&mut self, field_count: usize) -> ObjectHandle {
        let offset_table_start = self.writer.buffer_len();

        // Reserve space for offset table (all fields initially absent)
        for _ in 0..field_count {
            self.writer.write_u32(ABSENT_FIELD_MARKER);
        }

        ObjectHandle {
            offset_table_start,
            values_start: self.writer.buffer_len(),
            field_offsets: vec![None; field_count],
        }
    }

    #[inline]
    fn end_object(&mut self, handle: &mut ObjectHandle) {
        // Backpatch offset table with actual offsets
        for (i, offset) in handle.field_offsets.iter().enumerate() {
            let pos = handle.offset_table_start + i * 4;
            let value = offset.unwrap_or(ABSENT_FIELD_MARKER);
            self.writer.overwrite_u32(pos, value);
        }
    }

    #[inline]
    fn begin_object_field(
        &mut self,
        handle: &mut ObjectHandle,
        field_index: usize,
        _field_key: &str,
    ) {
        let relative_offset = (self.writer.buffer_len() - handle.values_start) as u32;
        handle.field_offsets[field_index] = Some(relative_offset);
    }

    #[inline]
    fn end_object_field(&mut self, _handle: &mut ObjectHandle) {
        // Buffer encoder doesn't need field tracking
    }

    #[inline]
    fn mark_field_absent(&mut self, handle: &mut ObjectHandle, field_index: usize) {
        handle.field_offsets[field_index] = None;
    }

    #[inline]
    fn begin_record(&mut self) -> RecordHandle {
        let count_pos = self.writer.buffer_len();
        self.writer.write_u32(0); // placeholder for count

        let kv_size_pos = self.writer.buffer_len();
        self.writer.write_u32(0); // placeholder for kv_data_size

        RecordHandle {
            count_pos,
            kv_size_pos,
            kv_data_start: self.writer.buffer_len(),
            entries: Vec::new(),
        }
    }

    #[inline]
    fn end_record(&mut self, handle: &mut RecordHandle) {
        let kv_data_size = (self.writer.buffer_len() - handle.kv_data_start) as u32;

        // Sort by hash for binary search
        handle.entries.sort_unstable_by_key(|(hash, _)| *hash);

        // Write sorted hash index at the end
        for (hash, offset) in &handle.entries {
            self.writer.write_u64(*hash);
            self.writer.write_u32(*offset);
        }

        // Backpatch count and kv_data_size
        self.writer
            .overwrite_u32(handle.count_pos, handle.entries.len() as u32);
        self.writer.overwrite_u32(handle.kv_size_pos, kv_data_size);
    }

    #[inline]
    fn begin_record_entry(&mut self, handle: &mut RecordHandle, key: &str) {
        let hash = fnv1a_64(key.as_bytes());
        let entry_offset = self.writer.buffer_len() as u32;

        // Write key with length prefix
        self.writer.write_u16(key.len() as u16);
        self.writer.write_bytes(key.as_bytes());

        handle.entries.push((hash, entry_offset));
    }

    #[inline]
    fn end_record_entry(&mut self, _handle: &mut RecordHandle) {
        // Buffer encoder doesn't need entry tracking
    }

    #[inline]
    fn begin_variant(&mut self, index: usize) {
        self.writer.write_u8(index as u8);
    }

    #[inline]
    fn end_variant(&mut self) {
        // Buffer encoder doesn't need variant path tracking
    }

    #[inline]
    fn snapshot(&self) -> (usize, usize) {
        (self.writer.buffer_len(), self.offsets.len())
    }

    #[inline]
    fn restore(&mut self, (buf_len, offsets_len): (usize, usize)) {
        self.writer.truncate(buf_len);
        self.offsets.truncate(offsets_len);
    }

    #[inline]
    fn begin_indexed(&mut self, schema_index: usize) {
        self.offsets
            .push((schema_index, self.writer.buffer_len() as u32));
    }

    #[inline]
    fn end_indexed(&mut self, _schema_index: usize) {
        // Buffer encoder doesn't need to use this
    }

    #[inline]
    fn finish(&mut self) {
        self.offsets.sort_unstable_by_key(|(idx, _)| *idx);

        for (_, offset) in &self.offsets {
            self.writer.write_u32(*offset);
        }

        self.writer.write_u32(self.offsets.len() as u32);
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sync_basic() {
        let input = b"hello";
        let mut ctx = DirectContext::new(input);

        assert_eq!(ctx.peek_byte(), Some(b'h'));
        assert_eq!(ctx.position(), 0);
        assert!(!ctx.is_eof());

        ctx.advance_byte();
        assert_eq!(ctx.peek_byte(), Some(b'e'));
        assert_eq!(ctx.position(), 1);
    }

    #[test]
    fn test_sync_utf8() {
        let input = "hello 世界".as_bytes();
        let mut ctx = DirectContext::new(input);

        ctx.advance_bytes(6);
        assert!(ctx.peek_byte().unwrap() > 127);
    }

    #[test]
    fn test_sync_eof() {
        let input = b"ab";
        let mut ctx = DirectContext::new(input);

        assert!(!ctx.is_eof());
        ctx.advance_byte();
        assert!(!ctx.is_eof());
        ctx.advance_byte();
        assert!(ctx.is_eof());
    }

    #[test]
    fn test_sync_set_position() {
        let input = b"hello";
        let mut ctx = DirectContext::new(input);

        ctx.advance_bytes(3);
        assert_eq!(ctx.position(), 3);
        assert_eq!(ctx.peek_byte(), Some(b'l'));

        ctx.set_position(0);
        assert_eq!(ctx.position(), 0);
        assert_eq!(ctx.peek_byte(), Some(b'h'));
    }
}
