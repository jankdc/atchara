/**
 * RedbStore implements ValueStore for redb-backed storage.
 * Provides true per-field lazy loading - only accessed values are read from redb.
 */

import type { Buffer } from 'node:buffer'
import type {
  ValueStore,
  FieldMetadata,
  SerializedSchema,
  SerializedObjectSchema,
  FlatObjectField,
} from '@atcharajs/core'
import { resolveRef, schemaAtPath } from '@atcharajs/core'
import { encodePath } from '../path'

/** Structural interface for any client that supports redb-style reads */
export interface RedbReadable {
  get(key: string): Buffer | null
  keysWithPrefix(prefix: string): string[]
  close(): void
  readonly isClosed: boolean
}

/**
 * Unwrap optional/nullable wrappers to get the underlying schema.
 */
function unwrapSchema(schema: SerializedSchema, defs?: SerializedSchema[]): SerializedSchema {
  if (schema.kind === 'ref' && defs) {
    return unwrapSchema(defs[schema.defId]!, defs)
  }
  if (schema.kind === 'optional' || schema.kind === 'nullable') {
    return unwrapSchema(schema.inner, defs)
  }
  return schema
}

/**
 * A field is packable if its schema, after unwrapping optional/nullable, is primitive.
 */
function isPackable(schema: SerializedSchema, defs?: SerializedSchema[]): boolean {
  const inner = unwrapSchema(schema, defs)
  switch (inner.kind) {
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'literal':
      return true
    default:
      return false
  }
}

/**
 * Decode a packed blob into a map of field_index → decoded value.
 *
 * Blob format: [u16 count] [u16 field_index, u8 tag, value...]...
 */
function decodePackedBlob(blob: Uint8Array, objectFields: FlatObjectField[]): Map<number, unknown> {
  const result = new Map<number, unknown>()
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  let offset = 0

  const entryCount = view.getUint16(offset)
  offset += 2

  const decoder = new TextDecoder()

  for (let i = 0; i < entryCount; i++) {
    const fieldIndex = view.getUint16(offset)
    offset += 2

    const tag = blob[offset++]!

    if (tag === 0x02) {
      result.set(fieldIndex, null)
      continue
    }

    if (tag !== 0x01) {
      // Unknown tag — skip (shouldn't happen)
      result.set(fieldIndex, undefined)
      continue
    }

    // tag === 0x01: present — decode based on field schema
    const field = objectFields.find((f) => f.index === fieldIndex)
    if (!field) continue

    const innerSchema = unwrapSchema(field.schema)

    switch (innerSchema.kind) {
      case 'boolean': {
        result.set(fieldIndex, blob[offset++] === 1)
        break
      }
      case 'number':
      case 'integer': {
        result.set(fieldIndex, view.getFloat64(offset))
        offset += 8
        break
      }
      case 'string': {
        const len = view.getUint32(offset)
        offset += 4
        result.set(fieldIndex, decoder.decode(blob.subarray(offset, offset + len)))
        offset += len
        break
      }
      case 'literal': {
        if (innerSchema.value === null) {
          // literal(null): present tag with no data bytes
          result.set(fieldIndex, null)
        } else if (typeof innerSchema.value === 'boolean') {
          result.set(fieldIndex, blob[offset++] === 1)
        } else if (typeof innerSchema.value === 'number') {
          result.set(fieldIndex, view.getFloat64(offset))
          offset += 8
        } else if (typeof innerSchema.value === 'string') {
          const len = view.getUint32(offset)
          offset += 4
          result.set(fieldIndex, decoder.decode(blob.subarray(offset, offset + len)))
          offset += len
        }
        break
      }
      default:
        // Non-packable type in blob (e.g., absent nullable-structural) — skip
        break
    }
  }

  return result
}

export class RedbStore implements ValueStore {
  private schemaCache = new Map<string, SerializedSchema>()

  private defs: SerializedSchema[]

