use super::JsonParser;
use crate::Schema;
use crate::direct::DirectContext;
use crate::encoder::StorageEncoder;
use crate::errors::AtcharaError;
use crate::schema::SchemaKind;
use crate::streaming::StreamingContext;
use convert_to_sync_macro::convert_to_sync;

#[convert_to_sync(StreamingContext => DirectContext<'_>)]
impl JsonParser<StreamingContext> {
    #[boxed]
    pub async fn parse_value<'a, E: StorageEncoder>(
        &'a mut self,
        schema: &'a Schema,
        encoder: &'a mut E,
        defs: &'a [Schema],
    ) -> Result<(), AtcharaError> {
        Self::parse_whitespace(self).await;

        if let Some(idx) = schema.index {
            encoder.begin_indexed(idx);
        }

        let result = match &schema.kind {
            SchemaKind::String(constraints) => Self::parse_string(self, encoder, constraints).await,
            SchemaKind::Number(constraints) => Self::parse_number(self, encoder, constraints).await,
            SchemaKind::Integer(constraints) => {
                Self::parse_integer(self, encoder, constraints).await
            }
            SchemaKind::Boolean => Self::parse_boolean(self, encoder).await,
            SchemaKind::Null => Self::parse_null(self, encoder).await,
            SchemaKind::Literal(literal_value) => {
                Self::parse_literal(self, literal_value, encoder).await
            }
            SchemaKind::Object(fields) => Self::parse_object(self, fields, encoder, defs).await,
            SchemaKind::Array(element_schema, constraints) => {
                Self::parse_array(self, element_schema, encoder, constraints, defs).await
            }
            SchemaKind::Tuple(element_schemas) => {
                Self::parse_tuple(self, element_schemas, encoder, defs).await
            }
            SchemaKind::Nullable(inner_schema) => {
                Self::parse_nullable(self, inner_schema, encoder, defs).await
            }
            SchemaKind::Optional(inner_schema) => {
                Self::parse_optional(self, inner_schema, encoder, defs).await
            }
            SchemaKind::Record(value_schema, constraints) => {
                Self::parse_record(self, value_schema, encoder, constraints, defs).await
            }
            SchemaKind::Union(variants) => Self::parse_union(self, variants, encoder, defs).await,
            SchemaKind::Ref(def_id) => {
                let def = defs.get(*def_id).ok_or_else(|| {
                    AtcharaError::InvalidSchema(format!("Invalid ref defId: {def_id}"))
                })?;
                Self::parse_value(self, def, encoder, defs).await
            }
        };

        if let Some(idx) = schema.index {
            encoder.end_indexed(idx);
        }

        result
    }
}
