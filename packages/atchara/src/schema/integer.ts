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

export interface IntegerConstraints {
  min?: number
  max?: number
  gt?: number
  lt?: number
  multipleOf?: number
}

export class IntegerSchema
  implements Schema<number, void, DeferredPrimitive<number>>, Parser<IntegerSchema>
{
  readonly _output!: number
  readonly _input!: void
  readonly _deferred!: DeferredPrimitive<number>

  private _constraints: IntegerConstraints | undefined
  private _parser?: NativeParser<IntegerSchema>

  get schema(): IntegerSchema {
    return this
  }

  get constraints(): IntegerConstraints | undefined {
    return this._constraints
  }

  min(n: number): IntegerSchema {
    const s = new IntegerSchema()
    s._constraints = { ...this._constraints, min: n }
    return s
  }

  max(n: number): IntegerSchema {
    const s = new IntegerSchema()
    s._constraints = { ...this._constraints, max: n }
    return s
  }

  gt(n: number): IntegerSchema {
    const s = new IntegerSchema()
    s._constraints = { ...this._constraints, gt: n }
    return s
  }

  lt(n: number): IntegerSchema {
    const s = new IntegerSchema()
    s._constraints = { ...this._constraints, lt: n }
    return s
  }

  multipleOf(n: number): IntegerSchema {
    const s = new IntegerSchema()
    s._constraints = { ...this._constraints, multipleOf: n }
    return s
  }

  parse(input: Uint8Array): InferDeferred<IntegerSchema> {
    return this.getParser().parse(input)
  }

  parseLarge(stream: Readable): Promise<LargeParseResult<IntegerSchema>> {
    return this.getParser().parseLarge(stream)
  }

  private getParser(): NativeParser<IntegerSchema> {
    if (!this._parser) {
      this._parser = new NativeParser(this)
    }
    return this._parser
  }

  serializeSchema(counter: { value: number } | null, _lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'integer' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      ...(this._constraints && { constraints: this._constraints }),
    }
  }
}
