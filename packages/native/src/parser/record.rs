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
    pub async fn parse_record<E: StorageEncoder>(
        &mut self,
        value_schema: &Schema,
        encoder: &mut E,
        constraints: &ArrayConstraints,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        self.expect_byte(b'{')?;

        let mut handle = encoder.begin_record();

        Self::parse_whitespace(self).await;
        if self.context.peek_byte() == Some(b'}') {
            self.consume_byte();

            // Check min constraint on empty record
            if let Some(min) = constraints.min
                && min > 0
            {
                return Err(AtcharaError::ValidationError {
                    expected: format!("record with at least {} entries", min),
                    found: "0 entries".to_string(),
                    line: self.line(),
                    column: self.column(),
                });
            }

            encoder.end_record(&mut handle);
            return Ok(());
        }

        let mut entry_count: u32 = 0;

        loop {
            Self::parse_whitespace(self).await;

            let entry_line = self.line();
            let entry_col = self.column();

            // Parse key (must be string)
            let key = Self::parse_string_value(self).await?;

            Self::parse_whitespace(self).await;
            self.expect_byte(b':')?;

            encoder.begin_record_entry(&mut handle, &key);
            Self::parse_value(self, value_schema, encoder, defs).await?;
            encoder.end_record_entry(&mut handle);
            entry_count += 1;

            // Early rejection on max
            if let Some(max) = constraints.max
                && entry_count > max
            {
                return Err(AtcharaError::ValidationError {
                    expected: format!("record with at most {} entries", max),
                    found: format!("{} entries", entry_count),
                    line: entry_line,
                    column: entry_col,
                });
            }

            Self::parse_whitespace(self).await;
            match self.context.peek_byte() {
                Some(b',') => {
                    self.consume_byte();
                    continue;
                }
                Some(b'}') => {
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

        // Check min constraint
        if let Some(min) = constraints.min
            && entry_count < min
        {
            return Err(AtcharaError::ValidationError {
                expected: format!("record with at least {} entries", min),
                found: format!("{} entries", entry_count),
                line: self.line(),
                column: self.column(),
            });
        }

        encoder.end_record(&mut handle);

        Ok(())
    }
}