  constructor(
    private client: RedbReadable,
    private schema: SerializedSchema,
    private indexMap: Map<string, number>,
    defs: SerializedSchema[] = []
  ) {
    this.defs = defs
  }

  getDefs(): SerializedSchema[] {
    return this.defs
  }

  private ensureOpen(): void {
    if (this.client.isClosed) {
      throw new Error('RedbStore is closed')
    }
  }

  /**
   * Check if data exists at a path based on the schema type.
   * For primitives: check d:{path}
   * For objects/arrays/tuples/records: check m:{path}:len
   * For unions: check m:{path}:var
   * For nullable: check m:{path}:nul
   * For optional: recursively check inner schema
   */
  private hasDataAtPath(path: string[], schema: SerializedSchema): boolean {
    const resolved = resolveRef(schema, this.defs)
    const innerSchema = resolved.kind === 'optional' ? resolved.inner : resolved

    switch (innerSchema.kind) {
      case 'object': {
        // Packed objects store a blob at d:{path}; fallback to m:{path}:len
        const dataKey = this.pathToKey(path)
        if (this.client.get(dataKey) !== null) return true
        const objMetaKey = this.pathToMetaKey(path, 'len')
        return this.client.get(objMetaKey) !== null
      }
      case 'array':
      case 'tuple':
      case 'record': {
        // These types store metadata with length
        const metaKey = this.pathToMetaKey(path, 'len')
        return this.client.get(metaKey) !== null
      }

      case 'union': {
        // Unions store variant index as metadata
        const metaKey = this.pathToMetaKey(path, 'var')
        return this.client.get(metaKey) !== null
      }

      case 'nullable': {
        // Nullable stores flag as metadata
        const metaKey = this.pathToMetaKey(path, 'nul')
        return this.client.get(metaKey) !== null
      }

      default: {
        // Primitives store directly at d:{path}
        const dataKey = this.pathToKey(path)
        return this.client.get(dataKey) !== null
      }
    }
  }

  /**
   * Convert a user path to a metadata key with given suffix.
   * Reuses pathToKey logic but produces m:{path}:{suffix} format.
   */
  private pathToMetaKey(path: string[], suffix: string): string {
    const dataKey = this.pathToKey(path)
    // dataKey is 'd:' or 'd:{path}', convert to 'm::{suffix}' or 'm:{path}:{suffix}'
    if (dataKey === 'd:') {
      return `m::${suffix}`
    }
    // Replace 'd:' prefix with 'm:' and append suffix
    return `m:${dataKey.slice(2)}:${suffix}`
  }

  /**
   * Convert a user path to a storage key.
   * Handles record keys by adding k: prefix.
   */
  private pathToKey(path: string[]): string {
    if (path.length === 0) return 'd:'

    const parts: string[] = []
    let currentSchema: SerializedSchema = resolveRef(this.schema, this.defs)

    for (const segment of path) {
      currentSchema = resolveRef(currentSchema, this.defs)
      switch (currentSchema.kind) {
        case 'object': {
          parts.push(segment)
          const field: FlatObjectField | undefined = currentSchema.objectFields.find(
            (f) => f.key === segment
          )
          if (field) {
            currentSchema = field.schema
          }
          break
        }
        case 'array':
          parts.push(segment)
          currentSchema = currentSchema.elements
          break
        case 'tuple': {
          parts.push(segment)
          const idx = parseInt(segment, 10)
          const elem: SerializedSchema | undefined = currentSchema.elements[idx]
          if (elem) {
            currentSchema = elem
          }
          break
        }
        case 'record':
          // Record keys need k: prefix
          parts.push(`k:${segment}`)
          currentSchema = currentSchema.valueSchema
          break
        case 'union': {
          // Union variant paths are v{index}
          parts.push(segment)
          if (segment.startsWith('v')) {
            const variantIdx = parseInt(segment.slice(1), 10)
            const variant = currentSchema.variants[variantIdx]
            if (variant) {
              currentSchema = variant
            }
          }
          break
        }
        case 'nullable':
        case 'optional':
          // Unwrap and retry with the same segment
          currentSchema = currentSchema.inner
          // Re-process the segment with unwrapped schema
          return this.pathToKeyWithSchema(path, this.schema)
        default:
          parts.push(segment)
      }
    }

    return `d:${parts.join(':')}`
  }

