export interface LazyContext {
  seen: Map<object, number>
  defs: SerializedSchema[]
}

export interface Schema<TOutput = unknown, TInput = unknown, TDeferred = { toValue(): TOutput }> {
  readonly _output: TOutput
  readonly _input: TInput
  readonly _deferred: TDeferred
  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema
}

export interface FlatObjectField {
  key: string
  index: number
  schema: SerializedSchema
}

export interface SerializedStringSchema {
  kind: 'string'
  schemaIndex?: number
  constraints?: { min?: number; max?: number; pattern?: string }
}

export interface SerializedBooleanSchema {
  kind: 'boolean'
  schemaIndex?: number
}

export interface SerializedNumberSchema {
  kind: 'number'
  schemaIndex?: number
  constraints?: { min?: number; max?: number; gt?: number; lt?: number; multipleOf?: number }
}

export interface SerializedIntegerSchema {
  kind: 'integer'
  schemaIndex?: number
  constraints?: { min?: number; max?: number; gt?: number; lt?: number; multipleOf?: number }
}

export interface SerializedLiteralSchema {
  kind: 'literal'
  value: string | number | boolean | null
  schemaIndex?: number
}

export interface SerializedNullableSchema {
  kind: 'nullable'
  inner: SerializedSchema
  schemaIndex?: number
}

export interface SerializedOptionalSchema {
  kind: 'optional'
  inner: SerializedSchema
  schemaIndex?: number
}

export interface SerializedObjectSchema {
  kind: 'object'
  objectFields: FlatObjectField[]
  schemaIndex?: number
}

export interface SerializedArraySchema {
  kind: 'array'
  elements: SerializedSchema
  schemaIndex?: number
  constraints?: { min?: number; max?: number }
}

export interface SerializedTupleSchema {
  kind: 'tuple'
  elements: SerializedSchema[]
  schemaIndex?: number
}

export interface SerializedRecordSchema {
  kind: 'record'
  valueSchema: SerializedSchema
  schemaIndex?: number
  constraints?: { min?: number; max?: number }
}

export interface SerializedUnionSchema {
  kind: 'union'
  variants: SerializedSchema[]
  schemaIndex?: number
}

export interface SerializedRefSchema {
  kind: 'ref'
  defId: number
  schemaIndex?: number
}

export type SerializedSchema =
  | SerializedNumberSchema
  | SerializedIntegerSchema
  | SerializedStringSchema
  | SerializedBooleanSchema
  | SerializedLiteralSchema
  | SerializedNullableSchema
  | SerializedObjectSchema
  | SerializedArraySchema
  | SerializedTupleSchema
  | SerializedOptionalSchema
  | SerializedRecordSchema
  | SerializedUnionSchema
  | SerializedRefSchema
