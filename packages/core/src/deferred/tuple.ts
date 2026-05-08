/**
 * Deferred wrapper for tuple values (fixed-length heterogeneous arrays).
 * Queries a ValueStore for element values and provides type-safe element access.
 */

import type { SerializedTupleSchema } from '../schema/types'
import type { ValueStore } from '../store/types'
import { DeferredValue } from './types'
import { wrapDeferred } from './factory'

/**
 * Deferred wrapper for tuple values (fixed-length arrays with potentially different element types).
 *
 * @typeParam T - The tuple value type (e.g., `[string, number]`)
 * @typeParam D - The tuple of deferred types (e.g., `[DeferredString, DeferredNumber]`)
 *
 * Queries a ValueStore for element values and provides methods to:
 * - Get specific elements as deferred wrappers with type safety
 * - Get element count
 * - Return the full tuple
 *
 * @example
 * ```ts
 * // Given a DeferredTuple from parser.parse():
 * tuple.at(0)      // DeferredString wrapping "hello"
 * tuple.at(1)      // DeferredNumber wrapping 42
 * tuple.length     // 3
 * tuple.toValue()  // ["hello", 42, true] (fully materialized)
 * ```
 */
export class DeferredTuple<
  T extends readonly unknown[] = readonly unknown[],
  D extends readonly unknown[] = { [K in keyof T]: DeferredValue<T[K]> },
> implements DeferredValue<T>
{
  private tupleSchema: SerializedTupleSchema

  constructor(
    private store: ValueStore,
    private path: string[],
    schema: SerializedTupleSchema
  ) {
    this.tupleSchema = schema
  }

  /**
   * Get the length of the tuple.
   * Always matches the schema length since tuples are fixed-size.
   */
  get length(): number {
    return this.tupleSchema.elements.length
  }

  /**
   * Get an element at the specified index as a deferred wrapper.
   * Returns undefined if index is out of bounds.
   * When called with a literal index, returns the precise type for that position.
   */
  at<I extends number>(index: I): (I extends keyof D ? D[I] : D[number]) | undefined {
    if (index < 0 || index >= this.length) {
      return undefined
    }

    const elementSchema = this.tupleSchema.elements[index]
    if (!elementSchema) {
      return undefined
    }

    const elementPath = [...this.path, String(index)]
    return wrapDeferred(this.store, elementPath, elementSchema) as
      | (I extends keyof D ? D[I] : D[number])
      | undefined
  }

  /**
   * Iterate over tuple elements, deferred wrapping each value.
   * Enables native JavaScript iteration: for (const item of tuple)
   */
  *[Symbol.iterator](): IterableIterator<D[number]> {
    for (let i = 0; i < this.length; i++) {
      const elementSchema = this.tupleSchema.elements[i]
      if (elementSchema) {
        const elementPath = [...this.path, String(i)]
        yield wrapDeferred(this.store, elementPath, elementSchema) as D[number]
      }
    }
  }

  /**
   * Return the full tuple as-is (fully materialized).
   */
  async toValue(): Promise<T> {
    return (await this.store.get(this.path)) as T
  }
}
