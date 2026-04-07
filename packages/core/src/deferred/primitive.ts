/**
 * Deferred value wrapper for on-demand access to parsed JSON values.
 *
 * Each deferred wrapper queries a ValueStore with its path to retrieve values,
 * allowing decoupling from the underlying data representation.
 */

import { DeferredValue } from './types'
import type { ValueStore } from '../store/types'

/**
 * Class for all deferred value wrappers.
 * Deferred values query a ValueStore with a path to retrieve their data.
 */
export class DeferredPrimitive<T> implements DeferredValue<T> {
  constructor(
    private store: ValueStore,
    private path: string[]
  ) {}

  toValue(): T {
    return this.store.get(this.path) as T
  }
}
