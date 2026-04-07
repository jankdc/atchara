use crate::errors::AtcharaError;
use napi::bindgen_prelude::*;
use regex::Regex;
use std::collections::HashMap;

const SCHEMA_TYPE_KEY: &str = "kind";
const SCHEMA_VALUE_KEY: &str = "value";
const SCHEMA_INNER_KEY: &str = "inner";
const SCHEMA_FIELD_KEY_KEY: &str = "key";
const SCHEMA_FIELD_INDEX_KEY: &str = "index";
const SCHEMA_FIELD_SCHEMA_KEY: &str = "schema";
const SCHEMA_OBJECT_FIELDS_KEY: &str = "objectFields";
const SCHEMA_ARRAY_ELEMENTS_KEY: &str = "elements";
const SCHEMA_VALUE_SCHEMA_KEY: &str = "valueSchema";
const SCHEMA_UNION_VARIANTS_KEY: &str = "variants";
const SCHEMA_INDEX_KEY: &str = "schemaIndex";
const SCHEMA_CONSTRAINTS_KEY: &str = "constraints";

// ============================================================================
// Constraint types
// ============================================================================

#[derive(Debug, Clone, Default)]
pub struct StringConstraints {
    pub min: Option<usize>,
    pub max: Option<usize>,
    pub pattern: Option<Regex>,
}

#[derive(Debug, Clone, Default)]
pub struct NumberConstraints {
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub gt: Option<f64>,
    pub lt: Option<f64>,
    pub multiple_of: Option<f64>,
}

#[derive(Debug, Clone, Default)]
pub struct ArrayConstraints {
    pub min: Option<u32>,
    pub max: Option<u32>,
}

// ============================================================================
// Schema types
// ============================================================================

#[derive(Debug, Clone)]
pub enum SchemaKind {
    String(StringConstraints),
    Number(NumberConstraints),
    Integer(NumberConstraints),
    Boolean,
    Null,
    Literal(LiteralValue),
    Object(ObjectFieldMap),
    Array(Box<Schema>, ArrayConstraints),
    Tuple(Vec<Schema>),
    Nullable(Box<Schema>),
    Optional(Box<Schema>),
    Record(Box<Schema>, ArrayConstraints),
    Union(Vec<Schema>),
    Ref(usize),
}

/// Schema node with optional offset index for binary encoding
#[derive(Debug, Clone)]
pub struct Schema {
    pub index: Option<usize>,
    pub kind: SchemaKind,
}

#[derive(Debug, Clone)]
pub enum LiteralValue {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
}

#[derive(Debug, Clone)]
pub struct ObjectField {
    pub key: String,
    pub index: usize,
    pub schema: Schema,
}

/// Optimized field map for O(1) field lookups using HashMap
#[derive(Debug, Clone)]
pub struct ObjectFieldMap {
    fields: Vec<ObjectField>,
    key_to_index: HashMap<String, usize>,
}

impl ObjectFieldMap {
    pub fn new(fields: Vec<ObjectField>) -> Self {
        let key_to_index = fields
            .iter()
            .enumerate()
            .map(|(idx, field)| (field.key.clone(), idx))
            .collect();

        Self {
            fields,
            key_to_index,
        }
    }

    #[inline(always)]
    pub fn get(&self, key: &str) -> Option<&ObjectField> {
        self.key_to_index.get(key).map(|&idx| &self.fields[idx])
    }

    #[inline(always)]
    pub fn get_with_index(&self, key: &str) -> Option<(usize, &ObjectField)> {
        self.key_to_index
            .get(key)
            .map(|&idx| (idx, &self.fields[idx]))
    }

    #[inline(always)]
    pub fn get_by_index(&self, index: usize) -> Option<&ObjectField> {
        self.fields.get(index)
    }

    #[inline(always)]
    pub fn iter(&self) -> impl Iterator<Item = &ObjectField> {
        self.fields.iter()
    }

    #[inline(always)]
    pub fn len(&self) -> usize {
        self.fields.len()
    }

    #[inline(always)]
    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }
}

fn schema_err(msg: impl Into<String>) -> AtcharaError {
    AtcharaError::InvalidSchema(msg.into())
}

type SchemaResult = std::result::Result<Schema, AtcharaError>;
type SchemaKindResult = std::result::Result<SchemaKind, AtcharaError>;

// ============================================================================
// Constraint deserialization helpers
// ============================================================================

