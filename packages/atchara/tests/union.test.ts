import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { toBytes as b } from '@atcharajs/core'

import {
  initialize,
  union,
  string,
  number,
  boolean,
  object,
  array,
  nullable,
  optional,
  literal,
} from '../src/index'

import { OptionalSchema } from '../src/schema/optional'
import {
  expectAtcharaError,
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

import type { Parser, Schema } from '../src/index'

const testMatrix = createTestMatrix()

describe('Union Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Primitive Unions', () => {
      it('should parse string and number variants', async () => {
        const parser = union([string(), number()])
        expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        expect(await parseWithMode(parser, b`42`, options)).toBe(42)
      })

      it('should parse multiple primitive types', async () => {
        const parser = union([string(), number(), boolean()])
        expect(await parseWithMode(parser, b`"text"`, options)).toBe('text')
        expect(await parseWithMode(parser, b`123`, options)).toBe(123)
        expect(await parseWithMode(parser, b`true`, options)).toBe(true)
        expect(await parseWithMode(parser, b`false`, options)).toBe(false)
      })

      it('should parse union with 4+ variants', async () => {
        const parser = union([string(), number(), boolean(), array(string())])
        expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        expect(await parseWithMode(parser, b`true`, options)).toBe(true)
        expect(await parseWithMode(parser, b`["a","b"]`, options)).toEqual(['a', 'b'])
      })

      it('should parse union with 10+ variants for index encoding', async () => {
        const parser = union([
          literal('a'),
          literal('b'),
          literal('c'),
          literal('d'),
          literal('e'),
          literal('f'),
          literal('g'),
          literal('h'),
          literal('i'),
          literal('j'),
          literal('k'),
        ])
        expect(await parseWithMode(parser, b`"a"`, options)).toBe('a')
        expect(await parseWithMode(parser, b`"f"`, options)).toBe('f')
        expect(await parseWithMode(parser, b`"k"`, options)).toBe('k')
      })

      describe('Numeric Edge Cases', () => {
        it('should parse negative and zero values', async () => {
          const parser = union([string(), number()])
          expect(await parseWithMode(parser, b`-42`, options)).toBe(-42)
          expect(await parseWithMode(parser, b`-0.5`, options)).toBe(-0.5)
          expect(await parseWithMode(parser, b`0`, options)).toBe(0)
          expect(Object.is(await parseWithMode(parser, b`-0`, options), -0)).toBe(true)
        })

        it('should parse scientific notation', async () => {
          const parser = union([string(), number()])
          expect(await parseWithMode(parser, b`1e10`, options)).toBe(1e10)
          expect(await parseWithMode(parser, b`1.5e-3`, options)).toBe(1.5e-3)
          expect(await parseWithMode(parser, b`2.5E+10`, options)).toBe(2.5e10)
        })

        it('should parse extreme values', async () => {
          const parser = union([string(), number()])
          expect(await parseWithMode(parser, b`9007199254740991`, options)).toBe(
            Number.MAX_SAFE_INTEGER
          )
          expect(await parseWithMode(parser, b`1e308`, options)).toBe(1e308)
          expect(await parseWithMode(parser, b`0.000001`, options)).toBe(0.000001)
          expect(await parseWithMode(parser, b`1e-10`, options)).toBe(1e-10)
        })
      })

      describe('String Edge Cases', () => {
        it('should parse empty and unicode strings', async () => {
          const parser = union([string(), number()])
          expect(await parseWithMode(parser, b`""`, options)).toBe('')
          expect(await parseWithMode(parser, b`"こんにちは"`, options)).toBe('こんにちは')
          expect(await parseWithMode(parser, b`"emoji: 🎉"`, options)).toBe('emoji: 🎉')
        })

        it('should parse escaped characters', async () => {
          const parser = union([string(), number()])
          expect(await parseWithMode(parser, b`"line1\\nline2"`, options)).toBe('line1\nline2')
          expect(await parseWithMode(parser, b`"\\b\\f\\n\\r\\t"`, options)).toBe('\b\f\n\r\t')
          expect(await parseWithMode(parser, b`"back\\\\slash"`, options)).toBe('back\\slash')
          expect(await parseWithMode(parser, b`"quote\\"here"`, options)).toBe('quote"here')
          expect(await parseWithMode(parser, b`"\\u0041"`, options)).toBe('A')
        })

        it('should parse strings that look like other types', async () => {
          const parser = union([string(), number(), boolean()])
          expect(await parseWithMode(parser, b`"true"`, options)).toBe('true')
          expect(await parseWithMode(parser, b`"42"`, options)).toBe('42')
          expect(await parseWithMode(parser, b`"null"`, options)).toBe('null')
        })
      })
    })

    describe('Object Unions', () => {
      it('should parse objects with different required fields', async () => {
        const parser = union([
          object({ name: string(), email: string() }),
          object({ name: string(), age: number() }),
        ])
        expect(
          await parseWithMode(parser, b`{"name":"John","email":"john@example.com"}`, options)
        ).toEqual({
          name: 'John',
          email: 'john@example.com',
        })
        expect(await parseWithMode(parser, b`{"name":"Jane","age":30}`, options)).toEqual({
          name: 'Jane',
          age: 30,
        })
      })

      it('should handle different field orders', async () => {
        const parser = union([
          object({ name: string(), email: string() }),
          object({ name: string(), age: number() }),
        ])
        expect(
          await parseWithMode(parser, b`{"email":"test@test.com","name":"Test"}`, options)
        ).toEqual({
          name: 'Test',
          email: 'test@test.com',
        })
      })

      it('should handle objects with same fields but different types', async () => {
        const parser = union([
          object({ id: string(), name: string() }),
          object({ id: number(), name: string() }),
        ])
        expect(await parseWithMode(parser, b`{"id":"abc","name":"test"}`, options)).toEqual({
          id: 'abc',
          name: 'test',
        })
        expect(await parseWithMode(parser, b`{"id":123,"name":"test"}`, options)).toEqual({
          id: 123,
          name: 'test',
        })
      })

      it('should handle single-field objects', async () => {
        const parser = union([object({ only: string() }), object({ other: number() })])
        expect(await parseWithMode(parser, b`{"only":"value"}`, options)).toEqual({ only: 'value' })
        expect(await parseWithMode(parser, b`{"other":42}`, options)).toEqual({ other: 42 })
      })

      describe('Discriminated Unions', () => {
        it('should work with literal discriminators', async () => {
          const parser = union([
            object({ type: literal('success'), data: string() }),
            object({ type: literal('error'), message: string() }),
          ])
          expect(
            await parseWithMode(parser, b`{"type":"success","data":"result"}`, options)
          ).toEqual({
            type: 'success',
            data: 'result',
          })
          expect(
            await parseWithMode(parser, b`{"type":"error","message":"failed"}`, options)
          ).toEqual({
            type: 'error',
            message: 'failed',
          })
        })

        it('should handle API response patterns', async () => {
          const parser = union([
            object({ status: literal('ok'), data: array(number()) }),
            object({ status: literal('error'), code: number(), message: string() }),
          ])
          expect(await parseWithMode(parser, b`{"status":"ok","data":[1,2,3]}`, options)).toEqual({
            status: 'ok',
            data: [1, 2, 3],
          })
          expect(
            await parseWithMode(
              parser,
              b`{"status":"error","code":404,"message":"Not found"}`,
              options
            )
          ).toEqual({
            status: 'error',
            code: 404,
            message: 'Not found',
          })
        })
      })
    })

    describe('Array Unions', () => {
      it('should parse arrays of unions', async () => {
        const parser = array(union([string(), number()]))
        expect(await parseWithMode(parser, b`["a",1,"b",2]`, options)).toEqual(['a', 1, 'b', 2])
      })

      it('should handle empty and single-element arrays', async () => {
        const parser = union([array(string()), number()])
        expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`["single"]`, options)).toEqual(['single'])
      })

      it('should handle union of different array types', async () => {
        const parser = union([array(string()), array(number())])
        expect(await parseWithMode(parser, b`["a","b"]`, options)).toEqual(['a', 'b'])
        expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
      })

      it('should handle nested arrays of unions', async () => {
        const parser = array(array(union([string(), number()])))
        expect(await parseWithMode(parser, b`[["a",1],["b",2]]`, options)).toEqual([
          ['a', 1],
          ['b', 2],
        ])
      })

      it('should fail for wrong element types', async () => {
        const parser = union([array(string()), array(number())])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[true]`, options), {
          code: 'UNION_NO_MATCH',
        })
      })
    })

    describe('Composition', () => {
      it('should parse nested unions', async () => {
        const inner = union([string(), number()])
        const outer = union([inner, boolean()])
        expect(await parseWithMode(outer, b`"text"`, options)).toBe('text')
        expect(await parseWithMode(outer, b`42`, options)).toBe(42)
        expect(await parseWithMode(outer, b`true`, options)).toBe(true)
      })

      it('should parse triple-nested unions', async () => {
        const level1 = union([string(), number()])
        const level2 = union([level1, boolean()])
        const level3 = union([level2, array(string())])
        expect(await parseWithMode(level3, b`"text"`, options)).toBe('text')
        expect(await parseWithMode(level3, b`42`, options)).toBe(42)
        expect(await parseWithMode(level3, b`true`, options)).toBe(true)
        expect(await parseWithMode(level3, b`["a","b"]`, options)).toEqual(['a', 'b'])
      })

      it('should parse objects with union fields', async () => {
        const parser = object({
          id: union([string(), number()]),
          name: string(),
        })
        expect(await parseWithMode(parser, b`{"id":123,"name":"test"}`, options)).toEqual({
          id: 123,
          name: 'test',
        })
        expect(await parseWithMode(parser, b`{"id":"abc","name":"test"}`, options)).toEqual({
          id: 'abc',
          name: 'test',
        })
      })

      it('should parse nullable unions', async () => {
        const parser = nullable(union([string(), number()]))
        expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        expect(await parseWithMode(parser, b`null`, options)).toBe(null)
      })

      it('should parse union containing nullable', async () => {
        const parser = union([nullable(string()), number()])
        expect(await parseWithMode(parser, b`"text"`, options)).toBe('text')
        expect(await parseWithMode(parser, b`null`, options)).toBe(null)
        expect(await parseWithMode(parser, b`42`, options)).toBe(42)
      })

      it('should parse deeply nested discriminated unions', async () => {
        const level3 = union([
          object({ action: literal('create'), name: string() }),
          object({ action: literal('delete'), id: number() }),
        ])
        const level2 = union([
          object({ category: literal('item'), payload: level3 }),
          object({ category: literal('user'), username: string() }),
        ])
        const level1 = union([
          object({ version: literal('v1'), data: level2 }),
          object({ version: literal('v2'), content: string() }),
        ])

        expect(
          await parseWithMode(
            level1,
            b`{"version":"v1","data":{"category":"item","payload":{"action":"create","name":"widget"}}}`,
            options
          )
        ).toEqual({
          version: 'v1',
          data: { category: 'item', payload: { action: 'create', name: 'widget' } },
        })
      })
    })

    describe('Literals & Nullable', () => {
      describe('Literal Unions', () => {
        it('should parse union of string literals', async () => {
          const parser = union([literal('a'), literal('b'), literal('c')])
          expect(await parseWithMode(parser, b`"a"`, options)).toBe('a')
          expect(await parseWithMode(parser, b`"b"`, options)).toBe('b')
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"d"`, options), {
            code: 'UNION_NO_MATCH',
          })
        })

        it('should parse union of number literals', async () => {
          const parser = union([literal(1), literal(2), literal(3)])
          expect(await parseWithMode(parser, b`1`, options)).toBe(1)
          expect(await parseWithMode(parser, b`2`, options)).toBe(2)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`4`, options), {
            code: 'UNION_NO_MATCH',
          })
        })

        it('should parse union of mixed literals', async () => {
          const parser = union([literal('foo'), literal(42), literal(true)])
          expect(await parseWithMode(parser, b`"foo"`, options)).toBe('foo')
          expect(await parseWithMode(parser, b`42`, options)).toBe(42)
          expect(await parseWithMode(parser, b`true`, options)).toBe(true)
        })

        it('should parse boolean literals same as boolean()', async () => {
          const literalParser = union([literal(true), literal(false)])
          const boolParser = boolean()
          expect(await parseWithMode(literalParser, b`true`, options)).toBe(
            boolParser.parse(b`true`).toValue()
          )
          expect(await parseWithMode(literalParser, b`false`, options)).toBe(
            boolParser.parse(b`false`).toValue()
          )
        })

        it('should handle null literal', async () => {
          const parser = union([literal(null), string()])
          expect(await parseWithMode(parser, b`null`, options)).toBe(null)
          expect(await parseWithMode(parser, b`"text"`, options)).toBe('text')
        })
      })

      describe('Nullable Edge Cases', () => {
        it('should match null to first nullable variant', async () => {
          const parser = union([nullable(string()), number()])
          expect(await parseWithMode(parser, b`null`, options)).toBe(null)
          expect(await parseWithMode(parser, b`"text"`, options)).toBe('text')
          expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        })

        it('should match null to second variant when first is not nullable', async () => {
          const parser = union([number(), nullable(string())])
          expect(await parseWithMode(parser, b`null`, options)).toBe(null)
        })

        it('should handle nested nullable', async () => {
          const parser = union([nullable(nullable(string())), number()])
          expect(await parseWithMode(parser, b`null`, options)).toBe(null)
          expect(await parseWithMode(parser, b`"text"`, options)).toBe('text')
        })

        it('should handle object with nullable fields in union', async () => {
          const parser = union([
            object({ name: string(), email: nullable(string()) }),
            object({ name: string(), phone: number() }),
          ])
          expect(await parseWithMode(parser, b`{"name":"John","email":null}`, options)).toEqual({
            name: 'John',
            email: null,
          })
          expect(await parseWithMode(parser, b`{"name":"Jane","phone":12345}`, options)).toEqual({
            name: 'Jane',
            phone: 12345,
          })
        })
      })
    })

    describe('Variant Resolution', () => {
      it('should match first variant when multiple could match', async () => {
        const parser = union([
          object({ type: string() }),
          object({ type: string(), extra: number() }),
        ])
        expect(await parseWithMode(parser, b`{"type":"simple"}`, options)).toEqual({
          type: 'simple',
        })
      })

      it('should match number before literal when number is first', async () => {
        const parser = union([number(), literal(42)])
        expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        expect(await parseWithMode(parser, b`100`, options)).toBe(100)
      })

      it('should match literal specifically when literal is first', async () => {
        const parser = union([literal(42), number()])
        expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        expect(await parseWithMode(parser, b`100`, options)).toBe(100)
      })

      it('should handle broader vs narrower object ordering', async () => {
        const broader = object({ a: string() })
        const narrower = object({ a: string(), b: number() })

        // Broader first - always matches
        const p1 = union([broader, narrower])
        expect(await parseWithMode(p1, b`{"a":"test"}`, options)).toEqual({ a: 'test' })
        expect(await parseWithMode(p1, b`{"a":"test","b":123}`, options)).toEqual({
          a: 'test',
          b: 123,
        })

        // Narrower first - can match specifically
        const p2 = union([narrower, broader])
        expect(await parseWithMode(p2, b`{"a":"test"}`, options)).toEqual({ a: 'test' })
        expect(await parseWithMode(p2, b`{"a":"test","b":123}`, options)).toEqual({
          a: 'test',
          b: 123,
        })
      })
    })

    describe('Error Handling', () => {
      it('should throw when no variant matches', async () => {
        const parser = union([string(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`true`, options), {
          code: 'UNION_NO_MATCH',
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[]`, options), {
          code: 'UNION_NO_MATCH',
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{}`, options), {
          code: 'UNION_NO_MATCH',
          position: { line: 1, column: 1 },
        })
      })

      it('should throw for missing required fields', async () => {
        const parser = union([
          object({ name: string(), email: string() }),
          object({ name: string(), age: number() }),
        ])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"name":"test"}`, options), {
          code: 'UNION_NO_MATCH',
          position: { line: 1, column: 1 },
        })
      })

      it('should throw for wrong types', async () => {
        const parser = union([
          object({ name: string(), email: string() }),
          object({ name: string(), age: number() }),
        ])
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"name":"test","age":"not a number"}`, options),
          {
            code: 'UNION_NO_MATCH',
          }
        )
      })

      it('should include position for nested union errors', async () => {
        const parser = object({ value: union([string(), number()]) })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"value": true}`, options), {
          code: 'UNION_NO_MATCH',
          position: { line: 1, column: 11 },
          messageMatch: /union/i,
        })
      })

      it('should provide correct position for multiline union errors', async () => {
        const parser = union([string(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\n\n  true`, options), {
          code: 'UNION_NO_MATCH',
          position: { line: 3, column: 3 },
        })
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should handle all valid JSON whitespace', async () => {
        const parser = union([string(), number()])
        expect(await parseWithMode(parser, b` "hello" `, options)).toBe('hello')
        expect(await parseWithMode(parser, b`\t42\t`, options)).toBe(42)
        expect(await parseWithMode(parser, b`\n"test"\n`, options)).toBe('test')
        expect(await parseWithMode(parser, b`\r100\r`, options)).toBe(100)
        expect(await parseWithMode(parser, b` \t\n\r"value"\r\n\t `, options)).toBe('value')
      })

      it('should handle whitespace in complex structures', async () => {
        const parser = array(union([string(), number()]))
        expect(await parseWithMode(parser, b`[ "a" , 1 , "b" , 2 ]`, options)).toEqual([
          'a',
          1,
          'b',
          2,
        ])
        expect(await parseWithMode(parser, b`[\n"a",\n1\n]`, options)).toEqual(['a', 1])
      })

      it('should reject trailing commas', async () => {
        const arrayParser = array(union([string(), number()]))
        await expectAtcharaErrorAsync(() => parseWithMode(arrayParser, b`["a", 1,]`, options), {})

        const objParser = union([object({ a: string(), b: number() }), string()])
        await expectAtcharaErrorAsync(
          () => parseWithMode(objParser, b`{"a":"test","b":1,}`, options),
          {}
        )
      })

      it('should reject invalid number formats', async () => {
        const parser = union([string(), number()])
        // Leading zeros
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`01`, options), {})
        // Leading decimal
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`.5`, options), {})
        // Trailing decimal
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1.`, options), {})
        // Plus sign
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`+1`, options), {})
        // Hex
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0xFF`, options), {})
        // Octal
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0o77`, options), {})
        // Binary
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0b101`, options), {})
      })

      it('should reject non-JSON values', async () => {
        const parser = union([string(), number(), boolean()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`undefined`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`NaN`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`Infinity`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`TRUE`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`NULL`, options), {})
      })

      it('should reject malformed JSON', async () => {
        const parser = union([string(), number(), object({ a: string() })])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"incomplete`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{invalid}`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{'key': 'value'}`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{key: "value"}`, options), {})
      })

      it('should reject comments', async () => {
        const parser = union([string(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`42 // comment`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`/* comment */ 42`, options), {})
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer union of primitives', () => {
      const _parser = union([string(), number()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<string | number>()
    })

    it('should infer union of objects', () => {
      const _parser = union([
        object({ name: string(), email: string() }),
        object({ name: string(), age: number() }),
      ])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<
        { name: string; email: string } | { name: string; age: number }
      >()
    })

    it('should infer union with 3+ types', () => {
      const _parser = union([string(), number(), boolean(), array(string())])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<string | number | boolean | string[]>()
    })

    it('should infer nullable union', () => {
      const _parser = nullable(union([string(), number()]))
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<string | number | null>()
    })

    it('should infer union with literals', () => {
      const _parser = union([literal('a'), literal('b'), literal(42)])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<'a' | 'b' | 42>()
    })

    it('should infer discriminated union types', () => {
      const _parser = union([
        object({ type: literal('success'), data: string() }),
        object({ type: literal('error'), message: string() }),
      ])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<
        { type: 'success'; data: string } | { type: 'error'; message: string }
      >()
    })

    it('should infer nested union types', () => {
      const inner = union([string(), number()])
      const _parser = union([inner, boolean()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<string | number | boolean>()
    })

    it('should infer complex nested structures', () => {
      const _parser = object({
        id: union([string(), number()]),
        items: array(union([string(), object({ name: string() })])),
      })
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<{
        id: string | number
        items: (string | { name: string })[]
      }>()
    })

    it('should reject optional() as union variant at type level', () => {
      // Verify that optional() in unions produces a type error via RejectOptional
      const _optionalParser = optional(string())

      // RejectOptional maps Parser<OptionalSchema<...>> to never
      type RejectOptional<T> = T extends Parser<OptionalSchema<Parser<Schema>>> ? never : T
      type RejectedType = RejectOptional<typeof _optionalParser>

      // The optional parser should be rejected (mapped to never)
      expectTypeOf<RejectedType>().toEqualTypeOf<never>()

      // Regular parsers should not be rejected
      type AcceptedType = RejectOptional<ReturnType<typeof string>>
      expectTypeOf<AcceptedType>().toEqualTypeOf<ReturnType<typeof string>>()
    })
  })

  // Sync-only error handling tests that use expectAtcharaError return value
  describe('Error Details (sync)', () => {
    it('should provide structured error with union code', () => {
      const parser = union([string(), number()])
      const error = expectAtcharaError(() => parser.parse(b`true`), {
        code: 'UNION_NO_MATCH',
        position: { line: 1, column: 1 },
      })
      // Return type is narrowed to UnionNoMatch, so details.variantErrors is directly accessible
      expect(error.details.variantErrors.length).toBe(2) // string and number variants both failed
    })

    it('should include variant errors as nested issues', () => {
      const parser = union([string(), number()])
      const error = expectAtcharaError(() => parser.parse(b`true`), {
        code: 'UNION_NO_MATCH',
      })
      // Return type is narrowed to UnionNoMatch, so variantErrors is directly accessible
      for (const variantError of error.details.variantErrors) {
        expect(variantError.code).toBeDefined()
        expect(variantError.message).toBeDefined()
        // Narrow to VALIDATION_ERROR to access position and details
        if (variantError.code === 'VALIDATION_ERROR') {
          expect(variantError.position).toBeDefined()
          expect(variantError.details.expected).toBeDefined()
          expect(variantError.details.found).toBeDefined()
        }
      }
    })
  })

  // optional() restriction - sync only
  describe('optional() restriction', () => {
    it('should throw error when optional schema is used as variant', () => {
      expect(() => {
        // @ts-expect-error - optional() not allowed in unions
        union([optional(string()), number()])
      }).toThrow(/optional\(\) cannot be used as a union variant/)
    })

    it('should provide helpful error message mentioning nullable', () => {
      try {
        // @ts-expect-error - optional() not allowed in unions
        union([optional(string()), number()])
        expect.fail('should have thrown')
      } catch (e) {
        expect((e as Error).message).toContain('nullable()')
      }
    })

    it('should allow nullable() as union variant (valid alternative)', () => {
      const parser = union([nullable(string()), number()])
      expect(parser.parse(b`null`).toValue()).toBe(null)
      expect(parser.parse(b`"hello"`).toValue()).toBe('hello')
      expect(parser.parse(b`42`).toValue()).toBe(42)
    })
  })
})
