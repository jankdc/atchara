use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_union<E: StorageEncoder>(
        &mut self,
        variants: &[Schema],
        encoder: &mut E,
        defs: &[Schema],
    ) -> Result<(), AtcharaError> {
        self.context.enter_union();

        let mut variant_errors: Vec<AtcharaError> = Vec::with_capacity(variants.len());

        let line = self.line();
        let column = self.column();

        for (index, variant) in variants.iter().enumerate() {
            // Snapshot before each variant; restore on failure so the next variant
            // attempt starts from a clean slate. Snapshots aren't required to be
            // Clone, so we re-snapshot per iteration rather than reusing.
            let parser_snapshot = self.snapshot();
            let encoder_snapshot = encoder.snapshot();

            encoder.begin_variant(index);

            match Self::parse_value(self, variant, encoder, defs).await {
                Ok(()) => {
                    encoder.end_variant();
                    self.context.exit_union();
                    return Ok(());
                }
                Err(e) => {
                    self.restore(parser_snapshot);
                    encoder.restore(encoder_snapshot);
                    variant_errors.push(e);
                }
            }
        }

        self.context.exit_union();

        Err(AtcharaError::UnionNoMatch {
            variant_errors,
            line,
            column,
        })
    }
}
