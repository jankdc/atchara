# API Usage Guide

Schema-aware JSON parsing with type inference and deferred value access.

## Installation

```bash
npm install atchara
```

## Quick Start

```typescript
import { object, string, number, toBytes as b, InferValue } from 'atchara'

const User = object({
  name: string(),
  age: number(),
})

type User = InferValue<typeof User>

const result = User.parse(b`{"name":"Alice","age":30}`)
const user = result.toValue() // { name: "Alice", age: 30 }
```

## Schema Types

### Primitives

```typescript
import { string, number, integer, boolean, literal } from 'atchara'

string() // JSON string
number() // JSON number (integer or float)
integer() // JSON number (integer only, rejects floats)
boolean() // JSON true/false
literal('admin') // Exact string match
literal(42) // Exact number match
literal(true) // Exact boolean match
literal(null) // Exact null match
```

### Objects

Fixed-shape objects with known fields:

```typescript
import { object, string, number } from 'atchara'

const Person = object({
  name: string(),
  age: number(),
})
// Type: { name: string; age: number }
```

Objects reject unknown fields and require all defined fields to be present.

### Arrays

Homogeneous arrays where all elements share a type:

```typescript
import { array, number, object, string } from 'atchara'

const Numbers = array(number())
// Type: number[]

const Users = array(object({ id: number(), name: string() }))
// Type: { id: number; name: string }[]
```

### Tuples

Fixed-length arrays with specific types per position:

```typescript
import { tuple, string, number, boolean } from 'atchara'

const Point = tuple([number(), number()])
// Type: [number, number]

const Entry = tuple([string(), number(), boolean()])
// Type: [string, number, boolean]
```

Tuples enforce exact length - too few or too many elements fail validation.

### Records

Dynamic-key objects where keys are unknown at schema time:

```typescript
import { record, number } from 'atchara'

const Scores = record(number())
// Type: Record<string, number>
// Accepts: {"alice": 100, "bob": 85}
```

Use `object()` for known keys, `record()` for dynamic keys.

### Unions

Try multiple schemas in order until one matches:

```typescript
import { union, string, number, object, literal } from 'atchara'

const StringOrNumber = union([string(), number()])
// Type: string | number

// Discriminated unions for type-safe matching
const Event = union([
  object({ type: literal('click'), x: number(), y: number() }),
  object({ type: literal('keypress'), key: string() }),
])
// Type: { type: 'click'; x: number; y: number } | { type: 'keypress'; key: string }
```

Variants are tried in order. Put specific schemas before general ones:

```typescript
// Correct: literal first, generic string as fallback
union([literal('active'), literal('inactive'), string()])

// Wrong: string matches everything, literals never reached
union([string(), literal('active'), literal('inactive')])
```

### Nullable

Allow a value or `null`:

```typescript
import { nullable, string } from 'atchara'

const MaybeString = nullable(string())
// Type: string | null
```

### Optional

Mark object fields as optional (only valid in object definitions):

```typescript
import { object, string, number, optional } from 'atchara'

const Person = object({
  name: string(), // Required
  email: optional(string()), // Optional, undefined if missing
})
// Type: { name: string; email?: string }
```

### Recursive Types (lazy)

Define self-referential schemas with `lazy()`. Provide the output type as a type parameter:

```typescript
import { lazy, object, number, array } from 'atchara'

type TreeNode = { value: number; children: TreeNode[] }

const Node = lazy<TreeNode>(() =>
  object({
    value: number(),
    children: array(Node),
  })
)
// Node is Parser<Schema<TreeNode>>
```

Works with all wrappers — `nullable()`, `optional()`, `union()`:

```typescript
type ListNode = { value: number; next: ListNode | null }

const ListItem = lazy<ListNode>(() =>
  object({
    value: number(),
    next: nullable(ListItem),
  })
)
```

## Parsing

### Basic Usage

```typescript
import { object, string, number, toBytes as b } from 'atchara'

const User = object({ name: string(), age: number() })

// toBytes converts string to Uint8Array
const result = User.parse(b`{"name":"Alice","age":30}`)

// Materialize the full object
const user = result.toValue()
// { name: "Alice", age: 30 }
```

### Deferred Access

Parse results are deferred wrappers that allow lazy field access:

```typescript
const result = User.parse(b`{"name":"Alice","age":30}`)

// Access individual fields without materializing the whole object
result.get('name').toValue() // "Alice"
result.get('age').toValue() // 30

// Check field existence
result.has('name') // true

// Get all field names
result.keys() // ["name", "age"]

// Iterate over fields
for (const [key, value] of result) {
  console.log(key, value.toValue())
}
```

### Array Access

```typescript
import { array, number, toBytes as b } from 'atchara'

const Numbers = array(number())
const result = Numbers.parse(b`[10, 20, 30]`)

result.length // 3
result.at(0)?.toValue() // 10
result.at(1)?.toValue() // 20

// Iterate
for (const item of result) {
  console.log(item.toValue())
}

// Materialize all
result.toValue() // [10, 20, 30]
```

### Record Access

