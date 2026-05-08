/**
 * Deferred wrapper for record values (objects with dynamic keys).
 * Queries a ValueStore for values and provides methods for key-value access with deferred wrapping.
 */

import type { SerializedRecordSchema } from '../schema/types'
import type { ValueStore } from '../store/types'
import { DeferredValue } from './types'
import { wrapDeferred } from './factory'

/**
 * Deferred wrapper for record values (string-keyed objects).
 *
 * @typeParam V - The value type (e.g., `number` for Record<string, number>)
 * @typeParam D - The value's deferred type (e.g., `DeferredNumber` or `DeferredObject<...>`)
 *
 * Queries a ValueStore for values. Records have dynamic keys not known at schema time.
 * Provides methods to:
 * - Get values by dynamic key as deferred wrappers
 * - Get all keys
 * - Get entry count
 * - Iterate over entries
 * - Return the full record
 *
 * @example
 * ```ts
 * // Given a DeferredRecord from parser.parse():
 * record.get('a')   // DeferredNumber wrapping 1
 * record.keys()     // ["a", "b"]
 * record.size       // 2
 * record.toValue()  // { a: 1, b: 2 } (fully materialized)
 * for (const [k, v] of record) { ... }  // Iterate entries
 * ```
 */
export class DeferredRecord<V = unknown, D = DeferredValue<V>>
  implements DeferredValue<Record<string, V>>
{
  private recordSchema: SerializedRecordSchema

  constructor(
    private store: ValueStore,
    private path: string[],
    schema: SerializedRecordSchema
  ) {
    this.recordSchema = schema
  }

  /**
   * Get the number of entries in the record.
   */
  async size(): Promise<number> {
    return (await this.keys()).length
  }

  /**
   * Get a value by key as a deferred wrapper.
   * Returns undefined if the key does not exist.
   */
  async get(key: string): Promise<D | undefined> {
    const keyPath = [...this.path, key]
    if (!(await this.store.has(keyPath))) {
      return undefined
    }

    return wrapDeferred(this.store, keyPath, this.recordSchema.valueSchema) as D
  }

  /**
   * Get all keys in the record.
   */
  async keys(): Promise<string[]> {
    return await this.store.getRecordKeys(this.path)
  }

  /**
   * Iterate over record entries, deferred wrapping each value.
   * Enables `for await (const [key, value] of record)` iteration.
   * Yields [key, DeferredValue] tuples.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<[string, D]> {
    for (const key of await this.keys()) {
      const keyPath = [...this.path, key]
      yield [key, wrapDeferred(this.store, keyPath, this.recordSchema.valueSchema) as D]
    }
  }

  /**
   * Return the full record as-is (fully materialized).
   */
  async toValue(): Promise<Record<string, V>> {
    return (await this.store.get(this.path)) as Record<string, V>
  }
}
