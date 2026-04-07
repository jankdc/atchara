/**
 * Shared schema navigation utilities for resolving refs and traversing schema paths.
 */

import type { SerializedSchema } from './types'

/**
 * Resolve ref schemas by following the defs table.
 * Returns the schema unchanged if it's not a ref.
 */
export function resolveRef(schema: SerializedSchema, defs: SerializedSchema[]): SerializedSchema {
  let current = schema
  while (current.kind === 'ref') {
    current = defs[current.defId]!
  }
  return current
}

/**
 * Navigate a schema structure to get the schema at a specific path.
 * Resolves refs at each step of the traversal.
 */
export function schemaAtPath(
  root: SerializedSchema,
  path: string[],
  defs: SerializedSchema[]
): SerializedSchema {
  let current = resolveRef(root, defs)

  for (const segment of path) {
    switch (current.kind) {
      case 'object': {
        const field = current.objectFields.find((f: { key: string }) => f.key === segment)
        if (!field) {
          throw new Error(`Field ${segment} not found in object schema`)
        }
        current = resolveRef(field.schema, defs)
        break
      }

      case 'array':
        current = resolveRef(current.elements, defs)
        break

      case 'tuple': {
        const index = parseInt(segment, 10)
        const element = current.elements[index]
        if (!element) {
          throw new Error(`Tuple element ${index} not found`)
        }
        current = resolveRef(element, defs)
        break
      }

      case 'record':
        current = resolveRef(current.valueSchema, defs)
        break

      case 'nullable':
      case 'optional':
        current = resolveRef(current.inner, defs)
        break

      default:
        throw new Error(`Cannot navigate into ${current.kind} schema`)
    }
  }

  return current
}
