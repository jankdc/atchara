/**
 * KahonStore implements ValueStore for kahon-backed storage.
 *
 * The kahon binary format is JSON-shaped, so we use the schema to navigate
 * a `Cursor` from kahon-js and to decode values whose JSON shape carries
 * additional schema-only meaning (e.g., unions encoded as `[index, value]`).
 */

import { Buffer } from 'node:buffer'
import { type ByteSource, Cursor, KahonReader, type KahonValue } from 'kahon'
import type {
  FieldMetadata,
  SerializedRecordSchema,
  SerializedSchema,
  SerializedUnionSchema,
  ValueStore,
} from '@atcharajs/core'
import { resolveRef, schemaAtPath } from '@atcharajs/core'
import { encodePath } from '../path'

/**
 * Like a `Disposable` but for any source we want to release when the store
 * itself is closed. `FileSource` exposes `close()`; `BufferSource` does not.
 */
export type CloseableByteSource = ByteSource & { close?(): Promise<void> | void }

export class KahonStore implements ValueStore {
  private schemaCache = new Map<string, SerializedSchema>()
  private closed = false

  constructor(
    private reader: KahonReader,
    private source: CloseableByteSource,
    private rootSchema: SerializedSchema,
    private indexMap: Map<string, number>,
    private defs: SerializedSchema[]
  ) {}

  /** Open a kahon file from disk. Holds an OS file handle until closed. */
  static async open(
    path: string,
    rootSchema: SerializedSchema,
    indexMap: Map<string, number>,
    defs: SerializedSchema[]
  ): Promise<KahonStore> {
    // Lazily import FileSource to avoid pulling fs into bundles that don't need it.
    const { FileSource } = await import('kahon')
    const source = await FileSource.open(path)
    const reader = await KahonReader.fromSource(source)
    return new KahonStore(reader, source, rootSchema, indexMap, defs)
  }

  /** Open a kahon document from a [`ByteSource`] (for parseEach snapshots). */
  static async fromSource(
    source: CloseableByteSource,
    rootSchema: SerializedSchema,
    indexMap: Map<string, number>,
    defs: SerializedSchema[]
  ): Promise<KahonStore> {
    const reader = await KahonReader.fromSource(source)
    return new KahonStore(reader, source, rootSchema, indexMap, defs)
  }

  getDefs(): SerializedSchema[] {
    return this.defs
  }

