use super::JsonParser;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::input::ParserContext;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    pub async fn parse_boolean<E: StorageEncoder>(
        &mut self,
        encoder: &mut E,
    ) -> Result<(), AtcharaError> {
        self.context.ensure_data(5).await;
        let line = self.line();
        let column = self.column();

        match self.context.peek_byte() {
            Some(b't') => {
                Self::parse_true(self).await?;
                encoder.write_boolean(true);
                Ok(())
            }
            Some(b'f') => {
                Self::parse_false(self).await?;
                encoder.write_boolean(false);
                Ok(())
            }
            Some(b) => Err(AtcharaError::UnexpectedCharacter {
                char: b as char,
                line,
                column,
            }),
            None => Err(AtcharaError::UnexpectedEof),
        }
    }

    pub async fn parse_true(&mut self) -> Result<(), AtcharaError> {
        self.context.ensure_data(4).await;
        let remaining = self.context.remaining();

        if remaining.len() < 4 {
            return Err(AtcharaError::ValidationError {
                expected: "'true'".to_string(),
                found: "end of input".to_string(),
                line: self.line(),
                column: self.column(),
            });
        }

        if &remaining[..4] == b"true" {
            self.context.advance_bytes(4);
            self.track_span(4, 0, 0);
            Ok(())
        } else {
            Err(AtcharaError::ValidationError {
                expected: "'true'".to_string(),
                found: format!("'{}'", String::from_utf8_lossy(&remaining[..4])),
                line: self.line(),
                column: self.column(),
            })
        }
    }

    pub async fn parse_false(&mut self) -> Result<(), AtcharaError> {
        self.context.ensure_data(5).await;
        let remaining = self.context.remaining();

        if remaining.len() < 5 {
            return Err(AtcharaError::ValidationError {
                expected: "'false'".to_string(),
                found: "end of input".to_string(),
                line: self.line(),
                column: self.column(),
            });
        }

        if &remaining[..5] == b"false" {
            self.context.advance_bytes(5);
            self.track_span(5, 0, 0);
            Ok(())
        } else {
            Err(AtcharaError::ValidationError {
                expected: "'false'".to_string(),
                found: format!("'{}'", String::from_utf8_lossy(&remaining[..5])),
                line: self.line(),
                column: self.column(),
            })
        }
    }
}