fn read_string_constraints(
    js_schema: &Object,
) -> std::result::Result<StringConstraints, AtcharaError> {
    let Ok(obj) = js_schema.get_named_property::<Object>(SCHEMA_CONSTRAINTS_KEY) else {
        return Ok(StringConstraints::default());
    };
    let pattern = obj
        .get_named_property::<String>("pattern")
        .ok()
        .map(|s| Regex::new(&s))
        .transpose()
        .map_err(|e| AtcharaError::InvalidSchema(format!("invalid regex pattern: {e}")))?;
    Ok(StringConstraints {
        min: obj
            .get_named_property::<f64>("min")
            .ok()
            .map(|v| v as usize),
        max: obj
            .get_named_property::<f64>("max")
            .ok()
            .map(|v| v as usize),
        pattern,
    })
}

fn read_number_constraints(js_schema: &Object) -> NumberConstraints {
    let Ok(obj) = js_schema.get_named_property::<Object>(SCHEMA_CONSTRAINTS_KEY) else {
        return NumberConstraints::default();
    };
    NumberConstraints {
        min: obj.get_named_property::<f64>("min").ok(),
        max: obj.get_named_property::<f64>("max").ok(),
        gt: obj.get_named_property::<f64>("gt").ok(),
        lt: obj.get_named_property::<f64>("lt").ok(),
        multiple_of: obj.get_named_property::<f64>("multipleOf").ok(),
    }
}

fn read_array_constraints(js_schema: &Object) -> ArrayConstraints {
    let Ok(obj) = js_schema.get_named_property::<Object>(SCHEMA_CONSTRAINTS_KEY) else {
        return ArrayConstraints::default();
    };
    ArrayConstraints {
        min: obj.get_named_property::<f64>("min").ok().map(|v| v as u32),
        max: obj.get_named_property::<f64>("max").ok().map(|v| v as u32),
    }
}

// ============================================================================
// Schema deserialization
// ============================================================================

impl Schema {
    /// Deserialize a Schema from a napi Object
    pub fn from_napi_object(js_schema: &Object) -> SchemaResult {
        let index: Option<usize> = js_schema
            .get_named_property::<f64>(SCHEMA_INDEX_KEY)
            .ok()
            .map(|v| v as usize);

        let schema_type: String = js_schema
            .get_named_property(SCHEMA_TYPE_KEY)
            .map_err(|_| schema_err("Failed to get schema type"))?;

        let kind = match schema_type.as_str() {
            "string" => Ok(SchemaKind::String(read_string_constraints(js_schema)?)),
            "number" => Ok(SchemaKind::Number(read_number_constraints(js_schema))),
            "integer" => Ok(SchemaKind::Integer(read_number_constraints(js_schema))),
            "boolean" => Ok(SchemaKind::Boolean),
            "null" => Ok(SchemaKind::Null),
            "literal" => Self::deserialize_literal(js_schema),
            "object" => Self::deserialize_object(js_schema),
            "array" => Self::deserialize_array(js_schema),
            "tuple" => Self::deserialize_tuple(js_schema),
            "nullable" => Self::deserialize_nullable(js_schema),
            "optional" => Self::deserialize_optional(js_schema),
            "record" => Self::deserialize_record(js_schema),
            "union" => Self::deserialize_union(js_schema),
            "ref" => Self::deserialize_ref(js_schema),
            _ => Err(AtcharaError::InvalidSchema(format!(
                "Unknown schema type: {schema_type}"
            ))),
        }?;

        Ok(Schema { index, kind })
    }

    fn deserialize_literal(js_schema: &Object) -> SchemaKindResult {
        let literal_value_js: Unknown = js_schema
            .get_named_property(SCHEMA_VALUE_KEY)
            .map_err(|_| schema_err("Failed to get value"))?;

        let value_type = literal_value_js
            .get_type()
            .map_err(|_| schema_err("Failed to get value type"))?;

        let literal_value = match value_type {
            ValueType::Null => LiteralValue::Null,
            ValueType::Boolean => {
                let b: bool = literal_value_js
                    .coerce_to_bool()
                    .map_err(|_| schema_err("Failed to get boolean value"))?;
                LiteralValue::Bool(b)
            }
            ValueType::Number => {
                let n: f64 = literal_value_js
                    .coerce_to_number()
                    .and_then(|v| v.get_double())
                    .map_err(|_| schema_err("Failed to get number value"))?;
                LiteralValue::Number(n)
            }
            ValueType::String => {
                let s: String = literal_value_js
                    .coerce_to_string()
                    .and_then(|v| v.into_utf8())
                    .map(|v| v.as_str().map(|s| s.to_string()))
                    .map_err(|_| schema_err("Failed to get string value"))?
                    .map_err(|_| schema_err("Invalid UTF-8 in string value"))?;
                LiteralValue::String(s)
            }
            _ => {
                return Err(schema_err(
                    "Literal value must be null, boolean, number, or string",
                ));
            }
        };

        Ok(SchemaKind::Literal(literal_value))
    }

