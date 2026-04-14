/**
 * @atcharajs/core - Core types, interfaces, and utilities for Atchara
 */

import { Schema } from './schema/types'
import { Parser } from './parser/types'

// Schema types
export type {
  Schema,
  SerializedSchema,
  FlatObjectField,
  SerializedStringSchema,
  SerializedBooleanSchema,
  SerializedNumberSchema,
  SerializedIntegerSchema,
  SerializedLiteralSchema,
  SerializedNullableSchema,
  SerializedOptionalSchema,
  SerializedObjectSchema,
  SerializedArraySchema,
  SerializedTupleSchema,
  SerializedRecordSchema,
  SerializedRefSchema,
  LazyContext,
} from './schema/types'

// Type inference utilities - accept both Schema and Parser
type ExtractSchema<T> = T extends Parser<infer S> ? S : T extends Schema ? T : never

export type InferInput<T extends Schema | Parser<Schema>> = ExtractSchema<T>['_input']

export type InferValue<T extends Schema | Parser<Schema>> = ExtractSchema<T>['_output']

// Parser interface
export type { Parser, LargeParseResult, EachParseResult } from './parser/types'

// Text utilities
export { toBytes } from './text'

export { DeferredPrimitive } from './deferred/primitive'
export { DeferredObject } from './deferred/object'
export { DeferredArray } from './deferred/array'
export { DeferredRecord } from './deferred/record'
export { DeferredNullable } from './deferred/nullable'
export { DeferredTuple } from './deferred/tuple'
export { DeferredUnion } from './deferred/union'
export { wrapDeferred } from './deferred/factory'

export type { InferDeferred, Unwrap, DeferredValue } from './deferred/types'
export type { ValueStore, FieldMetadata } from './store/types'

// Schema navigation utilities
export { resolveRef, schemaAtPath } from './schema/navigate'

// Error types
export {
  isAtcharaError,
  createAtcharaError,
  type AtcharaError,
  type AtcharaErrorCode,
  type AtcharaPosition,
  type UnexpectedEof,
  type InvalidUtf8,
  type UnexpectedCharacter,
  type ValidationError,
  type MissingRequired,
  type UnexpectedField,
  type UnionNoMatch,
  type InvalidSchema,
} from './error'
