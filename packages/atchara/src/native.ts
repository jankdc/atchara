/**
 * Native Parser implementation for Atchara.
 */

import { Buffer } from 'buffer'
import type { Readable } from 'stream'
import type {
  Parser,
  Schema,
  SerializedSchema,
  SerializedArraySchema,
  LargeParseResult,
  EachParseResult,
  InferDeferred,
  DeferredValue,
} from '@atcharajs/core'
import { wrapDeferred } from '@atcharajs/core'
import { FileSource } from 'kahon'
import { MemoryStore } from './store/memory'
import { KahonStore, SnapshotByteSource } from './store/kahon'
import { Atchara } from '@atcharajs/native'
import { encodePath } from './path'
import { ErrorDecoder } from './decoder/error'

export type NativeModule = {
  Atchara: typeof Atchara
}

export class NativeParser<T extends Schema> implements Parser<T> {
  private root: SerializedSchema
  private defs: SerializedSchema[]
  private native: Atchara
  private indexMap: Map<string, number>

  constructor(readonly schema: T) {
    const counter = { value: 0 }
    const lazy = { seen: new Map<object, number>(), defs: [] as SerializedSchema[] }
    this.root = schema.serializeSchema(counter, lazy)
    if (lazy.defs.some((d) => d === undefined)) {
      throw new Error(
        'Incomplete lazy defs: some definitions were not resolved during serialization'
      )
    }
    this.defs = lazy.defs

    this.native = new Atchara(this.root, this.defs.length > 0 ? this.defs : undefined)

    // Build index map once at construction time, reused for all parse() calls
    this.indexMap = buildIndexMap(this.root, this.defs)
  }

  parse(input: Uint8Array): InferDeferred<T> {
    const [isError, bytes] = this.native.parse(input)

    if (isError) {
      // Decode and throw the error
      const errorDecoder = new ErrorDecoder(bytes)
      throw errorDecoder.decode()
    }

    // Create MemoryStore with pre-built index map
    const store = new MemoryStore(bytes, this.root, this.indexMap, this.defs)

    // Return deferred wrapper that uses the store
    return wrapDeferred(store, [], this.root) as InferDeferred<T>
  }

