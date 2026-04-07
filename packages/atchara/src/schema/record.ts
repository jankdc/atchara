import type {
  Parser,
  Schema,
  SerializedSchema,
  DeferredRecord,
  InferDeferred,
  LargeParseResult,
  LazyContext,
} from '@atchara/core'
import type { Readable } from 'stream'
import { NativeParser } from '../native'

export interface RecordConstraints {
  min?: number
  max?: number
}

export class RecordSchema<T extends Parser<Schema>>
  implements
    Schema<
      Record<string, T['schema']['_output']>,
      Record<string, T['schema']['_input']>,
      DeferredRecord<T['schema']['_output'], T['schema']['_deferred']>
    >,
    Parser<RecordSchema<T>>
{
  readonly _output!: Record<string, T['schema']['_output']>
  readonly _input!: Record<string, T['schema']['_input']>
  readonly _deferred!: DeferredRecord<T['schema']['_output'], T['schema']['_deferred']>

  private _constraints: RecordConstraints | undefined
  private _parser?: NativeParser<RecordSchema<T>>

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _valueSchema: T) {}

  get schema(): RecordSchema<T> {
    return this
  }

  get constraints(): RecordConstraints | undefined {
    return this._constraints
  }

  min(n: number): RecordSchema<T> {
    const s = new RecordSchema(this._valueSchema)
    s._constraints = { ...this._constraints, min: n }
    return s
  }

  max(n: number): RecordSchema<T> {
    const s = new RecordSchema(this._valueSchema)
    s._constraints = { ...this._constraints, max: n }
    return s
  }

  parse(input: Uint8Array): InferDeferred<RecordSchema<T>> {
    return this.getParser().parse(input)
  }

  parseLarge(stream: Readable): Promise<LargeParseResult<RecordSchema<T>>> {
    return this.getParser().parseLarge(stream)
  }

  private getParser(): NativeParser<RecordSchema<T>> {
    if (!this._parser) {
      this._parser = new NativeParser(this)
    }
    return this._parser
  }

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'record' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      valueSchema: this._valueSchema.schema.serializeSchema(null, lazy),
      ...(this._constraints && { constraints: this._constraints }),
    }
  }
}