  /**
   * Convert path to storage key with explicit schema tracking for nullable/optional handling.
   */
  private pathToKeyWithSchema(path: string[], rootSchema: SerializedSchema): string {
    if (path.length === 0) return 'd:'

    const parts: string[] = []
    let currentSchema: SerializedSchema = rootSchema

    // Unwrap nullable/optional/ref at root
    currentSchema = resolveRef(currentSchema, this.defs)
    while (currentSchema.kind === 'nullable' || currentSchema.kind === 'optional') {
      currentSchema = resolveRef(currentSchema.inner, this.defs)
    }

    for (const segment of path) {
      // Unwrap nullable/optional/ref
      currentSchema = resolveRef(currentSchema, this.defs)
      while (currentSchema.kind === 'nullable' || currentSchema.kind === 'optional') {
        currentSchema = resolveRef(currentSchema.inner, this.defs)
      }

      switch (currentSchema.kind) {
        case 'object': {
          parts.push(segment)
          const field: FlatObjectField | undefined = currentSchema.objectFields.find(
            (f) => f.key === segment
          )
          if (field) {
            currentSchema = field.schema
          }
          break
        }
        case 'array':
          parts.push(segment)
          currentSchema = currentSchema.elements
          break
        case 'tuple': {
          parts.push(segment)
          const idx = parseInt(segment, 10)
          const elem: SerializedSchema | undefined = currentSchema.elements[idx]
          if (elem) {
            currentSchema = elem
          }
          break
        }
        case 'record':
          // Record keys need k: prefix
          parts.push(`k:${segment}`)
          currentSchema = currentSchema.valueSchema
          break
        default:
          parts.push(segment)
      }
    }

    return `d:${parts.join(':')}`
  }

  get(path: string[]): unknown {
    this.ensureOpen()

    // If the path targets a packable field inside an object, read from the
    // parent's packed blob instead of looking for an individual entry.
    if (path.length > 0) {
      const parentPath = path.slice(0, -1)
      const parentSchema = this.getUnwrappedSchemaAtPath(parentPath)
      if (parentSchema.kind === 'object') {
        const fieldKey = path[path.length - 1]!
        const field = parentSchema.objectFields.find((f) => f.key === fieldKey)
        if (field && isPackable(field.schema, this.defs)) {
          return this.readPackedField(parentPath, parentSchema, field)
        }
      }
    }

    const schema = this.getCachedSchema(path)
    return this.readValue(path, schema)
  }

