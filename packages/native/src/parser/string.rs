use super::JsonParser;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::schema::StringConstraints;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;
use std::simd::{cmp::SimdPartialEq, cmp::SimdPartialOrd, u8x16};

// Phase 1 result: where the string ends and where escapes are
struct ScanResult {
    end_pos: usize,
    escapes: Vec<usize>,
}

// Phase 1 error: position and the problematic byte (0xFF = unterminated)
type ScanError = (usize, u8);

/// Hex digit decoder: byte -> value (0-15), or 0xFF if invalid
#[rustfmt::skip]
static HEX_DECODE: [u8; 256] = [
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
  0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
];

/// Simple escape decoder: byte -> unescaped char, or 0 if invalid/special
#[rustfmt::skip]
static ESCAPE_DECODE: [u8; 256] = {
  let mut table: [u8; 256] = [0u8; 256];
  table[b'\"' as usize]  = b'\"';
  table[b'\\' as usize] = b'\\';
  table[b'/' as usize]  = b'/';
  table[b'b' as usize]  = 0x08;
  table[b'f' as usize]  = 0x0C;
  table[b'n' as usize]  = b'\n';
  table[b'r' as usize]  = b'\r';
  table[b't' as usize]  = b'\t';
  table
};

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_string<E: StorageEncoder>(
        &mut self,
        encoder: &mut E,
        constraints: &StringConstraints,
    ) -> Result<(), AtcharaError> {
        let line = self.line();
        let col = self.column();
        let s = Self::parse_string_value(self).await?;

        if constraints.min.is_some() || constraints.max.is_some() {
            let char_count = s.chars().count();
            if let Some(min) = constraints.min
                && char_count < min
            {
                return Err(AtcharaError::ValidationError {
                    expected: format!("string with at least {} characters", min),
                    found: format!("{} characters", char_count),
                    line,
                    column: col,
                });
            }
            if let Some(max) = constraints.max
                && char_count > max
            {
                return Err(AtcharaError::ValidationError {
                    expected: format!("string with at most {} characters", max),
                    found: format!("{} characters", char_count),
                    line,
                    column: col,
                });
            }
        }

        if let Some(ref pattern) = constraints.pattern
            && !pattern.is_match(&s)
        {
            let truncated = truncate_string(&s, 50);
            return Err(AtcharaError::ValidationError {
                expected: format!("string matching pattern /{}/", pattern.as_str()),
                found: format!("\"{}\"", truncated),
                line,
                column: col,
            });
        }

        encoder.write_string(&s);
        Ok(())
    }

    pub async fn parse_string_value(&mut self) -> Result<String, AtcharaError> {
        // Pre-buffer enough for one SIMD chunk so scan_simd can execute immediately
        self.context.ensure_data(16).await;
        let line = self.line();
        let col = self.column();

        // Expect opening quote
        match self.context.peek_byte() {
            Some(b'"') => {
                self.context.advance_byte();
                self.track(false);
            }
            Some(b) => {
                return Err(AtcharaError::UnexpectedCharacter {
                    char: b as char,
                    line,
                    column: col,
                });
            }
            None => return Err(AtcharaError::UnexpectedEof),
        }

        // Scan for closing quote, yielding for more data if string spans chunks
        loop {
            let bytes = self.context.remaining();
            match scan_simd(bytes) {
                Ok(scan) => {
                    let content_col = col + 1;
                    let result = if scan.escapes.is_empty() {
                        build_no_escapes(bytes, scan.end_pos).map_err(|utf8_pos| {
                            AtcharaError::UnexpectedCharacter {
                                char: bytes[utf8_pos] as char,
                                line,
                                column: content_col + utf8_pos,
                            }
                        })?
                    } else {
                        build_with_escapes(bytes, scan.end_pos, &scan.escapes, line, content_col)?
                    };
                    self.context.advance_bytes(scan.end_pos + 1);
                    self.track_span(scan.end_pos + 1, 0, 0);
                    return Ok(result);
                }
                Err((_, 0xFF)) => {
                    // String not terminated in available data.
                    // Sync: ensure_data is no-op, remaining won't grow -> EOF.
                    // Gen: yield for more data, then rescan.
                    let current_len = bytes.len();
                    // Grow by a full SIMD chunk to reduce yield frequency
                    self.context.ensure_data(current_len + 16).await;
                    if self.context.remaining().len() <= current_len {
                        return Err(AtcharaError::UnexpectedEof);
                    }
                    continue;
                }
                Err((pos, byte)) => {
                    return Err(AtcharaError::UnexpectedCharacter {
                        char: byte as char,
                        line,
                        column: col + 1 + pos,
                    });
                }
            }
        }
    }
}

