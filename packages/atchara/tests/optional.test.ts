import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { toBytes as b } from '@atcharajs/core'
import {
  InferValue,
  initialize,
  optional,
  object,
  string,
  number,
  boolean,
  nullable,
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

describe('Optional Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Optional Field Parsing', () => {
      it('should handle missing optional fields', async () => {
        const parser = object({
          name: string(),
          age: optional(number()),
        })

        expect(await parseWithMode(parser, b`{"name":"John"}`, options)).toEqual({
          name: 'John',
          age: undefined,
        })

        expect(await parseWithMode(parser, b`{"name":"John","age":30}`, options)).toEqual({
          name: 'John',
          age: 30,
        })
      })

      it('should work with all primitive types', async () => {
        const parser = object({
          requiredField: string(),
          optionalString: optional(string()),
          optionalNumber: optional(number()),
          optionalBoolean: optional(boolean()),
        })

        // All optional fields missing
        expect(await parseWithMode(parser, b`{"requiredField":"test"}`, options)).toEqual({
          requiredField: 'test',
          optionalString: undefined,
          optionalNumber: undefined,
          optionalBoolean: undefined,
        })

        // All optional fields present
        expect(
          await parseWithMode(
            parser,
            b`{"requiredField":"test","optionalString":"hello","optionalNumber":42,"optionalBoolean":true}`,
            options
          )
        ).toEqual({
          requiredField: 'test',
          optionalString: 'hello',
          optionalNumber: 42,
          optionalBoolean: true,
        })

        // Partial optional fields
        expect(
          await parseWithMode(parser, b`{"requiredField":"test","optionalNumber":42}`, options)
        ).toEqual({
          requiredField: 'test',
          optionalString: undefined,
          optionalNumber: 42,
          optionalBoolean: undefined,
        })
      })
    })

    describe('Complex Optional Types', () => {
      it('should work with optional objects', async () => {
        const parser = object({
          name: string(),
          address: optional(
            object({
              street: string(),
              city: string(),
            })
          ),
        })

        expect(await parseWithMode(parser, b`{"name":"John"}`, options)).toEqual({
          name: 'John',
          address: undefined,
        })

        expect(
          await parseWithMode(
            parser,
            b`{"name":"John","address":{"street":"123 Main St","city":"New York"}}`,
            options
          )
        ).toEqual({
          name: 'John',
          address: {
            street: '123 Main St',
            city: 'New York',
          },
        })
      })

      it('should work with optional arrays', async () => {
        const parser = object({
          name: string(),
          tags: optional(array(string())),
        })

        expect(await parseWithMode(parser, b`{"name":"John"}`, options)).toEqual({
          name: 'John',
          tags: undefined,
        })

        expect(
          await parseWithMode(parser, b`{"name":"John","tags":["developer","typescript"]}`, options)
        ).toEqual({
          name: 'John',
          tags: ['developer', 'typescript'],
        })

        expect(await parseWithMode(parser, b`{"name":"John","tags":[]}`, options)).toEqual({
          name: 'John',
          tags: [],
        })
      })

      it('should work with nested optional fields', async () => {
        const parser = object({
          name: string(),
          profile: optional(
            object({
              bio: string(),
              avatar: optional(string()),
              social: optional(
                object({
                  twitter: optional(string()),
                  github: optional(string()),
                })
              ),
            })
          ),
        })

        // No optional fields
        expect(await parseWithMode(parser, b`{"name":"John"}`, options)).toEqual({
          name: 'John',
          profile: undefined,
        })

        // Top-level optional with nested optionals missing
        expect(
          await parseWithMode(parser, b`{"name":"John","profile":{"bio":"Developer"}}`, options)
        ).toEqual({
          name: 'John',
          profile: {
            bio: 'Developer',
            avatar: undefined,
            social: undefined,
          },
        })

        // All fields present
        expect(
          await parseWithMode(
            parser,
            b`{"name":"John","profile":{"bio":"Developer","avatar":"pic.jpg","social":{"twitter":"@john","github":"john"}}}`,
            options
          )
        ).toEqual({
          name: 'John',
          profile: {
            bio: 'Developer',
            avatar: 'pic.jpg',
            social: {
              twitter: '@john',
              github: 'john',
            },
          },
        })
      })
    })

    describe('Optional vs Nullable', () => {
      it('should distinguish between optional and nullable', async () => {
        const parser = object({
          optionalField: optional(string()),
          nullableField: nullable(string()),
          optionalNullableField: optional(nullable(string())),
        })

        expect(await parseWithMode(parser, b`{"nullableField":null}`, options)).toEqual({
          optionalField: undefined,
          nullableField: null,
          optionalNullableField: undefined,
        })

        expect(
          await parseWithMode(parser, b`{"optionalField":"present","nullableField":null}`, options)
        ).toEqual({
          optionalField: 'present',
          nullableField: null,
          optionalNullableField: undefined,
        })

        expect(
          await parseWithMode(
            parser,
            b`{"nullableField":"value","optionalNullableField":null}`,
            options
          )
        ).toEqual({
          optionalField: undefined,
          nullableField: 'value',
          optionalNullableField: null,
        })

        expect(
          await parseWithMode(
            parser,
            b`{"optionalField":"opt","nullableField":"null","optionalNullableField":"both"}`,
            options
          )
        ).toEqual({
          optionalField: 'opt',
          nullableField: 'null',
          optionalNullableField: 'both',
        })
      })
    })

    describe('Wrapper Composition', () => {
      it('should handle optional(nullable(T)) when field is absent', async () => {
        const parser = object({
          field: optional(nullable(string())),
        })
        expect(await parseWithMode(parser, b`{}`, options)).toEqual({ field: undefined })
      })

      it('should handle optional(nullable(T)) when field is null', async () => {
        const parser = object({
          field: optional(nullable(string())),
        })
        expect(await parseWithMode(parser, b`{"field":null}`, options)).toEqual({ field: null })
      })

      it('should handle optional(nullable(T)) when field has value', async () => {
        const parser = object({
          field: optional(nullable(string())),
        })
        expect(await parseWithMode(parser, b`{"field":"hello"}`, options)).toEqual({
          field: 'hello',
        })
      })

      it('should handle arrays of nullable items', async () => {
        const parser = array(nullable(number()))
        expect(await parseWithMode(parser, b`[1,null,2,null,3]`, options)).toEqual([
          1,
          null,
          2,
          null,
          3,
        ])
      })

      it('should handle deeply nested optional wrappers', async () => {
        const parser = object({
          a: optional(
            object({
              b: optional(
                object({
                  c: optional(string()),
                })
              ),
            })
          ),
        })

        expect(await parseWithMode(parser, b`{}`, options)).toEqual({ a: undefined })
        expect(await parseWithMode(parser, b`{"a":{}}`, options)).toEqual({
          a: { b: undefined },
        })
        expect(await parseWithMode(parser, b`{"a":{"b":{}}}`, options)).toEqual({
          a: { b: { c: undefined } },
        })
      })
    })

    describe('Error Handling', () => {
      it('should validate present optional fields against wrapped schema', async () => {
        const parser = object({
          name: string(),
          age: optional(number()),
        })

        // Valid cases
        expect(await parseWithMode(parser, b`{"name":"John"}`, options)).toEqual({
          name: 'John',
          age: undefined,
        })
        expect(await parseWithMode(parser, b`{"name":"John","age":30}`, options)).toEqual({
          name: 'John',
          age: 30,
        })

        // Invalid cases - should validate against number schema when present
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"name":"John","age":"thirty"}`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit' },
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"name":"John","age":true}`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit' },
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"name":"John","age":null}`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit' },
          }
        )
      })

      it('should still require non-optional fields', async () => {
        const parser = object({
          required: string(),
          optional: optional(number()),
        })

        // Missing required field should throw
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"optional":42}`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{}`, options), {})

        // Valid with required field
        expect(await parseWithMode(parser, b`{"required":"test"}`, options)).toEqual({
          required: 'test',
          optional: undefined,
        })
      })
    })

    describe('Field Order Independence', () => {
      it('should handle optional fields in any order', async () => {
        const parser = object({
          a: string(),
          b: optional(number()),
          c: string(),
          d: optional(boolean()),
        })

        const expected = {
          a: 'valueA',
          b: undefined,
          c: 'valueC',
          d: true,
        }

        // Different field orders
        expect(
          await parseWithMode(parser, b`{"a":"valueA","c":"valueC","d":true}`, options)
        ).toEqual(expected)
        expect(
          await parseWithMode(parser, b`{"d":true,"a":"valueA","c":"valueC"}`, options)
        ).toEqual(expected)
        expect(
          await parseWithMode(parser, b`{"c":"valueC","a":"valueA","d":true}`, options)
        ).toEqual(expected)
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should handle missing fields correctly', async () => {
        const parser = object({
          a: string(),
          b: optional(string()),
        })

        // Valid: optional field missing
        expect(await parseWithMode(parser, b`{"a":"value"}`, options)).toEqual({
          a: 'value',
          b: undefined,
        })

        // Valid: optional field present
        expect(await parseWithMode(parser, b`{"a":"value","b":"optional"}`, options)).toEqual({
          a: 'value',
          b: 'optional',
        })

        // Invalid: required field missing
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"b":"optional"}`, options), {})
      })

      it('should not confuse optional with null', async () => {
        const parser = object({
          optional: optional(string()),
        })

        // Missing field = undefined
        expect(await parseWithMode(parser, b`{}`, options)).toEqual({
          optional: undefined,
        })

        // Explicit null should fail (unless wrapped in nullable)
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"optional":null}`, options), {
          code: 'UNEXPECTED_CHARACTER',
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle optional fields with literal types', async () => {
        const parser = object({
          type: literal('user'),
          role: optional(literal('admin')),
        })

        expect(await parseWithMode(parser, b`{"type":"user"}`, options)).toEqual({
          type: 'user',
          role: undefined,
        })

        expect(await parseWithMode(parser, b`{"type":"user","role":"admin"}`, options)).toEqual({
          type: 'user',
          role: 'admin',
        })

        // Currently, the optional schema returns undefined if validation fails
        // This might be reconsidered in future versions for stricter validation
        expect(await parseWithMode(parser, b`{"type":"user","role":"moderator"}`, options)).toEqual(
          {
            type: 'user',
            role: undefined,
          }
        )
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

        expect(await parseWithMode(parser, b`{"a":"test","c":true}`, options)).toEqual({
          a: 'test',
          b: undefined,
          c: true,
        })
      })

      it('should handle optional fields in arrays of objects', async () => {
        const parser = array(
          object({
            id: number(),
            name: optional(string()),
          })
        )

        expect(await parseWithMode(parser, b`[{"id":1},{"id":2,"name":"Test"}]`, options)).toEqual([
          { id: 1, name: undefined },
          { id: 2, name: 'Test' },
        ])
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer optional types', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const optionalNumber = optional(number())
      type OptionalNumber = InferValue<typeof optionalNumber.schema>
      expectTypeOf<OptionalNumber>().toEqualTypeOf<number | undefined>()
    })

    it('should infer optional fields in objects', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parser = object({
        required: string(),
        optional: optional(number()),
      })

      type SchemaType = InferValue<typeof parser.schema>
      expectTypeOf<SchemaType>().toEqualTypeOf<{
        required: string
        optional: number | undefined
      }>()
    })

    it('should infer complex optional types', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parser = object({
        name: string(),
        profile: optional(
          object({
            bio: string(),
            tags: optional(array(string())),
          })
        ),
      })

      type SchemaType = InferValue<typeof parser.schema>
      expectTypeOf<SchemaType>().toEqualTypeOf<{
        name: string
        profile:
          | {
              bio: string
              tags: string[] | undefined
            }
          | undefined
      }>()
    })

    it('should infer correct type for optional(nullable(T))', () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parser = object({
        field: optional(nullable(string())),
      })
      type Result = InferValue<typeof parser.schema>
      expectTypeOf<Result>().toEqualTypeOf<{
        field: string | null | undefined
      }>()
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should handle objects with many optional fields efficiently', () => {
      const parser = object({
        required: string(),
        ...Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [`optional${i}`, optional(number())])
        ),
      })

      const inputWithNoOptionals = '{"required":"test"}'
      const inputWithAllOptionals = JSON.stringify({
        required: 'test',
        ...Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`optional${i}`, i])),
      })

      const start = performance.now()
      const result1 = parser.parse(b`${inputWithNoOptionals}`)
      const result2 = parser.parse(b`${inputWithAllOptionals}`)
      const duration = performance.now() - start

      expect(result1.toValue().required).toBe('test')
      expect(result2.toValue().required).toBe('test')
      expect(duration).toBeLessThan(200)
    })
  })
})
