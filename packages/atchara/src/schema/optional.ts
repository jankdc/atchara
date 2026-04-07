import type { Parser, Schema, SerializedSchema, DeferredValue, LazyContext } from '@atchara/core'

export class OptionalSchema<T extends Parser<Schema>>
  implements
    Schema<
      T['schema']['_output'] | undefined,
      T['schema']['_input'] | undefined,
      T['schema']['_deferred'] | DeferredValue<undefined>
    >
{
  readonly _output!: T['schema']['_output'] | undefined
  readonly _input!: T['schema']['_input'] | undefined
  readonly _deferred!: T['schema']['_deferred'] | DeferredValue<undefined>

  // Brand to distinguish from NullableSchema (which has identical structure)
  readonly _brand = 'optional' as const

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _valueParser: T) {}

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'optional' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      inner: this._valueParser.schema.serializeSchema(null, lazy),
    }
  }
}
