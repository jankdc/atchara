use super::JsonParser;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::schema::LiteralValue;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_literal<E: StorageEncoder>(
        &mut self,
        literal_value: &LiteralValue,
        encoder: &mut E,
    ) -> Result<(), AtcharaError> {
        let line = self.line();
        let column = self.column();

        match literal_value {
            LiteralValue::Null => {
                Self::parse_null(self, encoder).await?;
                Ok(())
            }
            LiteralValue::Bool(expected_bool) => {
                self.context.ensure_data(5).await;
                match self.context.peek_byte() {
                    Some(b't') if *expected_bool => {
                        Self::parse_true(self).await?;
                        encoder.write_boolean(true);
                        Ok(())
                    }
                    Some(b'f') if !*expected_bool => {
                        Self::parse_false(self).await?;
                        encoder.write_boolean(false);
                        Ok(())
                    }
                    Some(b't') => {
                        Self::parse_true(self).await?;
                        Err(AtcharaError::ValidationError {
                            expected: "false".to_string(),
                            found: "true".to_string(),
                            line,
                            column,
                        })
                    }
                    Some(b'f') => {
                        Self::parse_false(self).await?;
                        Err(AtcharaError::ValidationError {
                            expected: "true".to_string(),
                            found: "false".to_string(),
                            line,
                            column,
                        })
                    }
                    Some(b) => Err(AtcharaError::UnexpectedCharacter {
                        char: b as char,
                        line,
                        column,
                    }),
                    None => Err(AtcharaError::UnexpectedEof),
                }
            }
            LiteralValue::Number(expected_num) => {
                self.context.ensure_data(32).await;
                let s = self.parse_number_value()?;
                let n: f64 = s.parse().map_err(|_| AtcharaError::ValidationError {
                    expected: format!("number literal {}", expected_num),
                    found: format!("'{}'", s),
                    line,
                    column,
                })?;
                if (n - expected_num).abs() < f64::EPSILON {
                    encoder.write_number(n);
                    Ok(())
                } else {
                    Err(AtcharaError::ValidationError {
                        expected: expected_num.to_string(),
                        found: n.to_string(),
                        line,
                        column,
                    })
                }
            }
            LiteralValue::String(expected_str) => {
                let s = Self::parse_string_value(self).await?;
                if &s == expected_str {
                    encoder.write_string(&s);
                    Ok(())
                } else {
                    Err(AtcharaError::ValidationError {
                        expected: format!("\"{}\"", expected_str),
                        found: format!("\"{}\"", s),
                        line,
                        column,
                    })
                }
            }
        }
    }
}
