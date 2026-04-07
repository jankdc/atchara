import type {
  Schema,
  SerializedSchema,
  LazyContext,
  Parser,
  InferDeferred,
  LargeParseResult,
} from '@atchara/core'
import type { Readable } from 'stream'
import { NativeParser } from '../native'

export class LazySchema<T extends Parser<Schema>>
  implements
    Schema<T['schema']['_output'], T['schema']['_input'], T['schema']['_deferred']>,
    Parser<LazySchema<T>>
{
  readonly _output!: T['schema']['_output']
  readonly _input!: T['schema']['_input']
  readonly _deferred!: T['schema']['_deferred']

  private _resolved?: T
  private _parser?: NativeParser<LazySchema<T>>
  // Guards against re-entrant thunk resolution (e.g., object() inside thunk
  // eagerly creates NativeParser which re-enters serializeSchema)
  private _resolving = false

  constructor(private _thunk: () => T) {}

  get schema(): LazySchema<T> {
    return this
  }

  parse(input: Uint8Array): InferDeferred<LazySchema<T>> {
    return this.getParser().parse(input)
  }

  parseLarge(stream: Readable): Promise<LargeParseResult<LazySchema<T>>> {
    return this.getParser().parseLarge(stream)
  }

  private getParser(): NativeParser<LazySchema<T>> {
    if (!this._parser) {
      this._parser = new NativeParser(this)
    }
    return this._parser
  }

  private resolve(): T {
    if (!this._resolved) {
      this._resolved = this._thunk()
    }
    return this._resolved
  }

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    // Per-context cycle detection via the lazy.seen map
    if (lazy?.seen.has(this)) {
      return { kind: 'ref' as const, defId: lazy.seen.get(this)! }
    }

    // Re-entrant call from NativeParser construction inside the thunk:
    // the thunk calls factory functions (object(), nullable(), etc.) that
    // eagerly create NativeParser with a fresh lazy context. That inner
    // NativeParser's schema is never used for parsing, so we return a
    // placeholder ref without registering in the inner context's defs.
    if (this._resolving) {
      return { kind: 'ref' as const, defId: 0 }
    }

    // Assign defId before resolving to catch cycles in the inner serialization
    let defId: number | undefined
    if (lazy) {
      defId = lazy.defs.length
      lazy.seen.set(this, defId)
      lazy.defs.push(undefined as unknown as SerializedSchema)
    }

    this._resolving = true
    const resolved = this.resolve()
    this._resolving = false

    const inner = resolved.schema.serializeSchema(counter, lazy)

    if (lazy && defId !== undefined) {
      lazy.defs[defId] = inner
      return { kind: 'ref' as const, defId }
    }

    return inner
  }
}
