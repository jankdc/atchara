/**
 * MemoryStore implements lazy value access using the embedded offset table.
 * Values are only decoded when accessed, enabling efficient handling of large objects.
 */

import type { ValueStore, FieldMetadata, SerializedSchema } from '@atchara/core'
import { resolveRef, schemaAtPath } from '@atchara/core'
import { BufferDecoder } from '../decoder/buffer'
import { OffsetIndex } from '../decoder/offset'
import { encodePath } from '../path'

export class MemoryStore implements ValueStore {
  private defs: SerializedSchema[]
  private decoder: BufferDecoder
  private offsetIndex: OffsetIndex
  private schema: SerializedSchema
  private indexMap: Map<string, number>
  private schemaCache = new Map<string, SerializedSchema>()

  getDefs(): SerializedSchema[] {
    return this.defs
  }

  constructor(
    bytes: Uint8Array,
    schema: SerializedSchema,
    indexMap: Map<string, number>,
    defs: SerializedSchema[] = []
  ) {
    this.defs = defs
    this.schema = schema
    this.indexMap = indexMap
    this.offsetIndex = new OffsetIndex(bytes)

    const valueDataLength = this.offsetIndex.getValueDataLength()
    const valueData = bytes.subarray(0, valueDataLength)

    this.decoder = new BufferDecoder(valueData, defs)
  }

  get(path: string[]): unknown {
    // Look up offset index from schema
    const pathKey = encodePath(path)
    const offsetIdx = this.indexMap.get(pathKey)

    // If path not in index, check if parent is an array, record, or object
    if (offsetIdx === undefined) {
      if (path.length > 0) {
        const parentPath = path.slice(0, -1)
        const parentSchema = resolveRef(
          path.length === 1 ? this.schema : schemaAtPath(this.schema, parentPath, this.defs),
          this.defs
        )
        const key = path[path.length - 1]

        if (parentSchema.kind === 'array' && key !== undefined) {
          const index = parseInt(key, 10)
          if (isNaN(index) || index < 0) return undefined

          const parentOffset = this.getOffsetForDynamicPath(parentPath)
          if (parentOffset === undefined) return undefined

          return this.decoder.readArrayElementAt(parentOffset, index, parentSchema.elements)
        }

        if (parentSchema.kind === 'record' && key !== undefined) {
          const parentOffset = this.getOffsetForDynamicPath(parentPath)
          if (parentOffset === undefined) return undefined

          return this.decoder.readRecordValueAt(parentOffset, key, parentSchema.valueSchema)
        }

        if (parentSchema.kind === 'object' && key !== undefined) {
          const parentOffset = this.getOffsetForDynamicPath(parentPath)
          if (parentOffset === undefined) return undefined

          const fieldDef = parentSchema.objectFields.find((f) => f.key === key)
          if (!fieldDef) return undefined

          return this.decoder.readObjectFieldAt(parentOffset, fieldDef.index, parentSchema)
        }
      }

      return undefined
    }

    // Get offset from table
    const offset = this.offsetIndex.getOffset(offsetIdx)
    if (offset === undefined) return undefined

    // Seek to offset and decode
    this.decoder.seek(offset)

    // Navigate schema to get the schema at this path
    const schema = this.getCachedSchema(path)
    return this.decoder.read(schema)
  }

  has(path: string[]): boolean {
    if (path.length === 0) {
      return true
    }

    const parentPath = path.slice(0, -1)
    const parentSchema = resolveRef(
      path.length === 1 ? this.schema : schemaAtPath(this.schema, parentPath, this.defs),
      this.defs
    )
    const key = path[path.length - 1]
    if (key === undefined) return false

    if (parentSchema.kind === 'object') {
      const parentOffset = this.getOffsetForDynamicPath(parentPath)
      if (parentOffset === undefined) return false

      const fieldDef = parentSchema.objectFields.find((f) => f.key === key)
      if (!fieldDef) return false

      return this.decoder.hasObjectFieldAt(parentOffset, fieldDef.index, parentSchema)
    }

    if (parentSchema.kind === 'array') {
      const index = parseInt(key, 10)
      if (isNaN(index) || index < 0) return false

      const parentOffset = this.getOffsetForDynamicPath(parentPath)
      if (parentOffset === undefined) return false

      const length = this.decoder.getArrayLengthAt(parentOffset)
      return index < length
    }

    if (parentSchema.kind === 'record') {
      const parentOffset = this.getOffsetForDynamicPath(parentPath)
      if (parentOffset === undefined) return false

      return this.decoder.findRecordValueOffset(parentOffset, key) !== undefined
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
    const offset = this.getOffsetForDynamicPath(path)
    if (offset === undefined) return 0

    this.decoder.seek(offset)
    return this.decoder.readArrayLength()
  }

  getRecordKeys(path: string[]): string[] {
    const offset = this.getOffsetForDynamicPath(path)
    if (offset === undefined) return []

    const schema = this.getCachedSchema(path)
    if (schema.kind !== 'record') return []

    this.decoder.seek(offset)
    return this.decoder.readRecordKeys(schema.valueSchema)
  }

  private getOffsetForPath(path: string[]): number | undefined {
    const pathKey = encodePath(path)
    const offsetIdx = this.indexMap.get(pathKey)
    if (offsetIdx === undefined) return undefined
    return this.offsetIndex.getOffset(offsetIdx)
  }

  /**
   * Get offset for a path that may contain dynamic segments (array indices, record keys, object fields).
   * Recursively resolves each path segment, handling both schema-indexed and dynamic paths.
   */
  private getOffsetForDynamicPath(path: string[]): number | undefined {
    // Try direct lookup first (fast path for schema-indexed paths)
    const directOffset = this.getOffsetForPath(path)
    if (directOffset !== undefined) return directOffset

    // Empty path means root - should have been found in direct lookup
    if (path.length === 0) return undefined

    // Recursively resolve parent path
    const parentPath = path.slice(0, -1)
    const parentOffset = this.getOffsetForDynamicPath(parentPath)
    if (parentOffset === undefined) return undefined

    const parentSchema = resolveRef(
      path.length === 1 ? this.schema : schemaAtPath(this.schema, parentPath, this.defs),
      this.defs
    )
    const key = path[path.length - 1]
    if (key === undefined) return undefined

    if (parentSchema.kind === 'array') {
      const index = parseInt(key, 10)
      if (isNaN(index) || index < 0) return undefined
      return this.decoder.getArrayElementOffset(parentOffset, index, parentSchema.elements)
    }

    if (parentSchema.kind === 'record') {
      return this.decoder.findRecordValueOffset(parentOffset, key)
    }

    if (parentSchema.kind === 'object') {
      const fieldDef = parentSchema.objectFields.find((f) => f.key === key)
      if (!fieldDef) return undefined
      return this.decoder.findObjectFieldOffset(parentOffset, fieldDef.index, parentSchema)
    }

    return undefined
  }

  /**
   * Get schema at path with caching for repeated access
   */
  private getCachedSchema(path: string[]): SerializedSchema {
    if (path.length === 0) {
      return resolveRef(this.schema, this.defs)
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
