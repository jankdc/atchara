import type { Schema, SerializedSchema, DeferredPrimitive, LazyContext } from '@atcharajs/core'

export class LiteralSchema<T extends string | number | boolean | null>
  implements Schema<T, T, DeferredPrimitive<T>>
{
  readonly _output!: T
  readonly _input!: T
  readonly _deferred!: DeferredPrimitive<T>

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _value: T) {}

  serializeSchema(counter: { value: number } | null, _lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'literal' as const,
      value: this._value,
      schemaIndex: counter ? counter.value++ : undefined,
    }
  }
}
