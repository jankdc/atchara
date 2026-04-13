---
name: develop
description: Development workflow for build, test, code quality, TypeScript guidance, and RFC 8259 compliance (project)
---

# Develop

## Workflow

1. **Code Quality** - Typecheck, lint, format
2. **Build & Test** - `npm run build && npm test`
3. **RFC Compliance** - When modifying parser

## Error Handling

- Don't disable errors without user confirmation
- Fix root cause (avoid type assertions)
- Prefer narrowing over widening types
- Follow TypeScript guidance below

## Build & Test

```bash
npm run build && npm test  # Build all packages + run all tests
```

**Code Quality:**

```bash
npm run typecheck            # Type check all packages
npm run lint                 # Lint all packages
npm run format               # Format code with Prettier
npm run format:check         # Check formatting without changing
```

**Package Structure:**

```
packages/
├── core/      @atcharajs/core    Schema types, parser interface, decoder
├── native/    @atcharajs/native  Rust N-API parsing engine
├── atchara/   atchara          Main public API
└── bench/     @atcharajs/bench   Benchmarks and profiling (private)
```

**Notes:**

- Build order: @atcharajs/core → @atcharajs/native → atchara
- Native build requires Rust and napi-rs
- Always build before testing

## RFC 8259 Compliance

When modifying parser, ensure strict RFC 8259 compliance.

**Character-Level:**

1. Unicode escapes: `\uXXXX` (4 hex only)
2. String escapes: `\"` `\\` `\/` `\b` `\f` `\n` `\r` `\t` (reject `\x`, `\0`, trailing `\`)
3. Numbers: `123`, `-45`, `1.23`, `1e10` (reject `01`, `.5`, `1.`)
4. Whitespace: space, tab, newline, CR only

**Structural:** 5. No duplicate object keys 6. Support 100+ nesting levels 7. No trailing commas 8. No comments 9. Single top-level value

**Invalid:** `undefined`, `NaN`, `Infinity`, single quotes, unquoted keys, `0xFF`, `0b101`, `0o77`

**Notes:**

- Correctness > performance
- Don't change test assertions without high confidence + explanation
- RFC 8259: https://datatracker.ietf.org/doc/html/rfc8259

## TypeScript Type Guidance

**Decision tree:**

1. Can you use a specific type? → Use it (preferred)
2. Need to perform operations? → Use `unknown` + type guards
3. Is concrete type ergonomic (≤3 generics)? → Create it
4. Otherwise → Use `any`/`unknown` with JSDoc examples

**Guidelines:**

- Narrower is better
- `unknown` > `any` (forces type checking)
- 3-generic threshold (more = too complex)
- Document loose types with JSDoc
- Never use `Object` or `{}` (use `object` or `Record<string, unknown>`)

**Usage:**

- Specific types: 90% of the time
- `unknown`: External data, JSON parsing, dynamic ops
- `any`: Complex transformations, rare (document well)
