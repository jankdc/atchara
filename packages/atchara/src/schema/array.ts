import type {
  Parser,
  Schema,
  SerializedSchema,
  DeferredArray,
  InferDeferred,
  LargeParseResult,
  EachParseResult,
  LazyContext,
} from '@atcharajs/core'
import type { Readable } from 'stream'
import { NativeParser } from '../native'

export interface ArrayConstraints {
  min?: number
  max?: number
}

export class ArraySchema<T extends Parser<Schema>>
  implements
    Schema<
      T['schema']['_output'][],
      T['schema']['_input'][],
      DeferredArray<T['schema']['_output'], T['schema']['_deferred']>
    >,
    Parser<ArraySchema<T>>
{
  readonly _output!: T['schema']['_output'][]
  readonly _input!: T['schema']['_input'][]
  readonly _deferred!: DeferredArray<T['schema']['_output'], T['schema']['_deferred']>

  private _constraints: ArrayConstraints | undefined
  private _parser?: NativeParser<ArraySchema<T>>

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _elements: T) {}

  get schema(): ArraySchema<T> {
    return this
  }

  get constraints(): ArrayConstraints | undefined {
    return this._constraints
  }

  min(n: number): ArraySchema<T> {
    const s = new ArraySchema(this._elements)
    s._constraints = { ...this._constraints, min: n }
    return s
  }

  max(n: number): ArraySchema<T> {
    const s = new ArraySchema(this._elements)
    s._constraints = { ...this._constraints, max: n }
    return s
  }

  parse(input: Uint8Array): InferDeferred<ArraySchema<T>> {
    return this.getParser().parse(input)
  }

  parseLarge(stream: Readable): Promise<LargeParseResult<ArraySchema<T>>> {
    return this.getParser().parseLarge(stream)
  }

  /**
   * Parse a JSON array from a stream, yielding each element's deferred wrapper as it is parsed.
   * Call close() when done accessing yielded deferreds, or use `await using` for automatic cleanup.
   */
  parseEach(stream: Readable): EachParseResult<T['schema']['_deferred']> {
    return this.getParser().parseEach(stream) as EachParseResult<T['schema']['_deferred']>
  }

  private getParser(): NativeParser<ArraySchema<T>> {
    if (!this._parser) {
      this._parser = new NativeParser(this)
    }
    return this._parser
  }

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'array' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      elements: this._elements.schema.serializeSchema(null, lazy),
      ...(this._constraints && { constraints: this._constraints }),
    }
  }
}
