/**
 * Deferred wrapper for union values.
 * Queries a ValueStore for values that could be one of several possible types.
 */

import type { SerializedUnionSchema } from '../schema/types'
import type { ValueStore } from '../store/types'
import { DeferredValue } from './types'

/**
 * Deferred wrapper for union values.
 *
 * Since unions are already fully decoded by the parser, we just wrap the value.
 * The actual type has already been determined during parsing.
 *
 * @example
 * ```ts
 * // Given a DeferredUnion from parser.parse():
 * union.toValue()  // Returns the matched variant value
 * ```
 */
export class DeferredUnion<T = unknown> implements DeferredValue<T> {
  // Schema is stored but not used in prototype (will be used for true lazy decoder)

  constructor(
    private store: ValueStore,
    private path: string[],
    _schema: SerializedUnionSchema
  ) {}

  /**
   * Return the unwrapped value.
   * The value is already the correct variant (determined during parsing).
   */
  async toValue(): Promise<T> {
    return (await this.store.get(this.path)) as T
  }
}