  /**
   * Recursively read and materialize a value from storage.
   * This fully materializes complex types (objects, arrays, records).
   */
  private readValue(path: string[], schema: SerializedSchema): unknown {
    const key = this.pathToKey(path)

    switch (schema.kind) {
      case 'string': {
        const bytes = this.client.get(key)
        if (!bytes) return undefined
        return new TextDecoder().decode(bytes)
      }

      case 'number':
      case 'integer': {
        const bytes = this.client.get(key)
        if (!bytes) return undefined
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        return view.getFloat64(0)
      }

      case 'boolean': {
        const bytes = this.client.get(key)
        if (!bytes) return undefined
        return bytes[0] === 1
      }

      case 'literal': {
        if (schema.value === null) {
          return null
        }
        const bytes = this.client.get(key)
        if (!bytes) return schema.value
        if (typeof schema.value === 'string') {
          return new TextDecoder().decode(bytes)
        }
        if (typeof schema.value === 'number') {
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
          return view.getFloat64(0)
        }
        if (typeof schema.value === 'boolean') {
          return bytes[0] === 1
        }
        return schema.value
      }

      case 'nullable': {
        // Null flag stored as metadata to avoid collision with inner value
        const metaKey = this.pathToMetaKey(path, 'nul')
        const bytes = this.client.get(metaKey)
        if (!bytes) return undefined
        const isNull = bytes[0] === 0x01
        if (isNull) return null
        // Read the inner value at the same path
        return this.readValue(path, schema.inner)
      }

      case 'optional':
        return this.readValue(path, schema.inner)

      case 'union': {
        // Variant index is stored as metadata to avoid key collision with value
        const metaKey = this.pathToMetaKey(path, 'var')
        const bytes = this.client.get(metaKey)
        if (!bytes) return undefined
        const variantIndex = bytes[0]
        if (variantIndex === undefined || variantIndex >= schema.variants.length) {
          return undefined
        }
        const variantSchema = schema.variants[variantIndex]
        if (!variantSchema) return undefined
        // Add variant path prefix to support nested unions
        const variantPath = [...path, `v${variantIndex}`]
        return this.readValue(variantPath, variantSchema)
      }

      case 'object': {
        const result: Record<string, unknown> = {}

        // Try reading packed blob for this object
        const blobKey = this.pathToKey(path)
        const blob = this.client.get(blobKey)
        let packedData: Map<number, unknown> | null = null
        if (blob) {
          packedData = decodePackedBlob(new Uint8Array(blob), schema.objectFields)
        }

        for (const field of schema.objectFields) {
          const fieldSchema = field.schema

          if (packedData && isPackable(fieldSchema, this.defs)) {
            const entry = packedData.get(field.index)
            result[field.key] = entry
          } else {
            // Structural field — read individually
            const fieldPath = [...path, field.key]
            const isOptional = fieldSchema.kind === 'optional'

            if (isOptional) {
              const hasField = this.hasDataAtPath(fieldPath, fieldSchema)
              if (hasField) {
                result[field.key] = this.readValue(fieldPath, fieldSchema)
              } else {
                result[field.key] = undefined
              }
            } else {
              result[field.key] = this.readValue(fieldPath, fieldSchema)
            }
          }
        }
        return result
      }

      case 'array': {
        const length = this.getArrayLength(path)
        const result: unknown[] = new Array(length)
        for (let i = 0; i < length; i++) {
          const elemPath = [...path, String(i)]
          result[i] = this.readValue(elemPath, schema.elements)
        }
        return result
      }

      case 'tuple': {
        const result: unknown[] = new Array(schema.elements.length)
        for (let i = 0; i < schema.elements.length; i++) {
          const elemPath = [...path, String(i)]
          const elemSchema = schema.elements[i]
          if (elemSchema) {
            result[i] = this.readValue(elemPath, elemSchema)
          }
        }
        return result
      }

      case 'record': {
        const keys = this.getRecordKeys(path)
        const result: Record<string, unknown> = {}
        for (const k of keys) {
          // Use the user path (without k: prefix) - pathToKey will add it
          const valuePath = [...path, k]
          result[k] = this.readValue(valuePath, schema.valueSchema)
        }
        return result
      }

      case 'ref':
        return this.readValue(path, this.defs[schema.defId]!)
    }
  }

  has(path: string[]): boolean {
    this.ensureOpen()
    if (path.length === 0) {
      return true
    }

    const parentPath = path.slice(0, -1)
    const parentSchema =
      path.length === 1 ? this.schema : schemaAtPath(this.schema, parentPath, this.defs)
    const key = path[path.length - 1]
    if (key === undefined) return false

    if (parentSchema.kind === 'object') {
      const field = parentSchema.objectFields.find((f) => f.key === key)
      if (!field) return false

      if (isPackable(field.schema, this.defs)) {
        // Check the parent's packed blob
        const blobKey = this.pathToKey(parentPath)
        const blob = this.client.get(blobKey)
        if (blob) {
          const packedData = decodePackedBlob(new Uint8Array(blob), parentSchema.objectFields)
          return packedData.has(field.index) && packedData.get(field.index) !== undefined
        }
        return false
      }

      return this.hasDataAtPath(path, field.schema)
    }

    if (parentSchema.kind === 'array') {
      const index = parseInt(key, 10)
      if (isNaN(index) || index < 0) return false

      const length = this.getArrayLength(parentPath)
      return index < length
    }

    if (parentSchema.kind === 'record') {
      // Record keys use k: prefix in storage
      const recordKey =
        parentPath.length === 0 ? `d:k:${key}` : `d:${parentPath.join(':')}:k:${key}`
      return this.client.get(recordKey) !== null
    }

    return false
  }

