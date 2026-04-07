use std::fmt;

use napi_derive::napi;

use crate::bytes::ByteWriter;

/// Custom error type for parsing operations
#[derive(Debug, Clone)]
pub enum AtcharaError {
    // ============================================================================
    // Lexing Errors
    // ============================================================================
    /// Unexpected end of input
    UnexpectedEof,

    /// Invalid UTF-8 sequence with location
    InvalidUtf8 {
        message: String,
        line: usize,
        column: usize,
    },

    /// Unexpected character in input
    UnexpectedCharacter {
        char: char,
        line: usize,
        column: usize,
    },

    // ============================================================================
    // Parsing Errors
    // ============================================================================
    /// Validation error: expected vs found with location
    ValidationError {
        expected: String,
        found: String,
        line: usize,
        column: usize,
    },

    /// Missing required field in object
    MissingRequired {
        field: String,
        line: usize,
        column: usize,
    },

    /// Unexpected field in object
    UnexpectedField {
        field: String,
        line: usize,
        column: usize,
    },

    /// No union variant matched the input
    UnionNoMatch {
        variant_errors: Vec<AtcharaError>,
        line: usize,
        column: usize,
    },

    // ============================================================================
    // Schema Deserialization Errors
    // ============================================================================
    /// Invalid schema structure during deserialization
    InvalidSchema(String),
}

impl AtcharaError {
    /// Get the error code string for this error variant
    pub fn code(&self) -> &'static str {
        match self {
            AtcharaError::UnexpectedEof => "UNEXPECTED_EOF",
            AtcharaError::InvalidUtf8 { .. } => "INVALID_UTF8",
            AtcharaError::UnexpectedCharacter { .. } => "UNEXPECTED_CHARACTER",
            AtcharaError::ValidationError { .. } => "VALIDATION_ERROR",
            AtcharaError::MissingRequired { .. } => "MISSING_REQUIRED",
            AtcharaError::UnexpectedField { .. } => "UNEXPECTED_FIELD",
            AtcharaError::UnionNoMatch { .. } => "UNION_NO_MATCH",
            AtcharaError::InvalidSchema(_) => "INVALID_SCHEMA",
        }
    }

    /// Get position (line, column) if this error has location information.
    pub fn position(&self) -> Option<(usize, usize)> {
        match self {
            AtcharaError::UnexpectedEof => None,
            AtcharaError::InvalidUtf8 { line, column, .. } => Some((*line, *column)),
            AtcharaError::UnexpectedCharacter { line, column, .. } => Some((*line, *column)),
            AtcharaError::ValidationError { line, column, .. } => Some((*line, *column)),
            AtcharaError::MissingRequired { line, column, .. } => Some((*line, *column)),
            AtcharaError::UnexpectedField { line, column, .. } => Some((*line, *column)),
            AtcharaError::UnionNoMatch { line, column, .. } => Some((*line, *column)),
            AtcharaError::InvalidSchema(_) => None,
        }
    }
}

impl fmt::Display for AtcharaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AtcharaError::InvalidUtf8 {
                message,
                line,
                column,
            } => {
                write!(
                    f,
                    "Invalid UTF-8 at line {line}, column {column}: {message}"
                )
            }
            AtcharaError::ValidationError {
                expected,
                found,
                line,
                column,
            } => {
                write!(
                    f,
                    "Expected {expected}, found {found} at line {line}, column {column}"
                )
            }
            AtcharaError::MissingRequired {
                field,
                line,
                column,
            } => {
                write!(
                    f,
                    "Missing required field '{field}' in object at line {line}, column {column}"
                )
            }
            AtcharaError::UnionNoMatch {
                variant_errors,
                line,
                column,
            } => {
                write!(
                    f,
                    "No union variant matched at line {line}, column {column}. Variant errors: "
                )?;
                for (i, err) in variant_errors.iter().enumerate() {
                    if i > 0 {
                        write!(f, "; ")?;
                    }
                    write!(f, "[{}] {}", i, err)?;
                }
                Ok(())
            }
            AtcharaError::UnexpectedField {
                field,
                line,
                column,
            } => {
                write!(
                    f,
                    "Unexpected field '{field}' at line {line}, column {column}"
                )
            }
            AtcharaError::UnexpectedCharacter { char, line, column } => {
                write!(
                    f,
                    "Unexpected character '{char}' at line {line}, column {column}"
                )
            }
            AtcharaError::UnexpectedEof => write!(f, "Unexpected end of input"),
            AtcharaError::InvalidSchema(msg) => write!(f, "Invalid schema: {msg}"),
        }
    }
}

impl std::error::Error for AtcharaError {}

// ============================================================================
// Binary error encoding
// ============================================================================

#[napi]
pub const ERROR_CODE_UNEXPECTED_EOF: u8 = 0;

#[napi]
pub const ERROR_CODE_INVALID_UTF8: u8 = 1;

#[napi]
pub const ERROR_CODE_UNEXPECTED_CHARACTER: u8 = 2;

#[napi]
pub const ERROR_CODE_VALIDATION_ERROR: u8 = 3;

