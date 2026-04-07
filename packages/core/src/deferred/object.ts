/**
 * Deferred wrapper for object values.
 * Queries a ValueStore for field values and provides methods for field access with deferred wrapping.
 */

import type { FlatObjectField, SerializedObjectSchema } from '../schema/types'
import type { ValueStore } from '../store/types'
import { DeferredValue } from './types'
import { wrapDeferred } from './factory'

/**
 * Deferred wrapper for object values.
 *
 * @typeParam T - The value type of the object (e.g., `{ name: string, age: number }`)
 * @typeParam D - Map of field names to their deferred types (e.g., `{ name: DeferredString, age: DeferredNumber }`)
 *
 * Queries a ValueStore for field values and provides methods to:
 * - Access specific fields as deferred wrappers with correct types
 * - Check field existence without unwrapping
 * - Iterate over fields
 * - Get materialized values directly
 * - Return the full object
 *
 * @example
 * ```ts
 * // Given a DeferredObject from parser.parse():
 * obj.get('name')   // DeferredString wrapping "Alice"
 * obj.has('name')   // true
 * obj.keys()        // ["name", "age"]
 * obj.toValue()     // { name: "Alice", age: 30 } (fully materialized)
 * ```
 */
export class DeferredObject<
  T extends Record<string, unknown> = Record<string, unknown>,
  D extends Record<keyof T, unknown> = Record<keyof T, unknown>,
> implements DeferredValue<T>
{
  private objectSchema: SerializedObjectSchema

  constructor(
    private store: ValueStore,
    private path: string[],
    schema: SerializedObjectSchema
  ) {
    this.objectSchema = schema
  }

  /**
   * Get a field value as a deferred wrapper.
   * Returns the correct deferred type for each field (e.g., DeferredString, DeferredObject, etc.)
   */
  get<K extends keyof T & keyof D>(key: K): D[K] {
    const fieldKey = key as string
    const fieldSchema = this.objectSchema.objectFields.find(
      (f: FlatObjectField) => f.key === fieldKey
    )

    if (!fieldSchema) {
      throw new Error(`Field "${fieldKey}" not found in object schema`)
    }

    const fieldPath = [...this.path, fieldKey]
    return wrapDeferred(this.store, fieldPath, fieldSchema.schema) as D[K]
  }

  /**
   * Check if a field exists in the object.
   */
  has<K extends keyof T>(key: K): boolean {
    const fieldKey = key as string
    const fieldPath = [...this.path, fieldKey]
    return this.store.has(fieldPath)
  }

  /**
   * Get all keys in the object (from schema).
   */
  keys(): (keyof T)[] {
    return this.objectSchema.objectFields.map((f: FlatObjectField) => f.key as keyof T)
  }

  /**
   * Iterate over field entries, deferred wrapping each value.
   * Enables native JavaScript iteration: for (const [key, value] of object)
   * Yields [key, DeferredValue] tuples.
   */
  *[Symbol.iterator](): IterableIterator<[keyof T & keyof D, D[keyof T & keyof D]]> {
    for (const field of this.objectSchema.objectFields) {
      const key = field.key as keyof T & keyof D
      yield [key, this.get(key)]
    }
  }

  /**
   * Return the full object as-is (fully materialized).
   */
  toValue(): T {
    return this.store.get(this.path) as T
  }
}
