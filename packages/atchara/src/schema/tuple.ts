import type { Parser, Schema, SerializedSchema, DeferredTuple, LazyContext } from '@atchara/core'

// Type inference: extracts output types from parser tuple
// Access schema's _output directly through Parser interface
type TupleOutput<T extends readonly Parser<Schema>[]> = {
  [K in keyof T]: T[K] extends Parser<Schema> ? T[K]['schema']['_output'] : never
}

type TupleInput<T extends readonly Parser<Schema>[]> = {
  [K in keyof T]: T[K] extends Parser<Schema> ? T[K]['schema']['_input'] : never
}

type TupleDeferred<T extends readonly Parser<Schema>[]> = {
  [K in keyof T]: T[K] extends Parser<Schema> ? T[K]['schema']['_deferred'] : never
}

export class TupleSchema<T extends readonly Parser<Schema>[]>
  implements Schema<TupleOutput<T>, TupleInput<T>, DeferredTuple<TupleOutput<T>, TupleDeferred<T>>>
{
  readonly _output!: TupleOutput<T>
  readonly _input!: TupleInput<T>
  readonly _deferred!: DeferredTuple<TupleOutput<T>, TupleDeferred<T>>

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _elements: T) {}

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'tuple' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      elements: this._elements.map((e) => e.schema.serializeSchema(counter, lazy)),
    }
  }
}
