import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { initialize, integer, object, array } from '../src/index'
import { toBytes as b } from '@atchara/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Integer Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Integer Parsing', () => {
      it('should parse valid integers', async () => {
        const intParser = integer()
        expect(await parseWithMode(intParser, b`0`, options)).toBe(0)
        expect(await parseWithMode(intParser, b`1`, options)).toBe(1)
        expect(await parseWithMode(intParser, b`-1`, options)).toBe(-1)
        expect(await parseWithMode(intParser, b`123`, options)).toBe(123)
        expect(await parseWithMode(intParser, b`-123`, options)).toBe(-123)
        expect(await parseWithMode(intParser, b`1234567890`, options)).toBe(1234567890)
      })

      it('should parse safe integer boundaries', async () => {
        const intParser = integer()
        const MAX_SAFE = 9007199254740991
        const MIN_SAFE = -9007199254740991

        expect(await parseWithMode(intParser, b`${MAX_SAFE}`, options)).toBe(MAX_SAFE)
        expect(await parseWithMode(intParser, b`${MIN_SAFE}`, options)).toBe(MIN_SAFE)
      })

      it('should handle whitespace around integers', async () => {
        const intParser = integer()
        expect(await parseWithMode(intParser, b`  123  `, options)).toBe(123)
        expect(await parseWithMode(intParser, b`\n-456\n`, options)).toBe(-456)
        expect(await parseWithMode(intParser, b`\t789\t`, options)).toBe(789)
      })
    })

    describe('Decimal Rejection', () => {
      it('should reject decimal numbers', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1.0`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1.0'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1.5`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1.5'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`0.0`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'0.0'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`-1.0`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'-1.0'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`123.456`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'123.456'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`0.123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'0.123'" },
        })
      })
    })

    describe('Exponent Rejection', () => {
      it('should reject numbers with exponents', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1e2`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1e2'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1E2`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1E2'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1e+2`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1e+2'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1e-2`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1e-2'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`100E10`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'100E10'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1e0`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'integer', found: "'1e0'" },
        })
      })
    })

    describe('Range Validation', () => {
      const rangeExpected = 'integer in range -9007199254740991 to 9007199254740991'

      it('should reject integers outside safe range', async () => {
        const intParser = integer()
        // MAX_SAFE_INTEGER + 1
        await expectAtcharaErrorAsync(
          () => parseWithMode(intParser, b`9007199254740992`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: rangeExpected, found: '9007199254740992' },
          }
        )
        // MIN_SAFE_INTEGER - 1
        await expectAtcharaErrorAsync(
          () => parseWithMode(intParser, b`-9007199254740992`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: rangeExpected, found: '-9007199254740992' },
          }
        )
      })

      it('should reject large positive integers', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(
          () => parseWithMode(intParser, b`99999999999999999`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: rangeExpected, found: '99999999999999999' },
          }
        )
      })

      it('should reject large negative integers', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(
          () => parseWithMode(intParser, b`-99999999999999999`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: rangeExpected, found: '-99999999999999999' },
          }
        )
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should reject leading zeros', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`01`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'number without leading zeros', found: "'01'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`007`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'number without leading zeros', found: "'007'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`-01`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'number without leading zeros', found: "'-01'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`00`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'number without leading zeros', found: "'00'" },
        })
      })

      it('should handle zero correctly', async () => {
        const intParser = integer()
        expect(await parseWithMode(intParser, b`0`, options)).toBe(0)
      })

      it('should handle negative zero', async () => {
        const intParser = integer()
        const result = await parseWithMode(intParser, b`-0`, options)
        // -0 parses as 0 when going through i64
        // This is acceptable since -0 === 0 in JavaScript for most purposes
        expect(result).toBe(0)
      })
    })

    describe('Error Messages', () => {
      it('should provide structured error for decimals', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1.5`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          messageMatch: /Expected integer/,
          details: {
            expected: 'integer',
            found: expect.stringContaining('1.5') as string,
          },
        })
      })

      it('should provide structured error for exponents', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`1e5`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          messageMatch: /Expected integer/,
          details: {
            expected: 'integer',
            found: expect.stringContaining('1e5') as string,
          },
        })
      })

      it('should provide structured error for out of range', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(
          () => parseWithMode(intParser, b`9007199254740992`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            messageMatch: /range/,
          }
        )
      })

      it('should provide correct position for multiline input', async () => {
        const parser = object({ count: integer() })
        // Error should be at line 2, column after "count":
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{\n  "count": 1.5\n}`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 2, column: 12 },
            messageMatch: /Expected integer/,
          }
        )
      })

      it('should provide correct column for inline errors', async () => {
        const parser = array(integer())
        // Error at position of 1.5 in array
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1, 2, 1.5]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 8 },
          messageMatch: /Expected integer/,
        })
      })
    })

    describe('Integration with Objects', () => {
      it('should work as object field', async () => {
        const parser = object({ count: integer() })
        expect(await parseWithMode(parser, b`{"count": 42}`, options)).toEqual({ count: 42 })
      })

      it('should reject decimal in object field', async () => {
        const parser = object({ count: integer() })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"count": 42.5}`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 11 },
          details: { expected: 'integer', found: "'42.5'" },
        })
      })

      it('should reject exponent in object field', async () => {
        const parser = object({ count: integer() })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"count": 1e2}`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 11 },
          details: { expected: 'integer', found: "'1e2'" },
        })
      })
    })

    describe('Integration with Arrays', () => {
      it('should work as array element', async () => {
        const parser = array(integer())
        expect(await parseWithMode(parser, b`[1, 2, 3]`, options)).toEqual([1, 2, 3])
      })

      it('should reject decimal in array element', async () => {
        const parser = array(integer())
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1, 2.5, 3]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 5 },
          details: { expected: 'integer', found: "'2.5'" },
        })
      })

      it('should reject exponent in array element', async () => {
        const parser = array(integer())
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1, 1e2, 3]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 5 },
          details: { expected: 'integer', found: "'1e2'" },
        })
      })

      it('should handle empty array', async () => {
        const parser = array(integer())
        expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
      })
    })

    describe('Edge Cases', () => {
      it('should handle single digit integers', async () => {
        const intParser = integer()
        for (let i = 0; i <= 9; i++) {
          expect(await parseWithMode(intParser, b`${i}`, options)).toBe(i)
        }
      })

      it('should handle negative single digit integers', async () => {
        const intParser = integer()
        for (let i = 1; i <= 9; i++) {
          expect(await parseWithMode(intParser, b`-${i}`, options)).toBe(-i)
        }
      })

      it('should reject type mismatches', async () => {
        const intParser = integer()
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`"string"`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'\"'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`true`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'t'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`false`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'f'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`null`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'n'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`[]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'['" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(intParser, b`{}`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'{'" },
        })
      })
    })

    describe('Constraints', () => {
      describe('min/max/gt/lt', () => {
        it('should accept integer equal to min (inclusive)', async () => {
          const parser = integer().min(0)
          expect(await parseWithMode(parser, b`0`, options)).toBe(0)
        })

        it('should accept integer above min', async () => {
          const parser = integer().min(0)
          expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        })

        it('should reject integer below min', async () => {
          const parser = integer().min(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-1`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'integer >= 0', found: '-1' },
          })
        })

        it('should accept integer equal to max (inclusive)', async () => {
          const parser = integer().max(100)
          expect(await parseWithMode(parser, b`100`, options)).toBe(100)
        })

        it('should reject integer above max', async () => {
          const parser = integer().max(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`101`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'integer <= 100', found: '101' },
          })
        })

        it('should reject integer equal to gt bound (exclusive)', async () => {
          const parser = integer().gt(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'integer > 0', found: '0' },
          })
        })

        it('should accept integer strictly greater than gt bound', async () => {
          const parser = integer().gt(0)
          expect(await parseWithMode(parser, b`1`, options)).toBe(1)
        })

        it('should reject integer equal to lt bound (exclusive)', async () => {
          const parser = integer().lt(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`100`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'integer < 100', found: '100' },
          })
        })

        it('should accept integer strictly less than lt bound', async () => {
          const parser = integer().lt(100)
          expect(await parseWithMode(parser, b`99`, options)).toBe(99)
        })

        it('should use "integer" in error messages, not "number"', async () => {
          const parser = integer().min(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-1`, options), {
            code: 'VALIDATION_ERROR',
            messageMatch: /integer >= 0/,
          })
        })
      })

      describe('multipleOf(n)', () => {
        it('should accept 0 as multiple of any integer', async () => {
          const parser = integer().multipleOf(2)
          expect(await parseWithMode(parser, b`0`, options)).toBe(0)
        })

        it('should accept 6 as multiple of 2', async () => {
          const parser = integer().multipleOf(2)
          expect(await parseWithMode(parser, b`6`, options)).toBe(6)
        })

        it('should accept -6 as multiple of 3', async () => {
          const parser = integer().multipleOf(3)
          expect(await parseWithMode(parser, b`-6`, options)).toBe(-6)
        })

        it('should reject 7 as multiple of 2', async () => {
          const parser = integer().multipleOf(2)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`7`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'multiple of 2', found: '7' },
          })
        })

        it('should reject 1 as multiple of 3', async () => {
          const parser = integer().multipleOf(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'multiple of 3', found: '1' },
          })
        })

        it('should accept 6 with min(0).multipleOf(3)', async () => {
          const parser = integer().min(0).multipleOf(3)
          expect(await parseWithMode(parser, b`6`, options)).toBe(6)
        })

        it('should reject -3 with min(0).multipleOf(3)', async () => {
          const parser = integer().min(0).multipleOf(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-3`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should use "multiple of N" error message format', async () => {
          const parser = integer().multipleOf(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`7`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'multiple of 3', found: '7' },
          })
        })
      })

      describe('validation order', () => {
        it('should report integer error first: decimal input with min(0) gets integer error', async () => {
          const parser = integer().min(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1.5`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'integer' },
          })
        })
      })

      describe('immutability', () => {
        it('should not affect original parser when chaining', async () => {
          const original = integer()
          const constrained = original.min(10)
          expect(await parseWithMode(original, b`1`, options)).toBe(1)
          await expectAtcharaErrorAsync(() => parseWithMode(constrained, b`1`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer number type', () => {
      const _parser = integer()
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<number>()
    })

    it('should preserve type through constraints', () => {
      const _parser = integer().min(0).max(100)
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<number>()
    })
  })
})