```typescript
import { record, number, toBytes as b } from 'atchara'

const Scores = record(number())
const result = Scores.parse(b`{"alice": 100, "bob": 85}`)

result.size // 2
result.keys() // ["alice", "bob"]
result.get('alice')?.toValue() // 100

// Iterate
for (const [key, value] of result) {
  console.log(key, value.toValue())
}
```

### Nested Access

Chain deferred accessors for nested structures:

```typescript
const Schema = object({
  user: object({
    profile: object({ name: string() }),
  }),
})

const result = Schema.parse(b`{"user":{"profile":{"name":"Deep"}}}`)
const name = result.get('user').get('profile').get('name').toValue()
// "Deep"
```

### Large Document Parsing

For documents too large to fit in memory, use `parseLarge()` with a `Readable` stream:

```typescript
import { object, string, number, array } from 'atchara'
import { createReadStream } from 'node:fs'

const Schema = object({
  data: array(object({ id: number(), name: string() })),
})

const stream = createReadStream('large-file.json')
const result = await Schema.parseLarge(stream)

// Access values lazily (backed by a temp kahon file)
const firstItem = result.data.get('data').at(0)?.toValue()

// Explicit cleanup required when done
result.close()
```

**Key differences from `parse()`:**

|           | `parse()`               | `parseLarge()`                             |
| --------- | ----------------------- | ------------------------------------------ |
| Input     | `Uint8Array`            | `Readable` stream                          |
| Storage   | In-memory binary buffer | Temp `.kahon` file (random-access B+tree)  |
| Lifecycle | Automatic (GC)          | Manual (`close()` required)                |
| Returns   | Deferred wrapper        | `LargeParseResult` with `data` + `close()` |

**LargeParseResult interface:**

```typescript
interface LargeParseResult<T> {
  data: InferDeferred<T> // Deferred-wrapped result
  close(): void // Delete the temp kahon file
  isClosed: boolean // Check if already closed
}
```

### Streaming Array Iteration

For large JSON arrays where you want to process elements as they arrive, use `parseEach()`:

```typescript
import { array, object, string, number } from 'atchara'

const Items = array(
  object({
    id: number(),
    name: string(),
  })
)

const stream = createReadStream('large-array.json')

for await (const item of Items.parseEach(stream)) {
  // Each item is a deferred wrapper — access fields lazily
  const name = item.get('name').toValue()
  console.log(name)

  // Or materialize the whole element
  const value = item.toValue()
}
```

**Key behaviors:**

- Only available on `ArraySchema` (root must be an array)
- Elements are yielded as deferred wrappers during parsing
- Errors (validation or JSON syntax) throw on the async iterator
- `break` stops parsing and cleans up resources
- `max` constraint is checked eagerly; `min` is skipped
- Yielded deferreds become invalid after the loop ends — call `.toValue()` during iteration

## Error Handling

```typescript
import { isAtcharaError } from 'atchara'

try {
  schema.parse(input)
} catch (error) {
  if (isAtcharaError(error)) {
    console.log(error.code) // Error type
    console.log(error.message) // Human-readable message
    console.log(error.position) // { line, column } if available
    console.log(error.details) // Error-specific details
  }
}
```

### Error Codes

| Code                   | Description               | Details             |
| ---------------------- | ------------------------- | ------------------- |
| `VALIDATION_ERROR`     | Type mismatch             | `expected`, `found` |
| `MISSING_REQUIRED`     | Missing object field      | `field`             |
| `UNEXPECTED_FIELD`     | Unknown object field      | `field`             |
| `UNION_NO_MATCH`       | No union variant matched  | `variantErrors`     |
| `UNEXPECTED_CHARACTER` | Invalid JSON character    | `character`         |
| `UNEXPECTED_EOF`       | Input ended unexpectedly  | -                   |
| `INVALID_UTF8`         | Invalid UTF-8 bytes       | `rawMessage`        |
| `INVALID_SCHEMA`       | Schema construction error | -                   |

## Type Inference

```typescript
import { InferValue, InferDeferred } from 'atchara'

const User = object({ name: string(), age: number() })

// Infer the output type
type User = InferValue<typeof User>
// { name: string; age: number }

// Infer the deferred result type
type DeferredUser = InferDeferred<typeof User>
// DeferredObject<{ name: string; age: number }, ...>
```

## Common Patterns

### API Response Validation

```typescript
const ApiResponse = object({
  data: array(
    object({
      id: number(),
      name: string(),
    })
  ),
  total: number(),
  page: number(),
})

async function fetchData() {
  const response = await fetch('/api/data')
  const bytes = new Uint8Array(await response.arrayBuffer())
  return ApiResponse.parse(bytes)
}
```

### Configuration Loading

```typescript
const Config = object({
  port: integer(),
  host: optional(string()),
  debug: optional(boolean()),
})

async function loadConfig(path: string) {
  const bytes = await Deno.readFile(path)
  return Config.parse(bytes).toValue()
}
```

### Discriminated Unions

```typescript
const Result = union([
  object({ status: literal('ok'), data: string() }),
  object({ status: literal('error'), code: number(), message: string() }),
])

const result = Result.parse(input)
const value = result.toValue()

if (value.status === 'ok') {
  console.log(value.data)
} else {
  console.log(`Error ${value.code}: ${value.message}`)
}
```
