use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    /// Presence flags for optional fields are handled at the object level.
    /// This just delegates to the inner schema.
    pub async fn parse_optional<E: StorageEncoder>(
        &mut self,
        inner_schema: &Schema,
        encoder: &mut E,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        Self::parse_value(self, inner_schema, encoder, defs).await
    }
}