#[napi]
pub const ERROR_CODE_MISSING_REQUIRED: u8 = 4;

#[napi]
pub const ERROR_CODE_UNEXPECTED_FIELD: u8 = 5;

#[napi]
pub const ERROR_CODE_UNION_NO_MATCH: u8 = 6;

#[napi]
pub const ERROR_CODE_INVALID_SCHEMA: u8 = 7;

/// Encode an AtcharaError into a ByteWriter.
pub fn encode_error(error: &AtcharaError, writer: &mut ByteWriter) {
    match error {
        AtcharaError::UnexpectedEof => {
            writer.write_u8(ERROR_CODE_UNEXPECTED_EOF);
        }

        AtcharaError::InvalidUtf8 {
            message,
            line,
            column,
        } => {
            writer.write_u8(ERROR_CODE_INVALID_UTF8);
            writer.write_u32(*line as u32);
            writer.write_u32(*column as u32);
            writer.write_str(message);
        }

        AtcharaError::UnexpectedCharacter { char, line, column } => {
            writer.write_u8(ERROR_CODE_UNEXPECTED_CHARACTER);
            writer.write_u32(*line as u32);
            writer.write_u32(*column as u32);
            let char_str = char.to_string();
            writer.write_str(&char_str);
        }

        AtcharaError::ValidationError {
            expected,
            found,
            line,
            column,
        } => {
            writer.write_u8(ERROR_CODE_VALIDATION_ERROR);
            writer.write_u32(*line as u32);
            writer.write_u32(*column as u32);
            writer.write_str(expected);
            writer.write_str(found);
        }

        AtcharaError::MissingRequired {
            field,
            line,
            column,
        } => {
            writer.write_u8(ERROR_CODE_MISSING_REQUIRED);
            writer.write_u32(*line as u32);
            writer.write_u32(*column as u32);
            writer.write_str(field);
        }

        AtcharaError::UnexpectedField {
            field,
            line,
            column,
        } => {
            writer.write_u8(ERROR_CODE_UNEXPECTED_FIELD);
            writer.write_u32(*line as u32);
            writer.write_u32(*column as u32);
            writer.write_str(field);
        }

        AtcharaError::UnionNoMatch {
            variant_errors,
            line,
            column,
        } => {
            writer.write_u8(ERROR_CODE_UNION_NO_MATCH);
            writer.write_u32(*line as u32);
            writer.write_u32(*column as u32);
            writer.write_u32(variant_errors.len() as u32);
            for nested_error in variant_errors {
                encode_error(nested_error, writer);
            }
        }

        AtcharaError::InvalidSchema(message) => {
            writer.write_u8(ERROR_CODE_INVALID_SCHEMA);
            writer.write_str(message);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_unexpected_eof() {
        let mut buf = Vec::new();
        let mut writer = ByteWriter::new(&mut buf);
        encode_error(&AtcharaError::UnexpectedEof, &mut writer);
        assert_eq!(buf, vec![0x00]);
    }

    #[test]
    fn test_encode_validation_error() {
        let mut buf = Vec::new();
        let mut writer = ByteWriter::new(&mut buf);
        encode_error(
            &AtcharaError::ValidationError {
                expected: "string".to_string(),
                found: "number".to_string(),
                line: 1,
                column: 5,
            },
            &mut writer,
        );

        assert_eq!(buf[0], ERROR_CODE_VALIDATION_ERROR);
        assert_eq!(&buf[1..5], &[0, 0, 0, 1]); // line = 1
        assert_eq!(&buf[5..9], &[0, 0, 0, 5]); // column = 5
        assert_eq!(&buf[9..13], &[0, 0, 0, 6]); // "string" length = 6
        assert_eq!(&buf[13..19], b"string");
        assert_eq!(&buf[19..23], &[0, 0, 0, 6]); // "number" length = 6
        assert_eq!(&buf[23..29], b"number");
    }

    #[test]
    fn test_encode_union_no_match_nested() {
        let mut buf = Vec::new();
        let mut writer = ByteWriter::new(&mut buf);
        encode_error(
            &AtcharaError::UnionNoMatch {
                variant_errors: vec![
                    AtcharaError::ValidationError {
                        expected: "string".to_string(),
                        found: "true".to_string(),
                        line: 1,
                        column: 1,
                    },
                    AtcharaError::ValidationError {
                        expected: "number".to_string(),
                        found: "true".to_string(),
                        line: 1,
                        column: 1,
                    },
                ],
                line: 1,
                column: 1,
            },
            &mut writer,
        );

        assert_eq!(buf[0], ERROR_CODE_UNION_NO_MATCH);
        assert_eq!(&buf[1..5], &[0, 0, 0, 1]); // line = 1
        assert_eq!(&buf[5..9], &[0, 0, 0, 1]); // column = 1
        assert_eq!(&buf[9..13], &[0, 0, 0, 2]); // count = 2
        assert_eq!(buf[13], ERROR_CODE_VALIDATION_ERROR); // First nested error
    }
}
