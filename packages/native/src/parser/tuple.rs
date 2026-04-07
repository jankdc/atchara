use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_tuple<E: StorageEncoder>(
        &mut self,
        element_schemas: &[Schema],
        encoder: &mut E,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        self.expect_byte(b'[')?;
        encoder.begin_tuple(element_schemas.len());

        if element_schemas.is_empty() {
            Self::parse_whitespace(self).await;
            self.expect_byte(b']')?;
            encoder.end_tuple(0);
            return Ok(());
        }

        for (index, element_schema) in element_schemas.iter().enumerate() {
            if index > 0 {
                Self::parse_whitespace(self).await;
                self.expect_byte(b',')?;
            }
            encoder.begin_tuple_element(index);
            Self::parse_value(self, element_schema, encoder, defs).await?;
            encoder.end_tuple_element();
        }

        Self::parse_whitespace(self).await;
        self.expect_byte(b']')?;

        encoder.end_tuple(element_schemas.len() as u32);
        Ok(())
    }
}
