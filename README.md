# Atchara

A fast, schema-aware, RFC 8259 compliant JSON parser, with static type inference. Unlike traditional approaches that parse JSON generically and then validate, Atchara generates optimized parsers specific to each schema, enabling significant performance improvements.

## Installation

```bash
npm install atchara
```

## Usage

```typescript
import * as u from 'atchara'

// Initialize native module once at app startup
await u.initialize()

const User = u.object({
  name: u.string(),
})

// Parse from UTF-8 encoded bytes
const input = new TextEncoder().encode('{ "name": "John" }')
const data = User.parse(input)
console.log(data.name)
```

## Common Usage Patterns

```typescript
import * as u from 'atchara'

// Initialize once at startup
await u.initialize()

// From string literal (for testing/development)
const bytes = new TextEncoder().encode('{"name":"John"}')
const data = User.parse(bytes)

// From fetch response (zero-copy)
const response = await fetch('/api/user')
const bytes = await response.bytes()
const data = User.parse(bytes)

// From file (Node.js)
import { readFile } from 'fs/promises'
const bytes = await readFile('data.json')
const data = User.parse(bytes)

// From WebSocket binary frame
socket.addEventListener('message', (event) => {
  const bytes = new Uint8Array(event.data)
  const data = User.parse(bytes)
})

// Complex nested schemas
const Post = u.object({
  id: u.number(),
  title: u.string(),
  author: u.object({
    name: u.string(),
    email: u.optional(u.string()),
  }),
  tags: u.array(u.string()),
  publishedAt: u.nullable(u.string()),
})
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run linting
npm run lint

# Type check
npm run typecheck
```

## Benchmarks

```bash
npm run build
npm run bench -w @atcharajs/bench
```

See [packages/bench/README.md](./packages/bench/README.md) for detailed benchmark documentation.

## Architecture

See [ARCHITECTURE.md](./docs/ARCHITECTURE.md) for project design.

## Publishing

This package is automatically published to npm when a new release is created on GitHub.

## License

MIT