  /**
   * Parse a JSON array from a stream, yielding each element as it is parsed.
   * Only valid when the root schema is an array.
   * Call close() when done accessing yielded deferreds, or use `await using` for automatic cleanup.
   *
   * Each yielded deferred is bound to a snapshot of the live `.kahon` file
   * at the moment that element became ready; subsequent reads from the same
   * deferred reuse that snapshot. Later snapshots can read earlier elements
   * because kahon allows orphaned bytes in the body.
   */
  parseEach(stream: Readable): EachParseResult<DeferredValue<unknown>> {
    const [session, handle] = this.native.createIteratingSession()
    const arraySchema = this.root as SerializedArraySchema
    const root = this.root
    const defs = this.defs
    const indexMap = this.indexMap
    const stores: KahonStore[] = []
    let closed = false

    // Each snapshot needs its own FileSource. The prefix length grows over
    // time (the writer keeps appending), but FileSource.size is captured at
    // open and used for read bounds-checks — so a single shared source would
    // see only the bytes available at first open.
    const buildSnapshotStore = async (prefixLen: bigint, tail: Buffer): Promise<KahonStore> => {
      const file = await FileSource.open(handle.path)
      const source = new SnapshotByteSource(file, Number(prefixLen), tail)
      const store = await KahonStore.fromSource(source, root, indexMap, defs)
      stores.push(store)
      return store
    }

    async function* iterate(): AsyncIterableIterator<DeferredValue<unknown>> {
      let complete = false

      try {
        for await (const chunk of stream) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array)
          const result = session.feed(bytes)

          if (
            result.readyIndices.length > 0 &&
            result.snapshotPrefixLen !== null &&
            result.snapshotPrefixLen !== undefined &&
            result.snapshotTail
          ) {
            const store = await buildSnapshotStore(result.snapshotPrefixLen, result.snapshotTail)
            for (const index of result.readyIndices) {
              yield wrapDeferred(store, [String(index)], arraySchema.elements)
            }
          }

          if (result.status === -1) {
            const errorDecoder = new ErrorDecoder(result.errorBytes)
            throw errorDecoder.decode()
          }

          if (result.status === 0) {
            complete = true
            break
          }
        }

        if (!complete) {
          const result = session.finish()

          if (
            result.readyIndices.length > 0 &&
            result.snapshotPrefixLen !== null &&
            result.snapshotPrefixLen !== undefined &&
            result.snapshotTail
          ) {
            const store = await buildSnapshotStore(result.snapshotPrefixLen, result.snapshotTail)
            for (const index of result.readyIndices) {
              yield wrapDeferred(store, [String(index)], arraySchema.elements)
            }
          }

          if (result.status === -1) {
            const errorDecoder = new ErrorDecoder(result.errorBytes)
            throw errorDecoder.decode()
          }
        }
      } finally {
        // Iterator finished or was thrown out of — ensure session winds down
        // so the temp file isn't held open forever.
        if (!closed) {
          session.abort()
        }
      }
    }

    const close = async (): Promise<void> => {
      if (closed) return
      closed = true
      session.abort()
      // Each store owns its own FileSource (held inside its ByteSource);
      // closing the store releases the underlying handle.
      for (const store of stores) {
        await store.close()
      }
      handle.close()
    }

    const result: EachParseResult<DeferredValue<unknown>> = {
      close: () => {
        void close()
      },
      get isClosed() {
        return closed
      },
      async [Symbol.asyncDispose]() {
        await close()
      },
      [Symbol.asyncIterator]() {
        return iterate()
      },
    }

    return result
  }

  /**
   * Parse large JSON documents incrementally from a readable stream.
   * Streams to a temp `.kahon` file as chunks arrive — never buffers the entire document.
   * Returns a result object with explicit close() for resource management.
   */
  async parseLarge(stream: Readable): Promise<LargeParseResult<T>> {
    const session = this.native.createStreamingSession()

    let store: KahonStore | undefined
    let handle: { close(): void; readonly isClosed: boolean } | undefined

    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as Uint8Array)
        const [status, errorBytes] = session.feed(bytes)

        // status: -1 = error, 0 = complete, 1 = needs more data
        if (status === -1) {
          const errorDecoder = new ErrorDecoder(errorBytes)
          throw errorDecoder.decode()
        }

        if (status === 0) break
      }

      const [isError, errorBytes, kahonHandle] = session.finish()

      if (isError || !kahonHandle) {
        const errorDecoder = new ErrorDecoder(errorBytes)
        throw errorDecoder.decode()
      }

      handle = kahonHandle
      store = await KahonStore.open(kahonHandle.path, this.root, this.indexMap, this.defs)

      const deferred = wrapDeferred(store, [], this.root) as InferDeferred<T>

      const closedRef = { closed: false }
      return {
        data: deferred,
        close: () => {
          if (closedRef.closed) return
          closedRef.closed = true
          // Best-effort async close; consumers requiring deterministic
          // cleanup should `await using` the result.
          void store!.close().finally(() => kahonHandle.close())
        },
        get isClosed() {
          return closedRef.closed
        },
      }
    } catch (error) {
      session.abort()
      // Ensure the temp file is reaped on the error path.
      if (store) {
        await store.close().catch(() => undefined)
      }
      handle?.close()
      throw error
    }
  }
}

/**
 * Build a map from path to schema index
 * Reads schemaIndex directly from serialized schema nodes
 */
function buildIndexMap(schema: SerializedSchema, defs: SerializedSchema[]): Map<string, number> {
  const map = new Map<string, number>()
  const visited = new Set<number>()

  const traverse = (s: SerializedSchema, pathParts: string[]): void => {
    if (s.schemaIndex !== undefined) {
      const pathKey = encodePath(pathParts)
      map.set(pathKey, s.schemaIndex)
    }

    switch (s.kind) {
      case 'optional':
      case 'nullable':
        break

      case 'object':
        for (const field of s.objectFields) {
          const fieldPath = [...pathParts, field.key]
          traverse(field.schema, fieldPath)
        }
        break

      case 'array':
        break

      case 'tuple':
        for (let i = 0; i < s.elements.length; i++) {
          const element = s.elements[i]
          if (!element) continue
          const elementPath = [...pathParts, String(i)]
          traverse(element, elementPath)
        }
        break

      case 'record':
        break

      case 'union':
        break

      case 'ref': {
        // Resolve ref but prevent infinite recursion
        if (!visited.has(s.defId)) {
          visited.add(s.defId)
          const target = defs[s.defId]
          if (target) {
            traverse(target, pathParts)
          }
        }
        break
      }

      default:
        break
    }
  }

  traverse(schema, [])
  return map
}