    fn deserialize_object(js_schema: &Object) -> SchemaKindResult {
        let fields_array: Array = js_schema
            .get_named_property(SCHEMA_OBJECT_FIELDS_KEY)
            .map_err(|_| schema_err("Failed to get objectFields"))?;

        let length = fields_array.len();

        let mut fields = Vec::with_capacity(length as usize);

        for i in 0..length {
            let field_entry: Object = fields_array
                .get::<Object>(i)
                .map_err(|_| schema_err("Failed to get field entry"))?
                .ok_or_else(|| schema_err("Field entry is null"))?;

            let key: String = field_entry
                .get_named_property(SCHEMA_FIELD_KEY_KEY)
                .map_err(|_| schema_err("Failed to get field key"))?;

            let index: f64 = field_entry
                .get_named_property(SCHEMA_FIELD_INDEX_KEY)
                .map_err(|_| schema_err("Failed to get field index"))?;

            let field_schema_js: Object =
                field_entry
                    .get_named_property(SCHEMA_FIELD_SCHEMA_KEY)
                    .map_err(|_| schema_err(format!("Failed to get schema for field '{key}'")))?;

            let field_schema = Self::from_napi_object(&field_schema_js)?;

            fields.push(ObjectField {
                key,
                index: index as usize,
                schema: field_schema,
            });
        }

        Ok(SchemaKind::Object(ObjectFieldMap::new(fields)))
    }

    fn deserialize_array(js_schema: &Object) -> SchemaKindResult {
        let elements_js: Object = js_schema
            .get_named_property(SCHEMA_ARRAY_ELEMENTS_KEY)
            .map_err(|_| schema_err("Failed to get elements"))?;

        let elements_schema = Self::from_napi_object(&elements_js)?;
        let constraints = read_array_constraints(js_schema);
        Ok(SchemaKind::Array(Box::new(elements_schema), constraints))
    }

    fn deserialize_tuple(js_schema: &Object) -> SchemaKindResult {
        let elements_js: Array = js_schema
            .get_named_property(SCHEMA_ARRAY_ELEMENTS_KEY)
            .map_err(|_| schema_err("Failed to get tuple elements"))?;

        let length = elements_js.len();

        let mut schemas = Vec::with_capacity(length as usize);

        for i in 0..length {
            let element_js: Object = elements_js
                .get::<Object>(i)
                .map_err(|_| schema_err("Failed to get tuple element"))?
                .ok_or_else(|| schema_err("Tuple element is null"))?;
            schemas.push(Self::from_napi_object(&element_js)?);
        }

        Ok(SchemaKind::Tuple(schemas))
    }

    fn deserialize_nullable(js_schema: &Object) -> SchemaKindResult {
        let inner_js: Object = js_schema
            .get_named_property(SCHEMA_INNER_KEY)
            .map_err(|_| schema_err("Failed to get inner"))?;

        let inner_schema = Self::from_napi_object(&inner_js)?;
        Ok(SchemaKind::Nullable(Box::new(inner_schema)))
    }

    fn deserialize_optional(js_schema: &Object) -> SchemaKindResult {
        let inner_js: Object = js_schema
            .get_named_property(SCHEMA_INNER_KEY)
            .map_err(|_| schema_err("Failed to get inner"))?;

        let inner_schema = Self::from_napi_object(&inner_js)?;
        Ok(SchemaKind::Optional(Box::new(inner_schema)))
    }

    fn deserialize_record(js_schema: &Object) -> SchemaKindResult {
        let value_schema_js: Object = js_schema
            .get_named_property(SCHEMA_VALUE_SCHEMA_KEY)
            .map_err(|_| schema_err("Failed to get valueSchema"))?;

        let value_schema = Self::from_napi_object(&value_schema_js)?;
        let constraints = read_array_constraints(js_schema);
        Ok(SchemaKind::Record(Box::new(value_schema), constraints))
    }

    fn deserialize_union(js_schema: &Object) -> SchemaKindResult {
        let variants_js: Array = js_schema
            .get_named_property(SCHEMA_UNION_VARIANTS_KEY)
            .map_err(|_| schema_err("Failed to get variants"))?;

        let length = variants_js.len();

        let mut schemas = Vec::with_capacity(length as usize);

        for i in 0..length {
            let variant_js: Object = variants_js
                .get::<Object>(i)
                .map_err(|_| schema_err("Failed to get variant"))?
                .ok_or_else(|| schema_err("Variant is null"))?;
            schemas.push(Self::from_napi_object(&variant_js)?);
        }

        if schemas.is_empty() {
            return Err(schema_err("Union must have at least one variant"));
        }

        Ok(SchemaKind::Union(schemas))
    }

    fn deserialize_ref(js_schema: &Object) -> SchemaKindResult {
        let def_id: f64 = js_schema
            .get_named_property("defId")
            .map_err(|_| schema_err("Failed to get defId"))?;
        Ok(SchemaKind::Ref(def_id as usize))
    }
}
