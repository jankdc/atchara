/**
 * Factory for creating deferred value wrappers from schema types.
 */

import type { ValueStore } from '../store/types'
import type { SerializedSchema } from '../schema/types'
import { DeferredValue } from './types'
import { DeferredObject } from './object'
import { DeferredArray } from './array'
import { DeferredRecord } from './record'
import { DeferredNullable } from './nullable'
import { DeferredTuple } from './tuple'
import { DeferredUnion } from './union'
import { DeferredPrimitive } from './primitive'

/**
 * Creates an appropriate deferred wrapper for a value based on its schema type.
 *
 * @param store The ValueStore providing access to values
 * @param path The path within the store to this value
 * @param schema The schema describing the value's type
 * @returns A deferred wrapper for the value
 */
export function wrapDeferred(
  store: ValueStore,
  path: string[],
  schema: SerializedSchema
): DeferredValue<unknown> {
  switch (schema.kind) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'literal':
      return new DeferredPrimitive(store, path)

    case 'object':
      return new DeferredObject(store, path, schema)

    case 'array':
      return new DeferredArray(store, path, schema)

    case 'tuple':
      return new DeferredTuple(store, path, schema)

    case 'record':
      return new DeferredRecord(store, path, schema)

    case 'nullable':
      return new DeferredNullable(store, path, schema)

    case 'optional':
      return wrapDeferred(store, path, schema.inner)

    case 'union':
      return new DeferredUnion(store, path, schema)

    case 'ref': {
      const defs = store.getDefs()
      return wrapDeferred(store, path, defs[schema.defId]!)
    }

    default: {
      const exhaustiveCheck: never = schema
      throw new Error(`Unknown schema type: ${String(exhaustiveCheck)}`)
    }
  }
}
