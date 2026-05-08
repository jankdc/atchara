/**
 * Type utilities for deferred value transformation.
 */

import type { Schema } from '../schema/types'

export interface DeferredValue<T> {
  toValue(): Promise<T>
}

/**
 * Infer the deferred type from a Schema.
 * Uses the schema's _deferred phantom type for direct type inference.
 *
 * @example
 * ```ts
 * const parser = object({ name: string(), age: number() })
 * type Result = InferDeferred<typeof parser.schema>
 * // Result = DeferredObject<{ name: string, age: number }>
 * ```
 */
export type InferDeferred<T extends Schema> = T['_deferred']

/**
 * Unwrap a deferred type back to its original value type.
 * Extracts the value type from any DeferredValue wrapper.
 *
 * @example
 * ```ts
 * type Str = Unwrap<DeferredString>         // string
 * type Num = Unwrap<DeferredNumber>         // number
 * type Arr = Unwrap<DeferredArray<number>>  // number[]
 * ```
 */
export type Unwrap<T> = T extends DeferredValue<infer U> ? U : never
