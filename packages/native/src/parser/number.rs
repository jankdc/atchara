use super::JsonParser;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::parser::{MAX_SAFE, MIN_SAFE};
use crate::schema::NumberConstraints;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_number<E: StorageEncoder>(
        &mut self,
        encoder: &mut E,
        constraints: &NumberConstraints,
    ) -> Result<(), AtcharaError> {
        self.context.ensure_data(64).await;
        let line = self.line();
        let column = self.column();

        // Numbers may span chunk boundaries. Loop: parse, and if the number
        // consumed to exactly the end of the buffer, request more data and retry.
        let s = loop {
            let snap = self.snapshot();
            let remaining_before = self.context.remaining().len();

            match self.parse_number_value() {
                Ok(s) => {
                    // If we consumed to the buffer edge, more digits might follow
                    if self.context.remaining().is_empty() && remaining_before > 0 {
                        self.restore(snap);
                        self.context.ensure_data(remaining_before + 64).await;
                        if self.context.remaining().len() > remaining_before {
                            continue;
                        }
                        // No more data — re-parse to advance position
                        break self.parse_number_value().unwrap();
                    }
                    break s;
                }
                Err(e) => {
                    if self.context.remaining().is_empty() && remaining_before > 0 {
                        self.restore(snap);
                        self.context.ensure_data(remaining_before + 64).await;
                        if self.context.remaining().len() > remaining_before {
                            continue;
                        }
                    }
                    return Err(e);
                }
            }
        };

        let n: f64 = s.parse().map_err(|_| AtcharaError::ValidationError {
            expected: "valid number".to_string(),
            found: format!("'{}'", s),
            line: self.line(),
            column: self.column(),
        })?;

        check_number_constraints(n, constraints, line, column)?;

        encoder.write_number(n);
        Ok(())
    }

    pub async fn parse_integer<E: StorageEncoder>(
        &mut self,
        encoder: &mut E,
        constraints: &NumberConstraints,
    ) -> Result<(), AtcharaError> {
        self.context.ensure_data(64).await;
        let line = self.line();
        let column = self.column();

        let s = loop {
            let snap = self.snapshot();
            let remaining_before = self.context.remaining().len();

            match self.parse_number_value() {
                Ok(s) => {
                    if self.context.remaining().is_empty() && remaining_before > 0 {
                        self.restore(snap);
                        self.context.ensure_data(remaining_before + 64).await;
                        if self.context.remaining().len() > remaining_before {
                            continue;
                        }
                        break self.parse_number_value().unwrap();
                    }
                    break s;
                }
                Err(e) => {
                    if self.context.remaining().is_empty() && remaining_before > 0 {
                        self.restore(snap);
                        self.context.ensure_data(remaining_before + 64).await;
                        if self.context.remaining().len() > remaining_before {
                            continue;
                        }
                    }
                    return Err(e);
                }
            }
        };

        // Integer validation runs first: decimal/exponent input gets integer error, not constraint error
        let value: i64 = s.parse().map_err(|_| AtcharaError::ValidationError {
            expected: "integer".to_string(),
            found: format!("'{}'", s),
            line,
            column,
        })?;

        if !(MIN_SAFE..=MAX_SAFE).contains(&value) {
            return Err(AtcharaError::ValidationError {
                expected: format!("integer in range {} to {}", MIN_SAFE, MAX_SAFE),
                found: value.to_string(),
                line,
                column,
            });
        }

        check_integer_constraints(value, constraints, line, column)?;

        encoder.write_number(value as f64);
        Ok(())
    }
}

