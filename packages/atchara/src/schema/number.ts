import type {
  Schema,
  SerializedSchema,
  DeferredPrimitive,
  Parser,
  InferDeferred,
  LargeParseResult,
  LazyContext,
} from '@atcharajs/core'
import type { Readable } from 'stream'
import { NativeParser } from '../native'

export interface NumberConstraints {
  min?: number
  max?: number
  gt?: number
  lt?: number
  multipleOf?: number
}

export class NumberSchema
  implements Schema<number, void, DeferredPrimitive<number>>, Parser<NumberSchema>
{
  readonly _output!: number
  readonly _input!: void
  readonly _deferred!: DeferredPrimitive<number>

  private _constraints: NumberConstraints | undefined
  private _parser?: NativeParser<NumberSchema>

  get schema(): NumberSchema {
    return this
  }

  get constraints(): NumberConstraints | undefined {
    return this._constraints
  }

  min(n: number): NumberSchema {
    const s = new NumberSchema()
    s._constraints = { ...this._constraints, min: n }
    return s
  }

  max(n: number): NumberSchema {
    const s = new NumberSchema()
    s._constraints = { ...this._constraints, max: n }
    return s
  }

  gt(n: number): NumberSchema {
    const s = new NumberSchema()
    s._constraints = { ...this._constraints, gt: n }
    return s
  }

  lt(n: number): NumberSchema {
    const s = new NumberSchema()
    s._constraints = { ...this._constraints, lt: n }
    return s
  }

  multipleOf(n: number): NumberSchema {
    const s = new NumberSchema()
    s._constraints = { ...this._constraints, multipleOf: n }
    return s
  }

  parse(input: Uint8Array): InferDeferred<NumberSchema> {
    return this.getParser().parse(input)
  }

  parseLarge(stream: Readable): Promise<LargeParseResult<NumberSchema>> {
    return this.getParser().parseLarge(stream)
  }

  private getParser(): NativeParser<NumberSchema> {
    if (!this._parser) {
      this._parser = new NativeParser(this)
    }
    return this._parser
  }

  serializeSchema(counter: { value: number } | null, _lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'number' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      ...(this._constraints && { constraints: this._constraints }),
    }
  }
}