// ============================================================================
// Phase 1: Scan for string end, collect escape positions
// ============================================================================

/// Parse 4 hex digits into u16
#[inline(always)]
fn parse_hex4(bytes: &[u8]) -> Option<u16> {
    let d0 = HEX_DECODE[bytes[0] as usize];
    let d1 = HEX_DECODE[bytes[1] as usize];
    let d2 = HEX_DECODE[bytes[2] as usize];
    let d3 = HEX_DECODE[bytes[3] as usize];

    if (d0 | d1 | d2 | d3) > 15 {
        return None;
    }

    Some(((d0 as u16) << 12) | ((d1 as u16) << 8) | ((d2 as u16) << 4) | (d3 as u16))
}

/// Branchless computation of which positions follow odd-length backslash runs.
#[inline(always)]
fn compute_escaped_mask(backslash_mask: u16) -> u16 {
    if backslash_mask == 0 {
        return 0;
    }

    let starts = backslash_mask & !(backslash_mask << 1);

    const EVEN: u16 = 0x5555;
    const ODD: u16 = 0xAAAA;

    let even_ends = (starts & EVEN).wrapping_add(backslash_mask) & !backslash_mask;
    let odd_ends = (starts & ODD).wrapping_add(backslash_mask) & !backslash_mask;

    (even_ends & ODD) | (odd_ends & EVEN)
}

/// Extract escape positions from bitmask up to limit
#[inline(always)]
fn collect_escapes(mut mask: u16, base: usize, limit: usize, out: &mut Vec<usize>) {
    while mask != 0 {
        let offset = mask.trailing_zeros() as usize;
        if offset >= limit {
            break;
        }
        out.push(base + offset);
        mask &= !(3u16 << offset);
    }
}

fn scan_simd(bytes: &[u8]) -> Result<ScanResult, ScanError> {
    let mut pos = 0;
    let mut escapes = Vec::new();
    let mut carry = false;

    let quote_splat = u8x16::splat(b'\"');
    let backslash_splat = u8x16::splat(b'\\');
    let control_threshold = u8x16::splat(0x20);

    while pos + 16 <= bytes.len() {
        let chunk = u8x16::from_slice(&bytes[pos..pos + 16]);

        let quotes = chunk.simd_eq(quote_splat).to_bitmask() as u16;
        let backslashes = chunk.simd_eq(backslash_splat).to_bitmask() as u16;
        let controls = chunk.simd_lt(control_threshold).to_bitmask() as u16;

        let escaped = compute_escaped_mask(backslashes) | if carry { 1 } else { 0 };
        let real_quotes = quotes & !escaped;

        if real_quotes != 0 {
            let quote_pos = real_quotes.trailing_zeros() as usize;

            let controls_before = controls & ((1u16 << quote_pos) - 1);
            if controls_before != 0 {
                let ctrl_pos = controls_before.trailing_zeros() as usize;
                return Err((pos + ctrl_pos, bytes[pos + ctrl_pos]));
            }

            collect_escapes(backslashes, pos, quote_pos, &mut escapes);
            return Ok(ScanResult {
                end_pos: pos + quote_pos,
                escapes,
            });
        }

        if controls != 0 {
            let ctrl_pos = controls.trailing_zeros() as usize;
            return Err((pos + ctrl_pos, bytes[pos + ctrl_pos]));
        }

        if backslashes != 0 {
            collect_escapes(backslashes, pos, 16, &mut escapes);
            carry = (backslashes & 0x8000) != 0;
        } else {
            carry = false;
        }

        pos += 16;
    }

    scan_scalar(&bytes[pos..], pos, escapes, carry)
}

fn scan_scalar(
    bytes: &[u8],
    base: usize,
    mut escapes: Vec<usize>,
    skip_first: bool,
) -> Result<ScanResult, ScanError> {
    let mut i = if skip_first && !bytes.is_empty() {
        1
    } else {
        0
    };

    while i < bytes.len() {
        let b = bytes[i];
        match b {
            b'\"' => {
                return Ok(ScanResult {
                    end_pos: base + i,
                    escapes,
                });
            }
            b'\\' => {
                escapes.push(base + i);
                i += 2;
            }
            0x00..=0x1F => return Err((base + i, b)),
            _ => i += 1,
        }
    }

    Err((base + bytes.len(), 0xFF))
}

