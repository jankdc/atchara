/**
 * Deferred wrapper for array values.
 * Queries a ValueStore for element values and provides methods for element access with deferred wrapping.
 */

import type { SerializedArraySchema } from '../schema/types'
import type { ValueStore } from '../store/types'
import { DeferredValue } from './types'
import { wrapDeferred } from './factory'

/**
 * Deferred wrapper for array values.
 *
 * @typeParam T - The element value type (e.g., `string` for a string array)
 * @typeParam E - The element's deferred type (e.g., `DeferredString` or `DeferredObject<...>`)
 *
 * Queries a ValueStore for element values and provides methods to:
 * - Get specific elements as deferred wrappers
 * - Iterate deferred over elements
 * - Use array methods (map, filter) with deferred wrapping
 * - Get element count and materialized values
 * - Return the full array
 *
 * @example
 * ```ts
 * // Given a DeferredArray from parser.parse():
 * arr.at(0)       // DeferredNumber wrapping first element
 * arr.length      // 3
 * arr.toValue()   // [1, 2, 3] (fully materialized)
 * for (const item of arr) { ... }  // Iterate with deferred elements
 * ```
 */
export class DeferredArray<T = unknown, E = DeferredValue<T>> implements DeferredValue<T[]> {
  private arraySchema: SerializedArraySchema

  constructor(
    private store: ValueStore,
    private path: string[],
    schema: SerializedArraySchema
  ) {
    this.arraySchema = schema
  }

  /**
   * Get the number of elements in the array.
   * Async because the length is read from storage.
   */
  async length(): Promise<number> {
    return await this.store.getArrayLength(this.path)
  }

  /**
   * Get an element at the specified index as a deferred wrapper.
   * Returns undefined if the index is out of bounds.
   * Async because bounds-checking reads the array length from storage.
   */
  async at(index: number): Promise<E | undefined> {
    if (index < 0 || index >= (await this.length())) {
      return undefined
    }

    const elementPath = [...this.path, String(index)]
    return wrapDeferred(this.store, elementPath, this.arraySchema.elements) as E
  }

  /**
   * Iterate over array elements, deferred wrapping each value.
   * Enables `for await (const item of array)` iteration.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<E> {
    const len = await this.length()
    for (let i = 0; i < len; i++) {
      const elementPath = [...this.path, String(i)]
      yield wrapDeferred(this.store, elementPath, this.arraySchema.elements) as E
    }
  }

  /**
   * Return the full array as-is (fully materialized).
   */
  async toValue(): Promise<T[]> {
    return (await this.store.get(this.path)) as T[]
  }
}
