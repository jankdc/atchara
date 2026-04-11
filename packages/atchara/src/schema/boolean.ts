import type { Schema, SerializedSchema, DeferredPrimitive, LazyContext } from '@atcharajs/core'

export class BooleanSchema implements Schema<boolean, void, DeferredPrimitive<boolean>> {
  readonly _output!: boolean
  readonly _input!: void
  readonly _deferred!: DeferredPrimitive<boolean>

  serializeSchema(counter: { value: number } | null, _lazy?: LazyContext): SerializedSchema {
    return { kind: 'boolean' as const, schemaIndex: counter ? counter.value++ : undefined }
  }
}