  get isClosed(): boolean {
    return this.closed
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.source.close) {
      await this.source.close()
    }
  }

  async get(path: string[]): Promise<unknown> {
    this.ensureOpen()
    const target = await this.cursorAt(path)
    if (!target) return undefined
    return await this.decodeWithSchema(target.cursor, target.schema)
  }

  async has(path: string[]): Promise<boolean> {
    this.ensureOpen()
    if (path.length === 0) return true

    const parentPath = path.slice(0, -1)
    const key = path[path.length - 1]
    if (key === undefined) return false

    const parent = await this.cursorAt(parentPath)
    if (!parent) return false

    const parentSchema = unwrapForKahon(parent.schema, this.defs)

    switch (parentSchema.kind) {
      case 'object': {
        const fieldDef = parentSchema.objectFields.find((f) => f.key === key)
        if (!fieldDef) return false
        return await parent.cursor.has(key)
      }
      case 'array': {
        const index = parseInt(key, 10)
        if (isNaN(index) || index < 0) return false
        const length = await parent.cursor.length()
        return index < length
      }
      case 'tuple': {
        const index = parseInt(key, 10)
        if (isNaN(index) || index < 0) return false
        return index < parentSchema.elements.length
      }
      case 'record': {
        return await parent.cursor.has(key)
      }
      default:
        return false
    }
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

  async getArrayLength(path: string[]): Promise<number> {
    this.ensureOpen()
    const target = await this.cursorAt(path)
    if (!target) return 0
    if ((await target.cursor.kind()) !== 'array') return 0
    return await target.cursor.length()
  }

  async getRecordKeys(path: string[]): Promise<string[]> {
    this.ensureOpen()
    const target = await this.cursorAt(path)
    if (!target) return []
    if ((await target.cursor.kind()) !== 'object') return []

    const out: string[] = []
    for await (const k of target.cursor.keys()) {
      out.push(k)
    }
    return out
  }

  // ----------------------------------------------------------------------
  // Schema-driven cursor navigation
  // ----------------------------------------------------------------------

  /**
   * Walk `path` from the root, descending the kahon cursor and the schema
   * in parallel. At each step, unwrap optional/nullable/ref/union wrappers
   * (the union case advances the cursor through its `[index, value]`
   * envelope and resolves the schema to the matched variant).
   *
   * Returns `undefined` if the path is invalid given the schema or doesn't
   * exist in the kahon document.
   */
  private async cursorAt(
    path: string[]
  ): Promise<{ cursor: Cursor; schema: SerializedSchema } | undefined> {
    const root = await this.reader.root()
    let current: { cursor: Cursor; schema: SerializedSchema } | undefined = {
      cursor: root,
      schema: this.rootSchema,
    }
    current = await this.unwrap(current)

    for (const segment of path) {
      if (!current) return undefined
      const schema = unwrapForKahon(current.schema, this.defs)

      switch (schema.kind) {
        case 'object': {
          const fieldDef = schema.objectFields.find((f) => f.key === segment)
          if (!fieldDef) return undefined
          const next = await current.cursor.get(segment)
          if (!next) return undefined
          current = { cursor: next, schema: fieldDef.schema }
          break
        }
        case 'array': {
          const index = parseInt(segment, 10)
          if (isNaN(index)) return undefined
          const next = await current.cursor.at(index)
          if (!next) return undefined
          current = { cursor: next, schema: schema.elements }
          break
        }
        case 'tuple': {
          const index = parseInt(segment, 10)
          if (isNaN(index)) return undefined
          const elemSchema = schema.elements[index]
          if (!elemSchema) return undefined
          const next = await current.cursor.at(index)
          if (!next) return undefined
          current = { cursor: next, schema: elemSchema }
          break
        }
        case 'record': {
          const next = await current.cursor.get(segment)
          if (!next) return undefined
          current = { cursor: next, schema: schema.valueSchema }
          break
        }
        default:
          return undefined
      }

      current = await this.unwrap(current)
    }

    return current
  }

  /**
   * Resolve `ref`/`optional`/`nullable`/`union` wrappers in the schema. For
   * `union`, this advances the cursor through the variant envelope so the
   * caller can keep descending against the matched variant's schema. For
   * `nullable`, if the cursor's actual value is `null`, navigation past it
   * is invalid — return `undefined` so the caller short-circuits.
   */
  private async unwrap(
    state: { cursor: Cursor; schema: SerializedSchema } | undefined
  ): Promise<{ cursor: Cursor; schema: SerializedSchema } | undefined> {
    if (!state) return undefined
    let cursor = state.cursor
    let schema: SerializedSchema = state.schema

    while (true) {
      schema = resolveRef(schema, this.defs)
      if (schema.kind === 'optional') {
        schema = schema.inner
        continue
      }
      if (schema.kind === 'nullable') {
        if ((await cursor.kind()) === 'null') {
          // The actual value is null — keep the schema as nullable so a
          // direct decode at this position returns null. But if the caller
          // tries to descend past it, that path doesn't exist.
          return { cursor, schema }
        }
        schema = schema.inner
        continue
      }
      if (schema.kind === 'union') {
        const variant = await this.resolveUnionVariant(cursor, schema)
        if (!variant) return undefined
        cursor = variant.cursor
        schema = variant.schema
        continue
      }
      break
    }

    return { cursor, schema }
  }

  private async resolveUnionVariant(
    cursor: Cursor,
    schema: SerializedUnionSchema
  ): Promise<{ cursor: Cursor; schema: SerializedSchema } | undefined> {
    if ((await cursor.kind()) !== 'array') return undefined
    const indexCursor = await cursor.at(0)
    if (!indexCursor) return undefined
    const indexValue = await indexCursor.decode()
    const variantIndex =
      typeof indexValue === 'number'
        ? indexValue
        : typeof indexValue === 'bigint'
          ? Number(indexValue)
          : NaN
    if (!Number.isFinite(variantIndex)) return undefined
    const variant = schema.variants[variantIndex]
    if (!variant) return undefined
    const valueCursor = await cursor.at(1)
    if (!valueCursor) return undefined
    return { cursor: valueCursor, schema: variant }
  }

  // ----------------------------------------------------------------------
  // Schema-aware decode (post-process kahon's JSON-shape decode)
  // ----------------------------------------------------------------------

  /**
   * Materialize the value at `cursor` interpreted under `schema`. Most types
   * pass through `cursor.decode()`; the schema-only types (union, nullable
   * structural) need adjustments.
   */
  private async decodeWithSchema(cursor: Cursor, schema: SerializedSchema): Promise<unknown> {
    const resolved = resolveRef(schema, this.defs)
    switch (resolved.kind) {
      case 'optional':
        // The optional wrapper has meaning only in the parent object's
        // iteration (whether the key exists). At decode time, the cursor
        // already points at a present value, so just recurse into the inner.
        return await this.decodeWithSchema(cursor, resolved.inner)
      case 'nullable': {
        if ((await cursor.kind()) === 'null') return null
        return await this.decodeWithSchema(cursor, resolved.inner)
      }
      case 'union': {
        const variant = await this.resolveUnionVariant(cursor, resolved)
        if (!variant) return undefined
        return await this.decodeWithSchema(variant.cursor, variant.schema)
      }
      case 'object': {
        const out: Record<string, unknown> = {}
        for (const field of resolved.objectFields) {
          const child = await cursor.get(field.key)
          if (!child) {
            // Field is absent. `optional` fields are explicitly allowed to
            // be missing — surface as `key: undefined` to match the sync
            // decoder. Required fields shouldn't be missing here, but if
            // they are we still produce the key so `keys(obj)` matches.
            if (resolveRef(field.schema, this.defs).kind === 'optional') {
              out[field.key] = undefined
            }
            continue
          }
          out[field.key] = await this.decodeWithSchema(child, field.schema)
        }
        return out
      }
      case 'record': {
        return await this.decodeRecord(cursor, resolved)
      }
      case 'array': {
        const length = await cursor.length()
        const out: unknown[] = new Array(length)
        for (let i = 0; i < length; i++) {
          const child = await cursor.at(i)
          if (!child) continue
          out[i] = await this.decodeWithSchema(child, resolved.elements)
        }
        return out
      }
      case 'tuple': {
        const out: unknown[] = new Array(resolved.elements.length)
        for (let i = 0; i < resolved.elements.length; i++) {
          const elemSchema = resolved.elements[i]
          if (!elemSchema) continue
          const child = await cursor.at(i)
          if (!child) continue
          out[i] = await this.decodeWithSchema(child, elemSchema)
        }
        return out
      }
      case 'string':
      case 'number':
      case 'integer':
      case 'boolean':
      case 'literal': {
        const value = await cursor.decode()
        return coerceScalar(value, resolved)
      }
      case 'ref':
        return await this.decodeWithSchema(cursor, this.defs[resolved.defId]!)
    }
  }

  private async decodeRecord(
    cursor: Cursor,
    schema: SerializedRecordSchema
  ): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {}
    for await (const [key, child] of cursor.entries()) {
      out[key] = await this.decodeWithSchema(child, schema.valueSchema)
    }
    return out
  }

  private getCachedSchema(path: string[]): SerializedSchema {
    if (path.length === 0) return this.rootSchema
    const pathKey = encodePath(path)
    let schema = this.schemaCache.get(pathKey)
    if (schema === undefined) {
      schema = schemaAtPath(this.rootSchema, path, this.defs)
      this.schemaCache.set(pathKey, schema)
    }
    return schema
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('KahonStore is closed')
    }
  }
}

