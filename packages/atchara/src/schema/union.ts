import type {
  InvalidSchema,
  Parser,
  Schema,
  SerializedSchema,
  DeferredUnion,
  LazyContext,
} from '@atcharajs/core'

import { createAtcharaError } from '@atcharajs/core'
import { OptionalSchema } from './optional'

// Type inference: extracts union of output types from parser array
type UnionOutput<T extends readonly Parser<Schema>[]> = T[number]['schema']['_output']

type UnionInput<T extends readonly Parser<Schema>[]> = T[number]['schema']['_input']

export class UnionSchema<T extends readonly [Parser<Schema>, ...Parser<Schema>[]]>
  implements Schema<UnionOutput<T>, UnionInput<T>, DeferredUnion<UnionOutput<T>>>
{
  readonly _output!: UnionOutput<T>
  readonly _input!: UnionInput<T>
  readonly _deferred!: DeferredUnion<UnionOutput<T>>

  constructor(public readonly _variants: T) {
    // Runtime check for bypassed type safety (e.g., `as any` casts, JS consumers)
    for (const variant of _variants) {
      if (variant.schema instanceof OptionalSchema) {
        throw createAtcharaError<InvalidSchema>(
          'optional() cannot be used as a union variant. ' +
            'optional() is for object fields that may be absent. ' +
            'Use nullable() if you want a value that can be null.',
          {
            code: 'INVALID_SCHEMA',
          }
        )
      }
    }
  }

  serializeSchema(counter: { value: number } | null, lazy?: LazyContext): SerializedSchema {
    return {
      kind: 'union' as const,
      schemaIndex: counter ? counter.value++ : undefined,
      variants: this._variants.map((v) => v.schema.serializeSchema(null, lazy)),
    }
  }
}
