//! ByteWriter for binary encoding.

/// Low-level byte writer for binary encoding.
/// All multi-byte values use big-endian (network byte order).
pub struct ByteWriter<'a> {
    buf: &'a mut Vec<u8>,
}

impl<'a> ByteWriter<'a> {
    pub fn new(buf: &'a mut Vec<u8>) -> Self {
        Self { buf }
    }

    // ========================================================================
    // Primitive Writes (all big-endian)
    // ========================================================================

    #[inline]
    pub fn write_u8(&mut self, value: u8) {
        self.buf.push(value);
    }

    #[inline]
    pub fn write_u16(&mut self, value: u16) {
        self.buf.extend_from_slice(&value.to_be_bytes());
    }

    #[inline]
    pub fn write_u32(&mut self, value: u32) {
        self.buf.extend_from_slice(&value.to_be_bytes());
    }

    #[inline]
    pub fn write_u64(&mut self, value: u64) {
        self.buf.extend_from_slice(&value.to_be_bytes());
    }

    /// Write f64 with optimized unsafe copy for performance
    #[inline]
    pub fn write_f64(&mut self, value: f64) {
        let bytes = value.to_be_bytes();
        let len = self.buf.len();
        self.buf.reserve(8);

        // SAFETY: We just reserved 8 bytes, so this is safe
        unsafe {
            let dst = self.buf.as_mut_ptr().add(len);
            dst.copy_from_nonoverlapping(bytes.as_ptr(), 8);
            self.buf.set_len(len + 8);
        }
    }

    /// Write a length-prefixed string (u32 length + UTF-8 bytes)
    #[inline]
    pub fn write_str(&mut self, s: &str) {
        self.write_u32(s.len() as u32);
        self.buf.extend_from_slice(s.as_bytes());
    }

    #[inline]
    pub fn write_bytes(&mut self, bytes: &[u8]) {
        self.buf.extend_from_slice(bytes);
    }

    // ========================================================================
    // Buffer Management
    // ========================================================================

    #[inline]
    pub fn buffer_len(&self) -> usize {
        self.buf.len()
    }

    #[inline]
    pub fn truncate(&mut self, len: usize) {
        self.buf.truncate(len);
    }

    /// Overwrite a u32 value at a specific position (for backpatching)
    #[inline]
    pub fn overwrite_u32(&mut self, pos: usize, value: u32) {
        self.buf[pos..pos + 4].copy_from_slice(&value.to_be_bytes());
    }
}