fn check_number_constraints(
    n: f64,
    constraints: &NumberConstraints,
    line: usize,
    column: usize,
) -> Result<(), AtcharaError> {
    if let Some(min) = constraints.min
        && n < min
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("number >= {}", format_constraint(min)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(max) = constraints.max
        && n > max
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("number <= {}", format_constraint(max)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(gt) = constraints.gt
        && n <= gt
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("number > {}", format_constraint(gt)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(lt) = constraints.lt
        && n >= lt
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("number < {}", format_constraint(lt)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(multiple) = constraints.multiple_of {
        // Epsilon tolerance approach (matches Ajv's industry-standard behavior)
        // Avoids IEEE 754 precision issues: 0.3 % 0.1 ≈ 0.0999 in naive arithmetic
        let division = n / multiple;
        let remainder = (division - division.round()).abs();
        if remainder > 1e-10 {
            return Err(AtcharaError::ValidationError {
                expected: format!("multiple of {}", format_constraint(multiple)),
                found: format_constraint(n),
                line,
                column,
            });
        }
    }
    Ok(())
}

fn check_integer_constraints(
    value: i64,
    constraints: &NumberConstraints,
    line: usize,
    column: usize,
) -> Result<(), AtcharaError> {
    let n = value as f64;
    if let Some(min) = constraints.min
        && n < min
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("integer >= {}", format_constraint(min)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(max) = constraints.max
        && n > max
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("integer <= {}", format_constraint(max)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(gt) = constraints.gt
        && n <= gt
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("integer > {}", format_constraint(gt)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(lt) = constraints.lt
        && n >= lt
    {
        return Err(AtcharaError::ValidationError {
            expected: format!("integer < {}", format_constraint(lt)),
            found: format_constraint(n),
            line,
            column,
        });
    }
    if let Some(multiple) = constraints.multiple_of {
        // For integers, exact modulo is safe — no float precision issue
        let divisor = multiple as i64;
        if divisor != 0 && value % divisor != 0 {
            return Err(AtcharaError::ValidationError {
                expected: format!("multiple of {}", format_constraint(multiple)),
                found: format_constraint(n),
                line,
                column,
            });
        }
    }
    Ok(())
}

/// Format a constraint value: omit trailing ".0" for whole numbers
fn format_constraint(n: f64) -> String {
    if n.fract() == 0.0 && n.abs() < i64::MAX as f64 {
        format!("{}", n as i64)
    } else {
        format!("{}", n)
    }
}

// ============================================================================
// Number parsing helpers on JsonParser (not convert_to_sync — synchronous)
// ============================================================================

impl<R: ParserContext> JsonParser<R> {
    /// Scan and validate a JSON number, returning the raw string.
    /// Works on available data only — caller handles chunking.
    pub fn parse_number_value(&mut self) -> Result<String, AtcharaError> {
        let start_pos = self.context.position();
        let start_line = self.line();
        let start_column = self.column();

        // Handle optional negative sign
        if self.context.peek_byte() == Some(b'-') {
            self.context.advance_byte();
            self.track(false);
        }

        // Scan integer part
        let digit_count = self.parse_digits();
        if digit_count == 0 {
            return Err(AtcharaError::ValidationError {
                expected: "digit".to_string(),
                found: self
                    .context
                    .peek_byte()
                    .map(|b| format!("'{}'", b as char))
                    .unwrap_or_else(|| "end of input".to_string()),
                line: start_line,
                column: start_column,
            });
        }

        // Optional decimal part
        if self.context.peek_byte() == Some(b'.') {
            self.context.advance_byte();
            self.track(false);

            let decimal_digits = self.parse_digits();
            if decimal_digits == 0 {
                return Err(AtcharaError::ValidationError {
                    expected: "digit after decimal point".to_string(),
                    found: self
                        .context
                        .peek_byte()
                        .map(|b| format!("'{}'", b as char))
                        .unwrap_or_else(|| "end of input".to_string()),
                    line: start_line,
                    column: start_column,
                });
            }
        }

        // Optional exponent part
        if let Some(byte) = self.context.peek_byte()
            && (byte == b'e' || byte == b'E')
        {
            self.context.advance_byte();
            self.track(false);

            if let Some(sign) = self.context.peek_byte()
                && (sign == b'+' || sign == b'-')
            {
                self.context.advance_byte();
                self.track(false);
            }

            let exp_digits = self.parse_digits();
            if exp_digits == 0 {
                return Err(AtcharaError::ValidationError {
                    expected: "digit in exponent".to_string(),
                    found: self
                        .context
                        .peek_byte()
                        .map(|b| format!("'{}'", b as char))
                        .unwrap_or_else(|| "end of input".to_string()),
                    line: self.line(),
                    column: self.column(),
                });
            }
        }

        let end_pos = self.context.position();
        let number_bytes = self.context.slice_bytes(start_pos, end_pos);

        // We've validated these are ASCII digits, signs, and decimal points
        let number_str = unsafe { std::str::from_utf8_unchecked(number_bytes) };

        validate_leading_zeros(number_str, start_line, start_column)?;

        Ok(number_str.to_string())
    }

    /// Scan forward through consecutive digits, returning the count.
    fn parse_digits(&mut self) -> usize {
        let remaining = self.context.remaining();
        let mut count = 0;

        while count < remaining.len() && remaining[count].is_ascii_digit() {
            count += 1;
        }

        if count > 0 {
            self.context.advance_bytes(count);
            self.track_span(count, 0, 0);
        }

        count
    }
}

/// Validate RFC 8259 leading zero rule: no leading zeros except "0" itself.
fn validate_leading_zeros(s: &str, line: usize, column: usize) -> Result<(), AtcharaError> {
    let num_str = s.strip_prefix('-').unwrap_or(s);

    if num_str.len() > 1
        && num_str.starts_with('0')
        && let Some(next_char) = num_str.chars().nth(1)
        && next_char.is_ascii_digit()
    {
        return Err(AtcharaError::ValidationError {
            expected: "number without leading zeros".to_string(),
            found: format!("'{}'", s),
            line,
            column,
        });
    }

    Ok(())
}
