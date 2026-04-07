use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::schema::ArrayConstraints;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_array<E: StorageEncoder>(
        &mut self,
        element_schema: &Schema,
        encoder: &mut E,
        constraints: &ArrayConstraints,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        let yield_each = self.context.should_yield_elements();
        if yield_each {
            // Consume the flag so nested arrays within each element don't yield
            self.context.set_yield_elements(false);
        }

        self.expect_byte(b'[')?;

        let mut handle = encoder.begin_array();

        Self::parse_whitespace(self).await;
        if self.context.peek_byte() == Some(b']') {
            self.consume_byte();

            if !yield_each
                && let Some(min) = constraints.min
                && min > 0
            {
                return Err(AtcharaError::ValidationError {
                    expected: format!("array with at least {} elements", min),
                    found: "0 elements".to_string(),
                    line: self.line(),
                    column: self.column(),
                });
            }

            encoder.end_array(&mut handle, 0);
            return Ok(());
        }

        let mut element_count: u32 = 0;

        loop {
            if yield_each && self.context.is_aborted() {
                encoder.end_array(&mut handle, element_count);
                return Ok(());
            }

            let elem_line = self.line();
            let elem_col = self.column();

            encoder.begin_array_element(&mut handle, element_count as usize);
            Self::parse_value(self, element_schema, encoder, defs).await?;
            encoder.end_array_element(&mut handle);
            element_count += 1;

            if let Some(max) = constraints.max
                && element_count > max
            {
                return Err(AtcharaError::ValidationError {
                    expected: format!("array with at most {} elements", max),
                    found: format!("{} elements", element_count),
                    line: elem_line,
                    column: elem_col,
                });
            }

            if yield_each {
                self.context.yield_element(element_count - 1).await;
            }

            Self::parse_whitespace(self).await;
            match self.context.peek_byte() {
                Some(b',') => {
                    self.consume_byte();
                    continue;
                }
                Some(b']') => {
                    self.consume_byte();
                    break;
                }
                Some(b) => {
                    return Err(AtcharaError::UnexpectedCharacter {
                        char: b as char,
                        line: self.line(),
                        column: self.column(),
                    });
                }
                None => {
                    return Err(AtcharaError::UnexpectedEof);
                }
            }
        }

        if !yield_each
            && let Some(min) = constraints.min
            && element_count < min
        {
            return Err(AtcharaError::ValidationError {
                expected: format!("array with at least {} elements", min),
                found: format!("{} elements", element_count),
                line: self.line(),
                column: self.column(),
            });
        }

        encoder.end_array(&mut handle, element_count);

        Ok(())
    }
}
