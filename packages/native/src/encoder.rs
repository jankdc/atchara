//! StorageEncoder trait and handle types for encoding values to storage.

/// Core trait for encoding values to storage.
///
/// Handles are passed by reference - never cloned or copied between functions.
/// Each backend stores its own state in its handle types.
pub trait StorageEncoder {
    type ArrayHandle;
    type ObjectHandle;
    type RecordHandle;
    type Snapshot;

    // ========================================================================
    // Primitives
    // ========================================================================

    fn write_null_flag(&mut self);
    fn write_present_flag(&mut self);
    fn write_boolean(&mut self, value: bool);
    fn write_number(&mut self, value: f64);
    fn write_string(&mut self, value: &str);

    // ========================================================================
    // Array lifecycle
    // ========================================================================

    /// Begin encoding an array. Returns handle for tracking.
    fn begin_array(&mut self) -> Self::ArrayHandle;
    fn end_array(&mut self, handle: &mut Self::ArrayHandle, count: u32);

    fn begin_array_element(&mut self, handle: &mut Self::ArrayHandle, index: usize);
    fn end_array_element(&mut self, handle: &mut Self::ArrayHandle);

    // ========================================================================
    // Tuple lifecycle (no length prefix - count from schema)
    // ========================================================================

    fn begin_tuple(&mut self, len: usize);
    fn end_tuple(&mut self, count: u32);

    fn begin_tuple_element(&mut self, index: usize);
    fn end_tuple_element(&mut self);

    // ========================================================================
    // Object lifecycle
    // ========================================================================

    fn begin_object(&mut self, field_count: usize) -> Self::ObjectHandle;
    fn end_object(&mut self, handle: &mut Self::ObjectHandle);

    fn begin_object_field(
        &mut self,
        handle: &mut Self::ObjectHandle,
        field_index: usize,
        field_key: &str,
    );
    fn end_object_field(&mut self, handle: &mut Self::ObjectHandle);

    fn mark_field_absent(&mut self, handle: &mut Self::ObjectHandle, field_index: usize);

    // ========================================================================
    // Record lifecycle
    // ========================================================================

    fn begin_record(&mut self) -> Self::RecordHandle;
    fn end_record(&mut self, handle: &mut Self::RecordHandle);

    fn begin_record_entry(&mut self, handle: &mut Self::RecordHandle, key: &str);
    fn end_record_entry(&mut self, handle: &mut Self::RecordHandle);

    // ========================================================================
    // Union
    // ========================================================================

    fn begin_variant(&mut self, index: usize);
    fn end_variant(&mut self);

    // ========================================================================
    // Backtracking (for union parsing)
    // ========================================================================

    fn snapshot(&self) -> Self::Snapshot;
    fn restore(&mut self, snapshot: Self::Snapshot);

    // ========================================================================
    // Indexed value lifecycle
    // ========================================================================

    fn begin_indexed(&mut self, _schema_index: usize);
    fn end_indexed(&mut self, _schema_index: usize);

    /// Finalize encoding.
    fn finish(&mut self);
}

// ============================================================================
// Handle types for buffer backend
// ============================================================================

/// Array handle tracks position of length placeholder for backpatching.
pub struct ArrayHandle {
    pub(crate) length_pos: usize,
}

/// Object handle tracks offset table and field positions.
pub struct ObjectHandle {
    pub(crate) offset_table_start: usize,
    pub(crate) values_start: usize,
    pub(crate) field_offsets: Vec<Option<u32>>,
}

/// Record handle tracks hash entries for sorting.
pub struct RecordHandle {
    pub(crate) count_pos: usize,
    pub(crate) kv_size_pos: usize,
    pub(crate) kv_data_start: usize,
    pub(crate) entries: Vec<(u64, u32)>, // (hash, offset) pairs
}
