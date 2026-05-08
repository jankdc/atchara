import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { toBytes as b } from '@atcharajs/core'
import {
  initialize,
  object,
  string,
  number,
  boolean,
  literal,
  array,
  nullable,
  optional,
} from '../src/index'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Object Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Object Parsing', () => {
      it('should parse empty objects', async () => {
        const parser = object({})
        expect(await parseWithMode(parser, b`{}`, options)).toEqual({})
        expect(await parseWithMode(parser, b`{ }`, options)).toEqual({})
        expect(await parseWithMode(parser, b`{\n}`, options)).toEqual({})
      })

      it('should parse simple objects', async () => {
        const parser = object({
          name: string(),
          age: number(),
        })

        expect(await parseWithMode(parser, b`{"name":"John","age":30}`, options)).toEqual({
          name: 'John',
          age: 30,
        })

        expect(await parseWithMode(parser, b`{ "name" : "John" , "age" : 30 }`, options)).toEqual({
          name: 'John',
          age: 30,
        })

        expect(
          await parseWithMode(parser, b`{\n  "name": "John",\n  "age": 30\n}`, options)
        ).toEqual({
          name: 'John',
          age: 30,
        })
      })

      it('should parse objects with all value types', async () => {
        const parser = object({
          name: string(),
          age: number(),
          isActive: boolean(),
          metadata: literal(null),
        })

        expect(
          await parseWithMode(
            parser,
            b`{"name":"John","age":30,"isActive":true,"metadata":null}`,
            options
          )
        ).toEqual({
          name: 'John',
          age: 30,
          isActive: true,
          metadata: null,
        })
      })
    })

    describe('Nested Objects', () => {
      it('should parse nested objects', async () => {
        const parser = object({
          user: object({
            name: string(),
            age: number(),
          }),
        })

        expect(await parseWithMode(parser, b`{"user":{"name":"John","age":30}}`, options)).toEqual({
          user: { name: 'John', age: 30 },
        })
      })

      it('should handle deeply nested structures', async () => {
        const parser = object({
          a: object({
            b: object({
              c: object({
                d: number(),
              }),
            }),
          }),
        })

        expect(await parseWithMode(parser, b`{"a":{"b":{"c":{"d":123}}}}`, options)).toEqual({
          a: { b: { c: { d: 123 } } },
        })
      })
    })

    describe('Error Handling', () => {
      it('should require double-quoted keys', async () => {
        const parser = object({ name: string() })

        // Single quotes not allowed - unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{'name':'John'}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 2 },
          details: { character: "'" },
        })

        // Unquoted keys not allowed - parser sees unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{name:"John"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 2 },
          details: { character: 'n' },
        })
      })

      it('should reject trailing commas', async () => {
        const parser = object({ a: number() })
        // Trailing comma expects another key after the comma
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1,}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 8 },
          details: { character: '}' },
        })
      })

      it('should provide helpful error messages', async () => {
        const parser = object({
          name: string(),
          age: number(),
        })

        // Type mismatch - expected digit but got string
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"name":"John","age":"thirty"}`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 22 },
            details: { expected: 'digit' },
          }
        )

        // Unclosed object - unexpected EOF
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"name":"John"`, options), {
          code: 'UNEXPECTED_EOF',
        })

        // Unquoted key - parser sees unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{name:"John"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 2 },
          details: { character: 'n' },
        })
      })

      it('should provide structured error for missing required fields', async () => {
        const parser = object({ name: string(), age: number() })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"name":"John"}`, options), {
          code: 'MISSING_REQUIRED',
          position: { line: 1, column: 2 },
          details: { field: 'age' },
        })
      })

      it('should provide structured error for type mismatch', async () => {
        const parser = object({ name: string(), age: number() })
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"name":"John","age":"thirty"}`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 22 },
            details: {
              expected: 'digit',
            },
          }
        )
      })

      it('should provide correct line/column for multiline objects', async () => {
        const parser = object({ name: string(), count: number() })
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{\n  "name": "test",\n  "count": "bad"\n}`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 3, column: 12 },
            details: { expected: 'digit' },
          }
        )
      })

      it('should provide structured error for invalid unquoted key', async () => {
        const parser = object({ name: string() })
        // Unquoted keys - parser sees unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{name:"John"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 2 },
          details: { character: 'n' },
        })
      })
    })

    describe('Duplicate Keys', () => {
      it('should handle duplicate keys (last wins)', async () => {
        const parser = object({ a: number() })
        expect(await parseWithMode(parser, b`{"a":1,"a":2}`, options)).toEqual({ a: 2 })
      })

      it('should handle duplicate keys (last wins)', async () => {
        const parser = object({ value: number() })
        // Last value wins and it must match the schema
        expect(await parseWithMode(parser, b`{"value":1,"value":42}`, options)).toEqual({
          value: 42,
        })
      })
    })

    describe('Schema Composition', () => {
      it('should handle complex nested schemas', async () => {
        const addressParser = object({
          street: string(),
          city: string(),
          zipCode: string(),
        })

        const personParser = object({
          name: string(),
          age: number(),
          isActive: boolean(),
          address: addressParser,
          tags: array(string()),
          metadata: nullable(
            object({
              createdAt: string(),
              updatedAt: string(),
            })
          ),
          links: array(
            object({
              id: string(),
            })
          ),
        })

        const input = JSON.stringify({
          name: 'John Doe',
          age: 30,
          isActive: true,
          address: {
            street: '123 Main St',
            city: 'New York',
            zipCode: '10001',
          },
          tags: ['developer', 'typescript'],
          metadata: null,
          links: [{ id: 'id-1' }, { id: 'id-2' }],
        })

        expect(await parseWithMode(personParser, b`${input}`, options)).toEqual({
          name: 'John Doe',
          age: 30,
          isActive: true,
          address: {
            street: '123 Main St',
            city: 'New York',
            zipCode: '10001',
          },
          tags: ['developer', 'typescript'],
          metadata: null,
          links: [{ id: 'id-1' }, { id: 'id-2' }],
        })
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should enforce double-quoted keys', async () => {
        const parser = object({ name: string() })

        // Valid: double-quoted keys
        expect(await parseWithMode(parser, b`{"name":"John"}`, options)).toEqual({ name: 'John' })

        // Invalid: single-quoted keys - unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{'name':'John'}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 2 },
          details: { character: "'" },
        })

        // Invalid: unquoted keys - parser sees unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{name:"John"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 2 },
          details: { character: 'n' },
        })
      })

      it('should reject trailing commas', async () => {
        const parser = object({ a: number(), b: string() })

        // Valid: no trailing comma
        expect(await parseWithMode(parser, b`{"a":1,"b":"test"}`, options)).toEqual({
          a: 1,
          b: 'test',
        })

        // Invalid: trailing comma at end of object with multiple fields
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"a":1,"b":"test",}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 19 },
            details: { character: '}' },
          }
        )

        // Invalid: trailing comma at end of object with single field
        const singleParser = object({ a: number() })
        await expectAtcharaErrorAsync(() => parseWithMode(singleParser, b`{"a":1,}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 8 },
          details: { character: '}' },
        })
      })

      it('should handle empty objects', async () => {
        const parser = object({})

        // Valid empty objects
        expect(await parseWithMode(parser, b`{}`, options)).toEqual({})
        expect(await parseWithMode(parser, b`{ }`, options)).toEqual({})
        expect(await parseWithMode(parser, b`{\n}`, options)).toEqual({})
        expect(await parseWithMode(parser, b`{\t}`, options)).toEqual({})
      })

      it('should require proper object structure', async () => {
        const parser = object({ name: string() })

        // Must start with { - parser sees unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`name:"John"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'n' },
        })

        // Must end with } - unexpected EOF
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"name":"John"`, options), {
          code: 'UNEXPECTED_EOF',
        })

        // Must have colon separator
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"name""John"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 8 },
          details: { character: '"' },
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle empty key names', async () => {
        const parser = object({
          '': string(),
          'special-chars': string(),
          'spaces in key': string(),
          '123': string(),
        })

        expect(
          await parseWithMode(
            parser,
            b`{"":"empty","special-chars":"test","spaces in key":"value","123":"numeric"}`,
            options
          )
        ).toEqual({
          '': 'empty',
          'special-chars': 'test',
          'spaces in key': 'value',
          '123': 'numeric',
        })
      })

      it('should handle keys with escape sequences', async () => {
        const parser = object({
          'line\nbreak': string(),
          'quote"mark': string(),
        })

        expect(
          await parseWithMode(parser, b`{"line\\nbreak":"test","quote\\"mark":"value"}`, options)
        ).toEqual({
          'line\nbreak': 'test',
          'quote"mark': 'value',
        })
      })

      it('should handle whitespace variations', async () => {
        const parser = object({ a: number(), b: string() })

        expect(await parseWithMode(parser, b`{"a":1,"b":"test"}`, options)).toEqual({
          a: 1,
          b: 'test',
        })
        expect(await parseWithMode(parser, b`{ "a" : 1 , "b" : "test" }`, options)).toEqual({
          a: 1,
          b: 'test',
        })
        expect(await parseWithMode(parser, b`{\n"a":1,\n"b":"test"\n}`, options)).toEqual({
          a: 1,
          b: 'test',
        })
        expect(await parseWithMode(parser, b`{\t"a":\t1,\t"b":\t"test"\t}`, options)).toEqual({
          a: 1,
          b: 'test',
        })
      })

      it('should handle unicode keys', async () => {
        const parser = object({
          世界: string(),
          émoji: string(),
          キー: number(),
        })
        expect(
          await parseWithMode(parser, b`{"世界":"hello","émoji":"test","キー":42}`, options)
        ).toEqual({
          世界: 'hello',
          émoji: 'test',
          キー: 42,
        })
      })

      it('should handle keys that look like booleans', async () => {
        const parser = object({
          true: string(),
          false: number(),
          null: boolean(),
        })
        expect(
          await parseWithMode(parser, b`{"true":"yes","false":42,"null":true}`, options)
        ).toEqual({
          true: 'yes',
          false: 42,
          null: true,
        })
      })

      it('should handle keys that look like numbers', async () => {
        const parser = object({
          '123': string(),
          '-456': number(),
          '1.5e10': boolean(),
        })
        expect(
          await parseWithMode(parser, b`{"123":"str","-456":789,"1.5e10":false}`, options)
        ).toEqual({
          '123': 'str',
          '-456': 789,
          '1.5e10': false,
        })
      })

      it('should handle very long key names', async () => {
        const longKey = 'a'.repeat(1000)
        const shape: Record<string, ReturnType<typeof number>> = {}
        shape[longKey] = number()
        const parser = object(shape)

        expect(await parseWithMode(parser, b`{"${longKey}":42}`, options)).toEqual({
          [longKey]: 42,
        })
      })

      it('should handle objects with all optional fields', async () => {
        const parser = object({
          a: optional(string()),
          b: optional(number()),
          c: optional(boolean()),
        })
        expect(await parseWithMode(parser, b`{}`, options)).toEqual({
          a: undefined,
          b: undefined,
          c: undefined,
        })
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer object types', () => {
      const _usersParser = object({
        name: string(),
        age: number(),
        isActive: boolean(),
      })

      type User = (typeof _usersParser)['schema']['_output']
      expectTypeOf<User>().toEqualTypeOf<{
        name: string
        age: number
        isActive: boolean
      }>()
    })

    it('should infer nested object types', () => {
      const addressParser = object({
        street: string(),
        city: string(),
        zipCode: string(),
      })

      const _usersParser = object({
        id: number(),
        name: string(),
        address: addressParser,
        tags: array(string()),
      })

      type User = (typeof _usersParser)['schema']['_output']
      expectTypeOf<User>().toEqualTypeOf<{
        id: number
        name: string
        address: {
          street: string
          city: string
          zipCode: string
        }
        tags: string[]
      }>()
    })
  })

  // Deferred Access - sync only
  describe('Deferred Access', () => {
    it('should access fields via get() without materializing the full object', async () => {
      const parser = object({
        name: string(),
        age: number(),
        active: boolean(),
      })

      const result = parser.parse(b`{"name":"Alice","age":30,"active":true}`)

      expect(await result.get('name').toValue()).toBe('Alice')
      expect(await result.get('age').toValue()).toBe(30)
      expect(await result.get('active').toValue()).toBe(true)
    })

    it('should check field existence via has()', async () => {
      const parser = object({
        required: string(),
        optionalField: optional(number()),
      })

      const withOptional = parser.parse(b`{"required":"test","optionalField":42}`)
      expect(await withOptional.has('required')).toBe(true)
      expect(await withOptional.has('optionalField')).toBe(true)

      const withoutOptional = parser.parse(b`{"required":"test"}`)
      expect(await withoutOptional.has('required')).toBe(true)
      expect(await withoutOptional.has('optionalField')).toBe(false)
    })

    it('should return field names via keys()', () => {
      const parser = object({
        a: string(),
        b: number(),
        c: boolean(),
      })

      const result = parser.parse(b`{"a":"x","b":1,"c":true}`)
      expect(result.keys()).toEqual(['a', 'b', 'c'])
    })

    it('should iterate over entries with Symbol.iterator', async () => {
      const parser = object({
        name: string(),
        count: number(),
      })

      const result = parser.parse(b`{"name":"test","count":5}`)
      const entries: Array<[string, unknown]> = []

      for (const [key, deferred] of result) {
        entries.push([key as string, await deferred.toValue()])
      }

      expect(entries).toEqual([
        ['name', 'test'],
        ['count', 5],
      ])
    })

    it('should access nested objects via get() without materializing parents', async () => {
      const parser = object({
        user: object({
          profile: object({
            name: string(),
          }),
        }),
      })

      const result = parser.parse(b`{"user":{"profile":{"name":"Deep"}}}`)
      const name = await result.get('user').get('profile').get('name').toValue()
      expect(name).toBe('Deep')
    })

    it('should access arrays within objects via get()', async () => {
      const parser = object({
        items: array(number()),
      })

      const result = parser.parse(b`{"items":[1,2,3]}`)
      const items = result.get('items')
      expect(await items.length()).toBe(3)
      expect(await (await items.at(0))?.toValue()).toBe(1)
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should handle large objects efficiently', async () => {
      const largeObjectParser = object({
        ...Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, number()])),
      })

      const largeObjectData = Object.fromEntries(
        Array.from({ length: 100 }, (_, i) => [`field${i}`, i])
      )

      const input = JSON.stringify(largeObjectData)
      const start = performance.now()
      const result = largeObjectParser.parse(b`${input}`)
      const duration = performance.now() - start

      expect(await result.toValue()).toEqual(largeObjectData)
      expect(duration).toBeLessThan(200) // Should parse efficiently
    })

    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
    it('should handle deeply nested objects efficiently', async () => {
      // Test with a reasonable nesting depth that should work
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createDeepParser = (depth: number): any => {
        if (depth === 0) {
          return object({ value: number() })
        }
        return object({ next: createDeepParser(depth - 1) })
      }

      const createDeepData = (depth: number): unknown => {
        if (depth === 0) {
          return { value: 42 }
        }
        return { next: createDeepData(depth - 1) }
      }

      // Test with 50 levels of nesting (should be safe for native parser)
      const depth = 50
      const parser = createDeepParser(depth)
      const data = createDeepData(depth)
      const input = JSON.stringify(data)

      const start = performance.now()
      const result = parser.parse(b`${input}`)
      const duration = performance.now() - start

      expect(await result.toValue()).toEqual(data)
      expect(duration).toBeLessThan(500) // Should parse efficiently
    })

    it.skip('should handle recursion limits gracefully', () => {
      // Test that we get a proper error when hitting native recursion limits
      // TODO: This test is skipped until native recursion limits are implemented
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const createVeryDeepParser = (depth: number): any => {
        if (depth === 0) {
          return object({ value: number() })
        }
        return object({ next: createVeryDeepParser(depth - 1) })
      }

      const createVeryDeepData = (depth: number): unknown => {
        if (depth === 0) {
          return { value: 42 }
        }

        return { next: createVeryDeepData(depth - 1) }
      }

      // Test with excessive nesting that should trigger recursion limit
      const depth = 1000
      const parser = createVeryDeepParser(depth)
      const data = createVeryDeepData(depth)
      const input = JSON.stringify(data)

      // Should throw an error due to recursion limit
      expect(() => parser.parse(b`${input}`)).toThrow()
    })
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  })
})
