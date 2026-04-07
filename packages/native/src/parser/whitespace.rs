//! Whitespace skipping — unified SIMD-accelerated implementation for both contexts.
//!
//! Uses `#[convert_to_sync(StreamingContext => DirectContext<'_>)]` to generate sync and gen variants from a single async
//! implementation. Both paths get SIMD acceleration; the gen path yields at chunk
//! boundaries via `ensure_data`.

use std::simd::{cmp::SimdPartialEq, u8x16};

use crate::direct::DirectContext;
use crate::input::ParserContext;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

use super::JsonParser;

// ============================================================================
// Generic scalar whitespace skip (used as SIMD tail fallback)
// ============================================================================

impl<R: ParserContext> JsonParser<R> {
    pub fn parse_whitespace_scalar(&mut self) {
        loop {
            match self.context.peek_byte() {
                Some(ch) if CharClassifier::is_whitespace_fast(ch) => {
                    self.context.advance_byte();
                    self.track(ch == b'\n');
                }
                _ => break,
            }
        }
    }
}

// ============================================================================
// SIMD-accelerated whitespace skip
// ============================================================================

const SIMD_SPACE: u8x16 = u8x16::from_array([0x20; 16]);
const SIMD_TAB: u8x16 = u8x16::from_array([0x09; 16]);
const SIMD_LF: u8x16 = u8x16::from_array([0x0A; 16]);
const SIMD_CR: u8x16 = u8x16::from_array([0x0D; 16]);

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_whitespace(&mut self) {
        loop {
            self.context.ensure_data(16).await;

            // Fast path: most calls hit non-whitespace immediately
            if let Some(ch) = self.context.peek_byte() {
                if !CharClassifier::is_whitespace_fast(ch) {
                    return;
                }
            } else {
                return;
            }

            // SIMD path: process 16-byte chunks
            loop {
                let remaining = self.context.remaining();
                if remaining.len() < 16 {
                    break;
                }

                let chunk = u8x16::from_slice(&remaining[..16]);
                let is_space = chunk.simd_eq(SIMD_SPACE);
                let is_tab = chunk.simd_eq(SIMD_TAB);
                let is_lf = chunk.simd_eq(SIMD_LF);
                let is_cr = chunk.simd_eq(SIMD_CR);
                let whitespace_mask = (is_space | is_tab) | (is_lf | is_cr);
                let bitmask = whitespace_mask.to_bitmask() as u16;

                if bitmask == 0xFFFF {
                    let lf_bits = is_lf.to_bitmask() as u16;
                    let newline_count = lf_bits.count_ones() as usize;
                    let last_newline_offset =
                        15_usize.saturating_sub(lf_bits.leading_zeros() as usize);
                    let chars_after = 15 - last_newline_offset;
                    self.context.advance_bytes(16);
                    self.track_span(16, newline_count, chars_after);
                } else if bitmask == 0 {
                    break;
                } else {
                    let first_non_ws = bitmask.trailing_ones() as usize;
                    let lf_bits: u16 = is_lf.to_bitmask() as u16;
                    let relevant_lf_bits = lf_bits & ((1 << first_non_ws) - 1);
                    let newline_count = relevant_lf_bits.count_ones() as usize;
                    let last_newline_offset = (first_non_ws)
                        .saturating_sub(1)
                        .saturating_sub(relevant_lf_bits.leading_zeros() as usize);
                    let chars_after = first_non_ws.saturating_sub(last_newline_offset + 1);
                    self.context.advance_bytes(first_non_ws);
                    self.track_span(first_non_ws, newline_count, chars_after);
                    break;
                }
            }

            // Scalar fallback for < 16 byte tail
            self.parse_whitespace_scalar();

            // If stopped at a non-whitespace byte, done
            if self.context.peek_byte().is_some() {
                return;
            }

            // No data left — request a full SIMD chunk so the next iteration can use SIMD directly
            self.context.ensure_data(16).await;
            if self.context.peek_byte().is_none() {
                return;
            }
            // Got new data — loop back to try SIMD on it
        }
    }
}

// ============================================================================
// CharClassifier - branchless character classification
// ============================================================================

pub struct CharClassifier;