// ============================================================================
// Phase 2: Build string from scan result
// ============================================================================

#[inline(always)]
fn build_no_escapes(bytes: &[u8], end: usize) -> Result<String, usize> {
    simdutf8::compat::from_utf8(&bytes[..end])
        .map(|s| s.to_string())
        .map_err(|e| e.valid_up_to())
}

fn build_with_escapes(
    bytes: &[u8],
    end: usize,
    escapes: &[usize],
    line: usize,
    col: usize,
) -> Result<String, AtcharaError> {
    let mut result = String::with_capacity(end);
    let mut pos = 0;

    for &esc in escapes {
        if esc < pos {
            continue;
        }

        if esc > pos {
            let seg = std::str::from_utf8(&bytes[pos..esc]).map_err(|e| {
                AtcharaError::UnexpectedCharacter {
                    char: bytes[pos + e.valid_up_to()] as char,
                    line,
                    column: col + pos + e.valid_up_to(),
                }
            })?;
            result.push_str(seg);
        }

        let escaped_byte = *bytes.get(esc + 1).ok_or(AtcharaError::UnexpectedEof)?;

        if escaped_byte == b'u' {
            let (c, consumed) = parse_unicode(&bytes[esc + 2..], line, col + esc + 2)?;
            result.push(c);
            pos = esc + 2 + consumed;
        } else {
            let decoded = ESCAPE_DECODE[escaped_byte as usize];
            if decoded == 0 {
                return Err(AtcharaError::UnexpectedCharacter {
                    char: escaped_byte as char,
                    line,
                    column: col + esc + 1,
                });
            }
            result.push(decoded as char);
            pos = esc + 2;
        }
    }

    if pos < end {
        let seg = std::str::from_utf8(&bytes[pos..end]).map_err(|e| {
            AtcharaError::UnexpectedCharacter {
                char: bytes[pos + e.valid_up_to()] as char,
                line,
                column: col + pos + e.valid_up_to(),
            }
        })?;
        result.push_str(seg);
    }

    Ok(result)
}

/// Parse \uXXXX, handling surrogate pairs. Returns (char, bytes_consumed).
fn parse_unicode(bytes: &[u8], line: usize, col: usize) -> Result<(char, usize), AtcharaError> {
    if bytes.len() < 4 {
        return Err(AtcharaError::ValidationError {
            expected: "4 hexadecimal digits".to_string(),
            found: "end of input".to_string(),
            line,
            column: col,
        });
    }

    let code = parse_hex4(bytes).ok_or_else(|| AtcharaError::ValidationError {
        expected: "hexadecimal digit (0-9, a-f, A-F)".to_string(),
        found: format!("'{}'", bytes[0] as char),
        line,
        column: col,
    })?;

    // High surrogate: expect low surrogate
    if (0xD800..=0xDBFF).contains(&code) {
        if bytes.len() < 10 || bytes[4] != b'\\' || bytes[5] != b'u' {
            return Err(AtcharaError::ValidationError {
                expected: "low surrogate escape (\\uDC00-\\uDFFF)".to_string(),
                found: if bytes.len() > 4 {
                    format!("'{}'", bytes[4] as char)
                } else {
                    "end of input".to_string()
                },
                line,
                column: col + 4,
            });
        }

        let low = parse_hex4(&bytes[6..]).ok_or_else(|| AtcharaError::ValidationError {
            expected: "hexadecimal digit (0-9, a-f, A-F)".to_string(),
            found: format!("'{}'", bytes[6] as char),
            line,
            column: col + 6,
        })?;

        if !(0xDC00..=0xDFFF).contains(&low) {
            return Err(AtcharaError::ValidationError {
                expected: "low surrogate (U+DC00-U+DFFF)".to_string(),
                found: format!("U+{:04X}", low),
                line,
                column: col + 6,
            });
        }

        let combined = 0x10000 + (((code as u32 - 0xD800) << 10) | (low as u32 - 0xDC00));
        Ok((char::from_u32(combined).unwrap(), 10))
    } else if (0xDC00..=0xDFFF).contains(&code) {
        Err(AtcharaError::ValidationError {
            expected: "valid Unicode code point".to_string(),
            found: format!("U+{:04X}", code),
            line,
            column: col,
        })
    } else {
        Ok((char::from_u32(code as u32).unwrap(), 4))
    }
}

/// Truncate a string to approximately `max_chars` characters, appending "..." if truncated.
fn truncate_string(s: &str, max_chars: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max_chars {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max_chars).collect();
        format!("{truncated}...")
    }
}
