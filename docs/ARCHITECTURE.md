# Atchara Architecture

## The Problem

```
Traditional: JSON → JSON.parse() → any → Validator → Typed Result
Atchara:     JSON + Schema → Native Parser → Typed Result
```

Traditional approach has double work, memory waste, and loses type safety.

## Architecture

```mermaid
flowchart LR
    A[User Code] --> B[Schema Layer]
    B --> C[Native Parser]
    C --> D[TypeScript Decoder]
    D --> E[Typed Result]
```

**Layers:**

1. **Schema Layer** - Fluent API + phantom types for compile-time safety
2. **Native Layer** - Rust lexer/parser producing compact binary (via N-API)
3. **Decoder** - TypeScript reconstructs JS values from binary

**Parsing Modes:**

| Mode      | Method         | Input             | Storage                                   | Use Case              |
| --------- | -------------- | ----------------- | ----------------------------------------- | --------------------- |
| Direct    | `parse()`      | `Uint8Array`      | In-memory binary + offset table           | Standard documents    |
| Streaming | `parseLarge()` | `Readable` stream | Temp `.kahon` file (random-access B+tree) | Large documents       |
| Each      | `parseEach()`  | `Readable` stream | Temp `.kahon` file + trailer snapshots    | Large array streaming |

**Parsing Pipeline:**

1. Lexer tokenizes JSON bytes
2. Parser validates tokens against schema, encodes to storage
3. Decoder reads from storage using schema structure

## Guides

- [API Usage](./architecture/api-usage.md) - Complete usage guide with examples

## Deep Dives

- [Schema Layer](./architecture/schema-layer.md) - Types and serialization
- [Native Architecture](./architecture/native-architecture.md) - Parsing engine
- [Binary Format](./architecture/binary-format.md) - Wire format specification
- [Type Inference](./architecture/type-inference.md) - How types work
- [Deferred Evaluation](./architecture/deferred-evaluation.md) - Lazy value access
- [Parsing Flow](./architecture/parsing-flow.md) - End-to-end example
- [Error Handling](./architecture/error-handling.md) - Structured errors
- [Design Decisions](./architecture/design-decisions.md) - Why these choices
- [RFC 8259 Compliance](./architecture/rfc-compliance.md) - JSON standard