impl CharClassifier {
    #[rustfmt::skip]
    const CHAR_CLASS_TABLE: [u8; 256] = [
    // 0x00-0x0F: Control characters
    0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 0, // 0x00-0x0F (tab=1, lf=1, cr=1)
    // 0x10-0x1F: Control characters
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x10-0x1F
    // 0x20-0x2F
    1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0, 0, // 0x20-0x2F (space=1, "=2, comma=9)
    // 0x30-0x3F (digits and symbols)
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, // 0x30-0x3F (colon=8)
    // 0x40-0x4F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x40-0x4F
    // 0x50-0x5F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 3, 7, 0, 0, // 0x50-0x5F (bracket=[=6, backslash=3, ]=7)
    // 0x60-0x6F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x60-0x6F
    // 0x70-0x7F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4, 0, 5, 0, 0, // 0x70-0x7F (brace={=4, }=5)
    // 0x80-0xFF: Extended ASCII (assume regular)
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x80-0x8F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0x90-0x9F
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xA0-0xAF
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xB0-0xBF
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xC0-0xCF
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xD0-0xDF
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xE0-0xEF
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0xF0-0xFF
    ];

    /// Fast check if character is whitespace using lookup table
    #[inline(always)]
    pub fn is_whitespace_fast(byte: u8) -> bool {
        Self::CHAR_CLASS_TABLE[byte as usize] == 1
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whitespace_fast() {
        assert!(CharClassifier::is_whitespace_fast(b' '));
        assert!(CharClassifier::is_whitespace_fast(b'\t'));
        assert!(!CharClassifier::is_whitespace_fast(b'a'));
        assert!(!CharClassifier::is_whitespace_fast(b'{'));
    }

    #[test]
    fn test_simd_whitespace_empty() {
        let ctx = DirectContext::new(b"");
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
        assert!(parser.context.is_eof());
    }

    #[test]
    fn test_simd_whitespace_no_whitespace() {
        let ctx = DirectContext::new(b"abc");
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
        assert_eq!(parser.context.position(), 0);
    }

    #[test]
    fn test_simd_whitespace_only_spaces() {
        let ctx = DirectContext::new(b"    abc");
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
        assert_eq!(parser.context.position(), 4);
    }

    #[test]
    fn test_simd_whitespace_mixed() {
        let ctx = DirectContext::new(b" \t\n\rabc");
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
        assert_eq!(parser.context.position(), 4);
    }

    #[test]
    fn test_simd_whitespace_large_chunk() {
        // Test with > 16 bytes of whitespace to trigger SIMD path
        let ctx = DirectContext::new(b"                  abc"); // 18 spaces
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
        assert_eq!(parser.context.position(), 18);
    }

    #[test]
    fn test_simd_whitespace_line_tracking() {
        let ctx = DirectContext::new(b"  \n  abc");
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
        assert_eq!(parser.line(), 2);
        assert_eq!(parser.column(), 3);
    }

    #[test]
    fn test_simd_whitespace_all_types() {
        // Test all 4 RFC 8259 whitespace characters
        let ctx = DirectContext::new(b" \t\n\r \t\n\rabc");
        let mut parser = JsonParser::new(ctx);
        parser.parse_whitespace();
    }

    #[test]
    fn test_line_column_tracking() {
        let ctx = DirectContext::new(b"line1\nline2");
        let mut parser = JsonParser::new(ctx);

        assert_eq!(parser.line(), 1);
        assert_eq!(parser.column(), 1);

        for _ in 0..5 {
            parser.context.advance_byte();
            parser.track(false);
        }

        assert_eq!(parser.line(), 1);
        assert_eq!(parser.column(), 6);

        parser.context.advance_byte();
        parser.track(true);
        assert_eq!(parser.line(), 2);
        assert_eq!(parser.column(), 1);
    }

    #[test]
    fn test_track_span() {
        let ctx = DirectContext::new(b"abc\ndef\nghi");
        let mut parser = JsonParser::new(ctx);

        parser.context.advance_bytes(8);
        parser.track_span(8, 2, 0);

        assert_eq!(parser.line(), 3);
        assert_eq!(parser.column(), 1);

        parser.context.advance_bytes(3);
        parser.track_span(3, 0, 0);

        assert_eq!(parser.line(), 3);
        assert_eq!(parser.column(), 4);
    }
}
