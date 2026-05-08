/**
 * Deferred wrapper for nullable values.
 * Lazily checks if a value is null when accessed.
 */

import type { SerializedNullableSchema } from '../schema/types'
import type { ValueStore } from '../store/types'
import { DeferredValue } from './types'

/**
 * Deferred wrapper for nullable values.
 *
 * Defers the null check until the value is accessed.
 *
 * @example
 * ```ts
 * // Given a DeferredNullable from parser.parse():
 * nullable.toValue()  // "hello" or null depending on parsed value
 * ```
 */
export class DeferredNullable<T> implements DeferredValue<T | null> {
  constructor(
    private store: ValueStore,
    private path: string[],
    _schema: SerializedNullableSchema
  ) {}

  /**
   * Get the materialized value.
   * Returns null if the value is null, otherwise returns the stored value.
   */
  async toValue(): Promise<T | null> {
    return (await this.store.get(this.path)) as T | null
  }
}