  getFieldMetadata(path: string[], key: string): FieldMetadata {
    const fullPath = [...path, key]
    const pathKey = encodePath(fullPath)
    const exists = this.indexMap.has(pathKey)

    return {
      exists,
      schema: exists ? this.getCachedSchema(fullPath) : ({ kind: 'string' } as SerializedSchema),
    }
  }

  getArrayLength(path: string[]): number {
    this.ensureOpen()
    const metaKey = this.pathToMetaKey(path, 'len')
    const bytes = this.client.get(metaKey)
    if (!bytes) return 0

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return view.getUint32(0)
  }

  getRecordKeys(path: string[]): string[] {
    this.ensureOpen()
    // Use pathToKey to get proper path with k: prefixes, then append :k: for nested record key enumeration
    const dataKey = this.pathToKey(path)
    // Root path (d:) needs just k: appended, nested paths need :k: separator
    const dataPrefix = dataKey === 'd:' ? 'd:k:' : `${dataKey}:k:`
    // Also check metadata keys for nullable values that may be null (only metadata, no data)
    const metaPrefix = dataKey === 'd:' ? 'm:k:' : `m:${dataKey.slice(2)}:k:`

    const keys = new Set<string>()

    // Get keys from data entries
    for (const k of this.client.keysWithPrefix(dataPrefix)) {
      const keyPart = k.slice(dataPrefix.length)
      const colonIdx = keyPart.indexOf(':')
      const immediateKey = colonIdx === -1 ? keyPart : keyPart.slice(0, colonIdx)
      // Allow empty string keys (don't filter with truthiness check)
      keys.add(immediateKey)
    }

    // Get keys from metadata entries (for nullable null values)
    for (const k of this.client.keysWithPrefix(metaPrefix)) {
      const keyPart = k.slice(metaPrefix.length)
      const colonIdx = keyPart.indexOf(':')
      const immediateKey = colonIdx === -1 ? keyPart : keyPart.slice(0, colonIdx)
      // Allow empty string keys (don't filter with truthiness check)
      keys.add(immediateKey)
    }

    return Array.from(keys)
  }

  /**
   * Navigate to a path and unwrap any nullable/optional wrappers on the result.
   */
  private getUnwrappedSchemaAtPath(path: string[]): SerializedSchema {
    let schema = path.length === 0 ? this.schema : schemaAtPath(this.schema, path, this.defs)
    schema = resolveRef(schema, this.defs)
    while (schema.kind === 'nullable' || schema.kind === 'optional') {
      schema = resolveRef(schema.inner, this.defs)
    }
    return schema
  }

  /**
   * Read a single packable field from the parent object's packed blob.
   */
  private readPackedField(
    parentPath: string[],
    parentSchema: SerializedObjectSchema,
    field: FlatObjectField
  ): unknown {
    const blobKey = this.pathToKey(parentPath)
    const blob = this.client.get(blobKey)
    if (!blob) return undefined

    const packedData = decodePackedBlob(new Uint8Array(blob), parentSchema.objectFields)
    return packedData.get(field.index)
  }

  /**
   * Get schema at path with caching
   */
  private getCachedSchema(path: string[]): SerializedSchema {
    if (path.length === 0) {
      return this.schema
    }

    const pathKey = encodePath(path)
    let schema = this.schemaCache.get(pathKey)

    if (schema === undefined) {
      schema = schemaAtPath(this.schema, path, this.defs)
      this.schemaCache.set(pathKey, schema)
    }

    return schema
  }
}
