import type {
  Schema,
  SerializedSchema,
  DeferredPrimitive,
  Parser,
  InferDeferred,
  LargeParseResult,
  LazyContext,
} from '@atchara/core'
import type { Readable } from 'stream'
import { NativeParser } from '../native'

export interface StringConstraints {
  min?: number
  max?: number
  pattern?: string
}

export class StringSchema
  implements Schema<string, void, DeferredPrimitive<string>>, Parser<StringSchema>
{
  readonly _output!: string
  readonly _input!: void
  readonly _deferred!: DeferredPrimitive<string>

  private _constraints: StringConstraints | undefined
  private _parser?: NativeParser<StringSchema>

  get schema(): StringSchema {
    return this
  }

  get constraints(): StringConstraints | undefined {
    return this._constraints
  }

  min(n: number): StringSchema {
    const s = new StringSchema()
    s._constraints = { ...this._constraints, min: n }
    return s
  }

  max(n: number): StringSchema {
    const s = new StringSchema()
    s._constraints = { ...this._constraints, max: n }
    return s
  }

  pattern(regex: RegExp | string): StringSchema {
    const s = new StringSchema()
    s._constraints = {
      ...this._constraints,
      pattern: typeof regex === 'string' ? regex : regex.source,
    }
    return s
  }

  parse(input: Uint8Array): InferDeferred<StringSchema> {
    return this.getParser().parse(input)
  }

  parseLarge(stream: Readable): Promise<LargeParseResult<StringSchema>> {
    return this.getParser().parseLarge(stream)
  }

  private getParser(): NativeParser<StringSchema> {
    if (!this._parser) {
      this._parser = new NativeParser(this)
    }
    return this._parser
  }

  serializeSchema(counter: { value: number } | null, _lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'string' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      ...(this._constraints && { constraints: this._constraints }),
    }
  }
}
