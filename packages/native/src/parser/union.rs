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
        let parser_snapshot = self.snapshot();
        let encoder_snapshot = encoder.snapshot();

        self.context.enter_union();

        let mut variant_errors: Vec<AtcharaError> = Vec::with_capacity(variants.len());

        let line = self.line();
        let column = self.column();

        for (index, variant) in variants.iter().enumerate() {
            if index > 0 {
                self.restore(parser_snapshot);
                encoder.restore(encoder_snapshot);
            }

            encoder.begin_variant(index);

            match Self::parse_value(self, variant, encoder, defs).await {
                Ok(()) => {
                    encoder.end_variant();
                    self.context.exit_union();
                    return Ok(());
                }
                Err(e) => variant_errors.push(e),
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
