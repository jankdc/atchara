import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { toBytes as b } from '@atcharajs/core'
import {
  initialize,
  record,
  string,
  number,
  boolean,
  object,
  array,
  nullable,
  tuple,
  literal,
  InferValue,
} from '../src'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('record schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Record Parsing', () => {
      it('parses empty record', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{}`, options)).toEqual({})
      })

      it('parses empty record with whitespace', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{ }`, options)).toEqual({})
        expect(await parseWithMode(schema, b`{\n}`, options)).toEqual({})
        expect(await parseWithMode(schema, b`{\t}`, options)).toEqual({})
      })

      it('parses string record', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"en": "Hello", "es": "Hola"}`, options)).toEqual({
          en: 'Hello',
          es: 'Hola',
        })
      })

      it('parses number record', async () => {
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"a": 1, "b": 2.5}`, options)).toEqual({
          a: 1,
          b: 2.5,
        })
      })

      it('parses boolean record', async () => {
        const schema = record(boolean())
        expect(
          await parseWithMode(schema, b`{"enabled": true, "disabled": false}`, options)
        ).toEqual({ enabled: true, disabled: false })
      })

      it('parses single entry record', async () => {
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"only": 42}`, options)).toEqual({ only: 42 })
      })
    })

    describe('Nested Structures', () => {
      it('parses nested object record', async () => {
        const schema = record(object({ enabled: boolean() }))
        expect(await parseWithMode(schema, b`{"feature_a": {"enabled": true}}`, options)).toEqual({
          feature_a: { enabled: true },
        })
      })

      it('parses record with nullable values', async () => {
        const schema = record(nullable(string()))
        expect(await parseWithMode(schema, b`{"a": "hello", "b": null}`, options)).toEqual({
          a: 'hello',
          b: null,
        })
      })

      it('parses record of arrays', async () => {
        const schema = record(array(number()))
        expect(
          await parseWithMode(schema, b`{"scores": [1, 2, 3], "values": [4, 5]}`, options)
        ).toEqual({ scores: [1, 2, 3], values: [4, 5] })
      })

      it('parses nested records', async () => {
        const schema = record(record(number()))
        expect(await parseWithMode(schema, b`{"outer": {"inner": 42}}`, options)).toEqual({
          outer: { inner: 42 },
        })
      })

      it('parses deeply nested records', async () => {
        const schema = record(record(record(string())))
        expect(await parseWithMode(schema, b`{"a": {"b": {"c": "deep"}}}`, options)).toEqual({
          a: { b: { c: 'deep' } },
        })
      })

      it('parses record of tuples', async () => {
        const schema = record(tuple([number(), string()]))
        expect(
          await parseWithMode(schema, b`{"coord": [1, "x"], "other": [2, "y"]}`, options)
        ).toEqual({ coord: [1, 'x'], other: [2, 'y'] })
      })

      it('parses record with literal values', async () => {
        const schema = record(literal('active'))
        expect(
          await parseWithMode(schema, b`{"status1": "active", "status2": "active"}`, options)
        ).toEqual({ status1: 'active', status2: 'active' })
      })

      it('parses complex nested structure', async () => {
        const schema = record(
          object({
            name: string(),
            scores: array(number()),
            metadata: nullable(object({ version: number() })),
          })
        )
        const input = JSON.stringify({
          user1: { name: 'Alice', scores: [95, 87], metadata: { version: 1 } },
          user2: { name: 'Bob', scores: [78], metadata: null },
        })
        expect(await parseWithMode(schema, b`${input}`, options)).toEqual({
          user1: { name: 'Alice', scores: [95, 87], metadata: { version: 1 } },
          user2: { name: 'Bob', scores: [78], metadata: null },
        })
      })
    })

    describe('Duplicate Keys', () => {
      it('handles duplicate keys (last wins)', async () => {
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"x": 1, "x": 2}`, options)).toEqual({ x: 2 })
      })

      it('handles multiple duplicate keys (last wins)', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"a": "1", "a": "2", "a": "3"}`, options)).toEqual({
          a: '3',
        })
      })
    })

    describe('Error Handling', () => {
      it('rejects non-object input (array)', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`[]`, options), {
          position: { line: 1, column: 1 },
        })
      })

      it('rejects non-object input (string)', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`"string"`, options), {
          position: { line: 1, column: 1 },
        })
      })

      it('rejects non-object input (number)', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`123`, options), {
          position: { line: 1, column: 1 },
        })
      })

      it('rejects non-object input (boolean)', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`true`, options), {
          position: { line: 1, column: 1 },
        })
      })

      it('rejects non-object input (null)', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`null`, options), {
          position: { line: 1, column: 1 },
        })
      })

      it('rejects wrong value types', async () => {
        const schema = record(number())
        await expectAtcharaErrorAsync(
          () => parseWithMode(schema, b`{"a": "not a number"}`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit', found: "'\"'" },
          }
        )
      })

      it('rejects nested wrong value types', async () => {
        const schema = record(object({ x: number() }))
        await expectAtcharaErrorAsync(
          () => parseWithMode(schema, b`{"a": {"x": "string"}}`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit', found: "'\"'" },
          }
        )
      })

      it('rejects trailing comma', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{"a": "b",}`, options), {})
      })

      it('rejects leading comma', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{,"a": "b"}`, options), {})
      })

      it('rejects missing colon', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{"a" "b"}`, options), {})
      })

      it('rejects missing value', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{"a":}`, options), {})
      })

      it('rejects unquoted keys', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{a: "b"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
        })
      })

      it('rejects single-quoted keys', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{'a': 'b'}`, options), {
          code: 'UNEXPECTED_CHARACTER',
        })
      })

      it('rejects unclosed object', async () => {
        const schema = record(string())
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{"a": "b"`, options), {
          code: 'UNEXPECTED_EOF',
        })
      })
    })

    describe('Unicode and Special Characters', () => {
      it('handles unicode keys', async () => {
        const schema = record(string())
        expect(
          await parseWithMode(schema, b`{"日本語": "Japanese", "🎉": "party"}`, options)
        ).toEqual({ 日本語: 'Japanese', '🎉': 'party' })
      })

      it('handles keys with special characters', async () => {
        const schema = record(number())
        expect(
          await parseWithMode(schema, b`{"key-with-dash": 1, "key.with.dots": 2}`, options)
        ).toEqual({ 'key-with-dash': 1, 'key.with.dots': 2 })
      })

      it('handles escaped quotes in keys', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"key\\"with\\"quotes": "value"}`, options)).toEqual({
          'key"with"quotes': 'value',
        })
      })

      it('handles escaped backslashes in keys', async () => {
        const schema = record(string())
        expect(
          await parseWithMode(schema, b`{"key\\\\with\\\\backslashes": "value"}`, options)
        ).toEqual({ 'key\\with\\backslashes': 'value' })
      })

      it('handles newlines in keys', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"key\\nwith\\nnewlines": "value"}`, options)).toEqual(
          { 'key\nwith\nnewlines': 'value' }
        )
      })

      it('handles tabs in keys', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"key\\twith\\ttabs": "value"}`, options)).toEqual({
          'key\twith\ttabs': 'value',
        })
      })

      it('handles empty key', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"": "empty key value"}`, options)).toEqual({
          '': 'empty key value',
        })
      })

      it('handles keys that look like numbers', async () => {
        const schema = record(string())
        expect(
          await parseWithMode(schema, b`{"123": "a", "-456": "b", "1.5e10": "c"}`, options)
        ).toEqual({ '123': 'a', '-456': 'b', '1.5e10': 'c' })
      })

      it('handles keys that look like booleans', async () => {
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"true": 1, "false": 2, "null": 3}`, options)).toEqual(
          { true: 1, false: 2, null: 3 }
        )
      })

      it('handles very long keys', async () => {
        const longKey = 'a'.repeat(1000)
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"${longKey}": 42}`, options)).toEqual({
          [longKey]: 42,
        })
      })

      it('handles unicode escape sequences in keys', async () => {
        const schema = record(string())
        expect(
          await parseWithMode(schema, b`{"\\u0048\\u0065\\u006C\\u006C\\u006F": "value"}`, options)
        ).toEqual({ Hello: 'value' })
      })

      it('handles surrogate pairs in keys', async () => {
        const schema = record(string())
        // \uD834\uDD1E = U+1D11E = 𝄞 (musical G clef)
        expect(await parseWithMode(schema, b`{"\\uD834\\uDD1E": "music"}`, options)).toEqual({
          '𝄞': 'music',
        })
      })

      it('handles direct UTF-8 astral plane characters in keys', async () => {
        const schema = record(string())
        // 𝄞 (musical G clef) as direct UTF-8
        expect(await parseWithMode(schema, b`{"𝄞": "music"}`, options)).toEqual({ '𝄞': 'music' })
      })
    })

    describe('Whitespace Handling', () => {
      it('handles various whitespace combinations', async () => {
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"a":1,"b":2}`, options)).toEqual({ a: 1, b: 2 })
        expect(await parseWithMode(schema, b`{ "a" : 1 , "b" : 2 }`, options)).toEqual({
          a: 1,
          b: 2,
        })
        expect(await parseWithMode(schema, b`{\n"a":\n1,\n"b":\n2\n}`, options)).toEqual({
          a: 1,
          b: 2,
        })
        expect(await parseWithMode(schema, b`{\t"a":\t1,\t"b":\t2\t}`, options)).toEqual({
          a: 1,
          b: 2,
        })
        expect(await parseWithMode(schema, b`{\r\n"a":\r\n1,\r\n"b":\r\n2\r\n}`, options)).toEqual({
          a: 1,
          b: 2,
        })
      })

      it('handles mixed whitespace', async () => {
        const schema = record(string())
        expect(
          await parseWithMode(schema, b`{ \n\t "key" \t\n : \n\t "value" \t\n }`, options)
        ).toEqual({ key: 'value' })
      })
    })

    describe('Constraints', () => {
      describe('min(n)', () => {
        it('should accept record with entry count equal to min', async () => {
          const parser = record(number()).min(2)
          expect(await parseWithMode(parser, b`{"a":1,"b":2}`, options)).toEqual({ a: 1, b: 2 })
        })

        it('should accept record with entry count above min', async () => {
          const parser = record(number()).min(1)
          expect(await parseWithMode(parser, b`{"a":1,"b":2}`, options)).toEqual({ a: 1, b: 2 })
        })

        it('should reject record with fewer entries than min', async () => {
          const parser = record(number()).min(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1,"b":2}`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'record with at least 3 entries', found: '2 entries' },
          })
        })

        it('should reject empty record when min > 0', async () => {
          const parser = record(number()).min(1)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{}`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'record with at least 1 entries', found: '0 entries' },
          })
        })

        it('should accept empty record when min is 0', async () => {
          const parser = record(number()).min(0)
          expect(await parseWithMode(parser, b`{}`, options)).toEqual({})
        })
      })

      describe('max(n)', () => {
        it('should accept record with entry count equal to max', async () => {
          const parser = record(number()).max(3)
          expect(await parseWithMode(parser, b`{"a":1,"b":2,"c":3}`, options)).toEqual({
            a: 1,
            b: 2,
            c: 3,
          })
        })

        it('should accept record with fewer entries than max', async () => {
          const parser = record(number()).max(5)
          expect(await parseWithMode(parser, b`{"a":1,"b":2}`, options)).toEqual({ a: 1, b: 2 })
        })

        it('should reject record with more entries than max', async () => {
          const parser = record(number()).max(2)
          await expectAtcharaErrorAsync(
            () => parseWithMode(parser, b`{"a":1,"b":2,"c":3}`, options),
            {
              code: 'VALIDATION_ERROR',
              details: { expected: 'record with at most 2 entries', found: '3 entries' },
            }
          )
        })

        it('should accept empty record when max >= 0', async () => {
          const parser = record(number()).max(0)
          expect(await parseWithMode(parser, b`{}`, options)).toEqual({})
        })

        it('should reject non-empty record when max is 0', async () => {
          const parser = record(number()).max(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1}`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'record with at most 0 entries', found: '1 entries' },
          })
        })
      })

      describe('min + max combined', () => {
        it('should accept record within range', async () => {
          const parser = record(number()).min(2).max(4)
          expect(await parseWithMode(parser, b`{"a":1,"b":2,"c":3}`, options)).toEqual({
            a: 1,
            b: 2,
            c: 3,
          })
        })

        it('should reject below range', async () => {
          const parser = record(number()).min(3).max(5)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1,"b":2}`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should reject above range', async () => {
          const parser = record(number()).min(1).max(2)
          await expectAtcharaErrorAsync(
            () => parseWithMode(parser, b`{"a":1,"b":2,"c":3}`, options),
            {
              code: 'VALIDATION_ERROR',
            }
          )
        })
      })

      describe('early rejection on max', () => {
        it('should report found count in error', async () => {
          const parser = record(number()).max(2)
          const error = await expectAtcharaErrorAsync(
            () => parseWithMode(parser, b`{"a":1,"b":2,"c":3}`, options),
            { code: 'VALIDATION_ERROR' }
          )
          expect(error.details.found).toBe('3 entries')
        })
      })

      describe('with value constraints', () => {
        it('should combine record constraints with value constraints', async () => {
          const parser = record(number().min(0)).min(1).max(5)
          expect(await parseWithMode(parser, b`{"a":1,"b":2}`, options)).toEqual({ a: 1, b: 2 })
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":-1,"b":2}`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'number >= 0' },
          })
        })

        it('should report value constraint error before record count check', async () => {
          const parser = record(string().min(1)).min(3)
          await expectAtcharaErrorAsync(
            () => parseWithMode(parser, b`{"a":"x","b":"","c":"z"}`, options),
            {
              code: 'VALIDATION_ERROR',
              details: { expected: 'string with at least 1 characters' },
            }
          )
        })
      })

      describe('immutability', () => {
        it('should not affect original parser when chaining', async () => {
          const original = record(number())
          const constrained = original.min(2)
          expect(await parseWithMode(original, b`{"a":1}`, options)).toEqual({ a: 1 })
          await expectAtcharaErrorAsync(() => parseWithMode(constrained, b`{"a":1}`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('enforces double-quoted keys', async () => {
        const schema = record(string())
        expect(await parseWithMode(schema, b`{"key": "value"}`, options)).toEqual({
          key: 'value',
        })
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{'key': 'value'}`, options), {
          code: 'UNEXPECTED_CHARACTER',
        })
        await expectAtcharaErrorAsync(() => parseWithMode(schema, b`{key: "value"}`, options), {
          code: 'UNEXPECTED_CHARACTER',
        })
      })

      it('rejects trailing commas', async () => {
        const schema = record(number())
        expect(await parseWithMode(schema, b`{"a": 1, "b": 2}`, options)).toEqual({ a: 1, b: 2 })
        await expectAtcharaErrorAsync(
          () => parseWithMode(schema, b`{"a": 1, "b": 2,}`, options),
          {}
        )
      })

      it('rejects comments', async () => {
        const schema = record(number())
        await expectAtcharaErrorAsync(
          () => parseWithMode(schema, b`{"a": 1 /* comment */}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(schema, b`{"a": 1 // comment\n}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
          }
        )
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('infers Record<string, string> for string values', () => {
      const _parser = record(string())
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, string>>()
    })

    it('infers Record<string, number> for number values', () => {
      const _parser = record(number())
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, number>>()
    })

    it('infers Record<string, boolean> for boolean values', () => {
      const _parser = record(boolean())
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, boolean>>()
    })

    it('infers Record<string, T | null> for nullable values', () => {
      const _parser = record(nullable(string()))
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, string | null>>()
    })

    it('infers Record<string, T[]> for array values', () => {
      const _parser = record(array(number()))
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, number[]>>()
    })

    it('infers Record<string, object> for object values', () => {
      const _parser = record(object({ name: string(), age: number() }))
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, { name: string; age: number }>>()
    })

    it('infers nested Record types', () => {
      const _parser = record(record(number()))
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, Record<string, number>>>()
    })

    it('infers tuple values correctly', () => {
      const _parser = record(tuple([string(), number(), boolean()]))
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, [string, number, boolean]>>()
    })

    it('infers literal values correctly', () => {
      const _parser = record(literal('active'))
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, 'active'>>()
    })

    it('should preserve type through constraints', () => {
      const _parser = record(number()).min(1).max(10)
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<Record<string, number>>()
    })

    it('infers complex nested types', () => {
      const _parser = record(
        object({
          items: array(object({ id: number(), name: string() })),
          meta: nullable(object({ count: number() })),
        })
      )
      type Result = InferValue<typeof _parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<
        Record<
          string,
          {
            items: { id: number; name: string }[]
            meta: { count: number } | null
          }
        >
      >()
    })
  })

  // Deferred Access - sync only
  describe('Deferred Access', () => {
    it('should return record size via size getter', () => {
      const schema = record(number())

      expect(schema.parse(b`{}`).size).toBe(0)
      expect(schema.parse(b`{"a":1}`).size).toBe(1)
      expect(schema.parse(b`{"a":1,"b":2,"c":3}`).size).toBe(3)
    })

    it('should return all keys via keys()', () => {
      const schema = record(boolean())
      const result = schema.parse(b`{"enabled":true,"visible":false,"active":true}`)

      const keys = result.keys()
      expect(keys).toContain('enabled')
      expect(keys).toContain('visible')
      expect(keys).toContain('active')
      expect(keys.length).toBe(3)
    })

    it('should return undefined for non-existent keys', () => {
      const schema = record(string())
      const result = schema.parse(b`{"exists":"value"}`)

      expect(result.get('missing')).toBeUndefined()
      expect(result.get('')).toBeUndefined()
    })

    it('should access values via get() without materializing the full record', () => {
      const schema = record(number())
      const result = schema.parse(b`{"a":1,"b":2,"c":3}`)

      expect(result.get('a')?.toValue()).toBe(1)
      expect(result.get('b')?.toValue()).toBe(2)
      expect(result.get('c')?.toValue()).toBe(3)
    })

    it('should iterate over entries with Symbol.iterator', () => {
      const schema = record(number())
      const result = schema.parse(b`{"x":10,"y":20}`)
      const entries: Array<[string, number]> = []

      for (const [key, deferred] of result) {
        entries.push([key, deferred.toValue()])
      }

      expect(entries).toContainEqual(['x', 10])
      expect(entries).toContainEqual(['y', 20])
      expect(entries.length).toBe(2)
    })

    it('should access nested objects via get()', () => {
      const schema = record(object({ value: number() }))
      const result = schema.parse(b`{"item1":{"value":100},"item2":{"value":200}}`)

      const item1 = result.get('item1')
      expect(item1?.get('value').toValue()).toBe(100)

      const item2 = result.get('item2')
      expect(item2?.get('value').toValue()).toBe(200)
    })

    it('should access arrays within records via get()', () => {
      const schema = record(array(number()))
      const result = schema.parse(b`{"nums":[1,2,3],"more":[4,5]}`)

      const nums = result.get('nums')
      expect(nums?.length).toBe(3)
      expect(nums?.at(0)?.toValue()).toBe(1)

      const more = result.get('more')
      expect(more?.length).toBe(2)
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('handles many entries', () => {
      const schema = record(number())
      const entries = Array.from({ length: 100 }, (_, i) => `"key${i}": ${i}`)
      const json = `{${entries.join(', ')}}`
      const result = schema.parse(b`${json}`)
      expect(result.keys().length).toBe(100)
      expect(result.get('key50')?.toValue()).toBe(50)
    })

    it('handles large values efficiently', () => {
      const schema = record(string())
      const largeValue = 'x'.repeat(10000)
      const input = JSON.stringify({ key: largeValue })

      const start = performance.now()
      const result = schema.parse(b`${input}`)
      const duration = performance.now() - start

      expect(result.toValue()).toEqual({ key: largeValue })
      expect(duration).toBeLessThan(100)
    })

    it('handles many entries efficiently', () => {
      const schema = record(number())
      const data: Record<string, number> = {}
      for (let i = 0; i < 1000; i++) {
        data[`key${i}`] = i
      }
      const input = JSON.stringify(data)

      const start = performance.now()
      const result = schema.parse(b`${input}`)
      const duration = performance.now() - start

      expect(result.keys().length).toBe(1000)
      expect(result.get('key500')?.toValue()).toBe(500)
      expect(duration).toBeLessThan(200)
    })
  })
})
