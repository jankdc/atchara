import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { toBytes as b } from '@atchara/core'
import {
  InferValue,
  initialize,
  nullable,
  string,
  number,
  boolean,
  object,
  array,
  literal,
} from '../src/index'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Nullable Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Nullable Parsing', () => {
      it('should parse null or the wrapped type', async () => {
        const nullableString = nullable(string())

        expect(await parseWithMode(nullableString, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableString, b`"hello"`, options)).toBe('hello')
        await expectAtcharaErrorAsync(
          () => parseWithMode(nullableString, b`undefined`, options),
          {}
        )
      })

      it('should work with all primitive types', async () => {
        const nullableNumber = nullable(number())
        expect(await parseWithMode(nullableNumber, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableNumber, b`42`, options)).toBe(42)

        const nullableBoolean = nullable(boolean())
        expect(await parseWithMode(nullableBoolean, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableBoolean, b`true`, options)).toBe(true)
        expect(await parseWithMode(nullableBoolean, b`false`, options)).toBe(false)
      })
    })

    describe('Complex Type Wrapping', () => {
      it('should work with complex types', async () => {
        const nullableObject = nullable(
          object({
            name: string(),
          })
        )

        expect(await parseWithMode(nullableObject, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableObject, b`{"name":"John"}`, options)).toEqual({
          name: 'John',
        })
      })

      it('should work with arrays', async () => {
        const nullableArray = nullable(array(number()))

        expect(await parseWithMode(nullableArray, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableArray, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(nullableArray, b`[]`, options)).toEqual([])
      })

      it('should work with nested objects', async () => {
        const nullableNestedObject = nullable(
          object({
            user: object({
              id: number(),
              name: string(),
            }),
            metadata: object({
              created: string(),
            }),
          })
        )

        expect(await parseWithMode(nullableNestedObject, b`null`, options)).toBe(null)
        expect(
          await parseWithMode(
            nullableNestedObject,
            b`{"user":{"id":1,"name":"John"},"metadata":{"created":"2023-01-01"}}`,
            options
          )
        ).toEqual({
          user: { id: 1, name: 'John' },
          metadata: { created: '2023-01-01' },
        })
      })
    })

    describe('Nested Nullable Types', () => {
      it('should handle nullable within objects', async () => {
        const parser = object({
          name: string(),
          email: nullable(string()),
          age: nullable(number()),
        })

        expect(
          await parseWithMode(parser, b`{"name":"John","email":null,"age":null}`, options)
        ).toEqual({
          name: 'John',
          email: null,
          age: null,
        })

        expect(
          await parseWithMode(parser, b`{"name":"John","email":"john@test.com","age":30}`, options)
        ).toEqual({
          name: 'John',
          email: 'john@test.com',
          age: 30,
        })
      })

      it('should handle nullable within arrays', async () => {
        const parser = array(nullable(string()))

        expect(await parseWithMode(parser, b`["hello",null,"world"]`, options)).toEqual([
          'hello',
          null,
          'world',
        ])
        expect(await parseWithMode(parser, b`[null,null,null]`, options)).toEqual([
          null,
          null,
          null,
        ])
        expect(await parseWithMode(parser, b`["only","strings"]`, options)).toEqual([
          'only',
          'strings',
        ])
      })

      it('should handle arrays of nullable objects', async () => {
        const parser = array(
          nullable(
            object({
              id: number(),
              name: string(),
            })
          )
        )

        expect(
          await parseWithMode(
            parser,
            b`[{"id":1,"name":"John"},null,{"id":2,"name":"Jane"}]`,
            options
          )
        ).toEqual([{ id: 1, name: 'John' }, null, { id: 2, name: 'Jane' }])
      })
    })

    describe('Error Handling', () => {
      it('should validate non-null values against wrapped schema', async () => {
        const nullableNumber = nullable(number())

        // Valid cases
        expect(await parseWithMode(nullableNumber, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableNumber, b`42`, options)).toBe(42)

        // Invalid cases - should validate against number schema
        await expectAtcharaErrorAsync(
          () => parseWithMode(nullableNumber, b`"not a number"`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit', found: "'\"'" },
          }
        )
        await expectAtcharaErrorAsync(() => parseWithMode(nullableNumber, b`true`, options), {
          code: 'VALIDATION_ERROR',
          details: { expected: 'digit', found: "'t'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(nullableNumber, b`[]`, options), {
          code: 'VALIDATION_ERROR',
          details: { expected: 'digit', found: "'['" },
        })
      })

      it('should reject undefined and other falsy values', async () => {
        const nullableString = nullable(string())

        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`undefined`, options), {
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`false`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`0`, options), {})
        // Empty string is valid
        expect(await parseWithMode(nullableString, b`""`, options)).toBe('')
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should only accept JSON null', async () => {
        const nullableString = nullable(string())

        // Valid JSON null
        expect(await parseWithMode(nullableString, b`null`, options)).toBe(null)

        // Invalid null representations
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`NULL`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`Null`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`nil`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`None`, options), {})
        await expectAtcharaErrorAsync(
          () => parseWithMode(nullableString, b`undefined`, options),
          {}
        )
      })

      it('should not accept quoted null', async () => {
        const nullableString = nullable(string())

        // Quoted null should be treated as string, not null
        expect(await parseWithMode(nullableString, b`"null"`, options)).toBe('null') // This is a string!
        await expectAtcharaErrorAsync(() => parseWithMode(nullableString, b`'null'`, options), {})
      })

      it('should handle whitespace around null', async () => {
        const nullableString = nullable(string())

        expect(await parseWithMode(nullableString, b`  null  `, options)).toBe(null)
        expect(await parseWithMode(nullableString, b`\nnull\n`, options)).toBe(null)
        expect(await parseWithMode(nullableString, b`\tnull\t`, options)).toBe(null)
        expect(await parseWithMode(nullableString, b`\r\nnull\r\n`, options)).toBe(null)
      })
    })

    describe('Wrapper Composition', () => {
      it('should handle nullable(array(nullable(T)))', async () => {
        const parser = nullable(array(nullable(string())))
        expect(await parseWithMode(parser, b`null`, options)).toBe(null)
        expect(await parseWithMode(parser, b`["a",null,"b"]`, options)).toEqual(['a', null, 'b'])
        expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
      })

      it('should handle nullable object with nullable fields', async () => {
        const parser = nullable(
          object({
            name: string(),
            nickname: nullable(string()),
          })
        )
        expect(await parseWithMode(parser, b`null`, options)).toBe(null)
        expect(await parseWithMode(parser, b`{"name":"John","nickname":null}`, options)).toEqual({
          name: 'John',
          nickname: null,
        })
      })

      it('should handle triple-nested nullable', async () => {
        const parser = nullable(nullable(nullable(string())))
        expect(await parseWithMode(parser, b`null`, options)).toBe(null)
        expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
      })

      it('should handle double nullable wrapping', async () => {
        const doubleNullable = nullable(nullable(string()))

        expect(await parseWithMode(doubleNullable, b`null`, options)).toBe(null)
        expect(await parseWithMode(doubleNullable, b`"hello"`, options)).toBe('hello')
      })
    })

    describe('Edge Cases', () => {
      it('should handle nullable literals', async () => {
        const nullableHello = nullable(literal('hello'))

        expect(await parseWithMode(nullableHello, b`null`, options)).toBe(null)
        expect(await parseWithMode(nullableHello, b`"hello"`, options)).toBe('hello')
        await expectAtcharaErrorAsync(() => parseWithMode(nullableHello, b`"world"`, options), {
          code: 'VALIDATION_ERROR',
        })
      })

      it('should handle deeply nested structures', async () => {
        const parser = nullable(
          object({
            level1: object({
              level2: object({
                level3: nullable(string()),
              }),
            }),
          })
        )

        expect(await parseWithMode(parser, b`null`, options)).toBe(null)
        expect(
          await parseWithMode(parser, b`{"level1":{"level2":{"level3":null}}}`, options)
        ).toEqual({
          level1: { level2: { level3: null } },
        })
        expect(
          await parseWithMode(parser, b`{"level1":{"level2":{"level3":"deep"}}}`, options)
        ).toEqual({
          level1: { level2: { level3: 'deep' } },
        })
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer nullable types', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const nullableString = nullable(string())
      type NullableString = InferValue<typeof nullableString.schema>
      expectTypeOf<NullableString>().toEqualTypeOf<string | null>()
    })

    it('should infer complex nullable types', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const nullableUser = nullable(
        object({
          id: number(),
          name: string(),
        })
      )
      type NullableUser = InferValue<typeof nullableUser.schema>
      expectTypeOf<NullableUser>().toEqualTypeOf<{
        id: number
        name: string
      } | null>()
    })

    it('should infer nested nullable types', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parser = object({
        name: string(),
        email: nullable(string()),
        profile: nullable(
          object({
            bio: string(),
            avatar: nullable(string()),
          })
        ),
      })

      type SchemaType = InferValue<typeof parser.schema>
      expectTypeOf<SchemaType>().toEqualTypeOf<{
        name: string
        email: string | null
        profile: {
          bio: string
          avatar: string | null
        } | null
      }>()
    })

    it('should infer double nullable wrapping', () => {
      const _doubleNullable = nullable(nullable(string()))
      type DoubleNullable = InferValue<typeof _doubleNullable.schema>
      expectTypeOf<DoubleNullable>().toEqualTypeOf<string | null>()
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should handle large nullable arrays efficiently', () => {
      const parser = array(nullable(number()))
      const largeArray = Array.from({ length: 1000 }, (_, i) => (i % 3 === 0 ? null : i))
      const input = JSON.stringify(largeArray)

      const start = performance.now()
      const result = parser.parse(b`${input}`)
      const duration = performance.now() - start

      expect(result.toValue()).toEqual(largeArray)
      expect(duration).toBeLessThan(200)
    })
  })
})
