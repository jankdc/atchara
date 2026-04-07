import type { Parser, Schema, SerializedSchema, DeferredObject, LazyContext } from '@atchara/core'

type ObjectOutput<T extends Record<string, Parser<Schema>>> = {
  [K in keyof T]: T[K]['schema']['_output']
}

type ObjectInput<T extends Record<string, Parser<Schema>>> = {
  [K in keyof T]: T[K]['schema']['_input']
}

type ObjectDeferred<T extends Record<string, Parser<Schema>>> = {
  [K in keyof T]: T[K]['schema']['_deferred']
}

export class ObjectSchema<T extends Record<string, Parser<Schema>>>
  implements
    Schema<ObjectOutput<T>, ObjectInput<T>, DeferredObject<ObjectOutput<T>, ObjectDeferred<T>>>
{
  readonly _output!: ObjectOutput<T>
  readonly _input!: ObjectInput<T>
  readonly _deferred!: DeferredObject<ObjectOutput<T>, ObjectDeferred<T>>

  // can't make it private: https://github.com/microsoft/TypeScript/issues/35822
  constructor(public readonly _shape: T) {}

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'object',
      schemaIndex: counter ? counter.value++ : undefined,
      objectFields: Object.entries(this._shape).map(([key, parser], index) => ({
        key,
        index,
        schema: parser.schema.serializeSchema(counter, lazy),
      })),
    }
  }
}
