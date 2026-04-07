use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_nullable<E: StorageEncoder>(
        &mut self,
        inner_schema: &Schema,
        encoder: &mut E,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        // Pre-buffer enough for "null" so parse_null won't need a separate yield
        self.context.ensure_data(4).await;
        if self.context.peek_byte() == Some(b'n') {
            Self::parse_null(self, encoder).await?;
            encoder.write_null_flag();
            Ok(())
        } else {
            encoder.write_present_flag();
            Self::parse_value(self, inner_schema, encoder, defs).await
        }
    }
}
