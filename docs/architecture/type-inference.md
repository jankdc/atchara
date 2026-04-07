# Type Inference

Atchara extracts TypeScript types from schemas at compile time using phantom types.

## Core Mechanism

```mermaid
flowchart LR
    A[Schema Definition] --> B[Phantom Type Properties]
    B --> C[InferValue / InferDeferred]
    C --> D[Extracted Type]
```

Each schema carries three phantom type properties:

```typescript
interface Schema<TOutput, TInput, TDeferred> {
  readonly _output: TOutput // Materialized value type
  readonly _input: TInput // Input type (for transformations)
  readonly _deferred: TDeferred // Deferred wrapper type
}
```

These properties are never instantiated at runtime. They exist only for TypeScript's type checker.

## Type Extraction

Two utility types extract types from schemas or parsers:

```typescript
// Extract the materialized value type
type InferValue<T extends Schema | Parser<Schema>> = ExtractSchema<T>['_output']

// Extract the deferred wrapper type
type InferDeferred<T extends Schema> = T['_deferred']
```

Usage:

```typescript
const User = object({ name: string(), age: number() })

type UserValue = InferValue<typeof User>
// { name: string; age: number }
```

## Schema Type Propagation

Composite schemas propagate types from their children:

```typescript
// ArraySchema extracts element type from inner parser
class ArraySchema<T extends Parser<Schema>> implements Schema<
  T['schema']['_output'][],           // string[] for array(string())
  T['schema']['_input'][],
  DeferredArray<T['schema']['_output'], T['schema']['_deferred']>
> { ... }

// ObjectSchema maps over shape to build output type
type ObjectOutput<T extends Record<string, Parser<Schema>>> = {
  [K in keyof T]: T[K]['schema']['_output']
}

// UnionSchema creates union of all variant output types
type UnionOutput<T extends readonly Parser<Schema>[]> = T[number]['schema']['_output']
```

## Type Mappings

| Schema          | `_output` Type      | `_deferred` Type                          |
| --------------- | ------------------- | ----------------------------------------- |
| `string()`      | `string`            | `DeferredPrimitive<string>`               |
| `number()`      | `number`            | `DeferredPrimitive<number>`               |
| `integer()`     | `number`            | `DeferredPrimitive<number>`               |
| `boolean()`     | `boolean`           | `DeferredPrimitive<boolean>`              |
| `literal('x')`  | `'x'`               | `DeferredPrimitive<'x'>`                  |
| `nullable(T)`   | `T \| null`         | `DeferredNullable<T>`                     |
| `optional(T)`   | `T \| undefined`    | `Deferred<T> \| DeferredValue<undefined>` |
| `array(T)`      | `T[]`               | `DeferredArray<T, DeferredT>`             |
| `tuple([A,B])`  | `[A, B]`            | `DeferredTuple<[A,B], [DA,DB]>`           |
| `object({...})` | `{ ... }`           | `DeferredObject<{...}, {...}>`            |
| `record(T)`     | `Record<string, T>` | `DeferredRecord<T, DeferredT>`            |
| `union([A,B])`  | `A \| B`            | `DeferredUnion<A \| B>`                   |

## Deferred Type System

Parse results return deferred wrappers that preserve type information for lazy access:

```typescript
const User = object({ name: string(), age: number() })
const result = User.parse(bytes)
// Type: DeferredObject<{ name: string; age: number }, { name: DeferredPrimitive<string>; age: DeferredPrimitive<number> }>

result.get('name') // DeferredPrimitive<string>
result.get('age') // DeferredPrimitive<number>
result.toValue() // { name: string; age: number }
```

Deferred wrappers carry two type parameters:

1. **Value type** - the materialized JavaScript type
2. **Element deferred type** - deferred types for nested access (arrays, objects, tuples, records)

## Composability

Types compose through schema nesting:

```typescript
const Address = object({ city: string(), zip: number() })
const User = object({ name: string(), address: Address })

type UserType = InferValue<typeof User>
// { name: string; address: { city: string; zip: number } }
```

## Benefits

- **Single source of truth** - schema defines both runtime validation and static types
- **IDE support** - full autocompletion and type checking on parsed results
- **Refactoring safety** - schema changes propagate to all usages
- **Zero runtime cost** - phantom types exist only at compile time
