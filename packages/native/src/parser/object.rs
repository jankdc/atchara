use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::parser::is_literal_schema;
use crate::schema::{ObjectFieldMap, SchemaKind};
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_object<E: StorageEncoder>(
        &mut self,
        fields: &ObjectFieldMap,
        encoder: &mut E,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        self.expect_byte(b'{')?;
        let object_line = self.line();
        let object_column = self.column();

        let field_count = fields.len();
        let mut handle = encoder.begin_object(field_count);
        let mut fields_seen = vec![false; field_count];

        Self::parse_whitespace(self).await;
        if self.context.peek_byte() != Some(b'}') {
            loop {
                Self::parse_whitespace(self).await;

                let key_line = self.line();
                let key_column = self.column();
                let key = Self::parse_string_value(self).await?;

                Self::parse_whitespace(self).await;
                self.expect_byte(b':')?;

                let (field_index, field_schema) =
                    fields
                        .get_with_index(&key)
                        .ok_or_else(|| AtcharaError::UnexpectedField {
                            field: key.to_string(),
                            line: key_line,
                            column: key_column,
                        })?;

                let is_optional = matches!(field_schema.schema.kind, SchemaKind::Optional(_));
                let snapshot = encoder.snapshot();

                encoder.begin_object_field(&mut handle, field_index, &key);

                match Self::parse_value(self, &field_schema.schema, encoder, defs).await {
                    Ok(()) => {
                        encoder.end_object_field(&mut handle);
                        fields_seen[field_index] = true;
                    }
                    Err(_) if is_optional && is_literal_schema(&field_schema.schema, defs) => {
                        encoder.restore(snapshot);
                        encoder.mark_field_absent(&mut handle, field_index);
                    }
                    Err(e) => {
                        return Err(e);
                    }
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
                    None => return Err(AtcharaError::UnexpectedEof),
                }
            }
        } else {
            self.consume_byte();
        }

        // Check for missing required fields
        for (index, &seen) in fields_seen.iter().enumerate() {
            if !seen
                && let Some(field) = fields.get_by_index(index)
                && !matches!(field.schema.kind, SchemaKind::Optional(_))
            {
                return Err(AtcharaError::MissingRequired {
                    field: field.key.clone(),
                    line: object_line,
                    column: object_column,
                });
            }
        }

        encoder.end_object(&mut handle);

        Ok(())
    }
}