// ============================================================================
// SnapshotByteSource - layer a synthesized trailer over a live kahon file
// ============================================================================

/**
 * `parseEach` writes a kahon document incrementally to a temp file. After
 * each batch of ready elements, the Rust side emits a `TrailerSnapshot`
 * `(prefixLen, tail)` that, concatenated with the first `prefixLen` bytes
 * of the live file, forms a complete kahon document.
 *
 * `SnapshotByteSource` exposes that virtual document to kahon-js's reader
 * without ever having to copy the prefix into memory.
 */
export class SnapshotByteSource implements ByteSource {
  readonly size: number

  constructor(
    private fileSource: ByteSource & { close?(): Promise<void> | void },
    private prefixLen: number,
    private tail: Buffer
  ) {
    this.size = prefixLen + tail.length
  }

  async read(offset: number, length: number): Promise<Buffer> {
    if (offset < 0 || length < 0 || offset + length > this.size) {
      throw new Error(
        `SnapshotByteSource read out of bounds (offset=${offset} length=${length} size=${this.size})`
      )
    }
    if (length === 0) return Buffer.alloc(0)

    const end = offset + length

    if (end <= this.prefixLen) {
      return await this.fileSource.read(offset, length)
    }
    if (offset >= this.prefixLen) {
      const tailOffset = offset - this.prefixLen
      return Buffer.from(this.tail.subarray(tailOffset, tailOffset + length))
    }

    // Straddles the boundary: stitch.
    const prefixPart = await this.fileSource.read(offset, this.prefixLen - offset)
    const tailPart = this.tail.subarray(0, end - this.prefixLen)
    return Buffer.concat([prefixPart, tailPart], length)
  }

  async close(): Promise<void> {
    await this.fileSource.close?.()
  }
}

// ============================================================================
// helpers
// ============================================================================

/**
 * Strip ref/optional/nullable wrappers when cursor navigation needs to know
 * the underlying container kind. (Union is *not* stripped here because its
 * unwrap requires advancing the cursor — see `KahonStore.unwrap`.)
 */
function unwrapForKahon(schema: SerializedSchema, defs: SerializedSchema[]): SerializedSchema {
  let s = resolveRef(schema, defs)
  while (s.kind === 'optional' || s.kind === 'nullable') {
    s = resolveRef(s.inner, defs)
  }
  return s
}

/**
 * Massage a kahon scalar back into the JS shape atchara's decoder used to
 * return. Integers come back as bigint when out of safe-int range — for now
 * we coerce to number to preserve the existing API; this loses precision
 * past 2^53 but matches the in-memory backend's behaviour.
 */
function coerceScalar(value: KahonValue, schema: SerializedSchema): unknown {
  if (typeof value === 'bigint') {
    if (schema.kind === 'integer' || schema.kind === 'number') {
      return Number(value)
    }
  }
  return value
}
