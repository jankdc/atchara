import type { Parser, Schema, SerializedSchema, DeferredNullable, LazyContext } from '@atchara/core'

export class NullableSchema<T extends Parser<Schema>>
  implements
    Schema<
      T['schema']['_output'] | null,
      T['schema']['_input'] | null,
      DeferredNullable<T['schema']['_output']>
    >
{
  readonly _output!: T['schema']['_output'] | null
  readonly _input!: T['schema']['_input'] | null
  readonly _deferred!: DeferredNullable<T['schema']['_output']>

  // Brand to distinguish from OptionalSchema (which has identical structure)
  readonly _brand = 'nullable' as const

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _valueParser: T) {}

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'nullable' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      inner: this._valueParser.schema.serializeSchema(null, lazy),
    }
  }
}
