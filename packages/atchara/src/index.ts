/**
 * Atchara - Fast, schema-aware JSON parser with native Rust acceleration
 *
 * This is the main entry point that exports the Atchara API.
 */

export type {
  Parser,
  Schema,
  SerializedSchema,
  InferValue,
  InferInput,
  AtcharaError,
  AtcharaErrorCode,
  AtcharaPosition,
  UnexpectedEof,
  InvalidUtf8,
  UnexpectedCharacter,
  ValidationError,
  MissingRequired,
  UnexpectedField,
  UnionNoMatch,
  InvalidSchema,
  InferDeferred,
  Unwrap,
  LargeParseResult,
} from '@atchara/core'

export {
  toBytes,
  isAtcharaError,
  DeferredPrimitive,
  DeferredObject,
  DeferredArray,
  DeferredRecord,
  DeferredNullable,
  DeferredTuple,
  DeferredUnion,
  wrapDeferred,
} from '@atchara/core'

export {
  initialize,
  string,
  number,
  integer,
  boolean,
  nullable,
  optional,
  object,
  array,
  literal,
  tuple,
  record,
  union,
  lazy,
} from './base'

export { StringSchema } from './schema/string'
export { NumberSchema } from './schema/number'
export { IntegerSchema } from './schema/integer'
export { ArraySchema } from './schema/array'
export { LazySchema } from './schema/lazy'
