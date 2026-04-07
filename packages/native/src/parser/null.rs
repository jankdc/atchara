use super::JsonParser;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_null<E: StorageEncoder>(
        &mut self,
        encoder: &mut E,
    ) -> Result<(), AtcharaError> {
        self.context.ensure_data(4).await;
        let remaining = self.context.remaining();

        if remaining.len() < 4 {
            return Err(AtcharaError::ValidationError {
                expected: "'null'".to_string(),
                found: "end of input".to_string(),
                line: self.line(),
                column: self.column(),
            });
        }

        if &remaining[..4] == b"null" {
            self.context.advance_bytes(4);
            self.track_span(4, 0, 0);
            let _ = encoder;
            Ok(())
        } else {
            Err(AtcharaError::ValidationError {
                expected: "'null'".to_string(),
                found: format!("'{}'", String::from_utf8_lossy(&remaining[..4])),
                line: self.line(),
                column: self.column(),
            })
        }
    }
}
