import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { initialize, number } from '../src/index'
import { toBytes as b } from '@atchara/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Number Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Number Parsing', () => {
      it('should parse integers', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`0`, options)).toBe(0)
        expect(await parseWithMode(numberParser, b`1`, options)).toBe(1)
        expect(await parseWithMode(numberParser, b`-1`, options)).toBe(-1)
        expect(await parseWithMode(numberParser, b`123`, options)).toBe(123)
        expect(await parseWithMode(numberParser, b`-123`, options)).toBe(-123)
        expect(await parseWithMode(numberParser, b`1234567890`, options)).toBe(1234567890)
      })

      it('should parse decimals', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`0.5`, options)).toBe(0.5)
        expect(await parseWithMode(numberParser, b`123.456`, options)).toBe(123.456)
        expect(await parseWithMode(numberParser, b`-123.456`, options)).toBe(-123.456)
        expect(await parseWithMode(numberParser, b`0.0`, options)).toBe(0.0)
      })

      it('should parse scientific notation', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`1e10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`1E10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`1e-10`, options)).toBe(1e-10)
        expect(await parseWithMode(numberParser, b`1e+10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`123.456e78`, options)).toBe(123.456e78)
        expect(await parseWithMode(numberParser, b`-123.456e-78`, options)).toBe(-123.456e-78)
      })

      it('should handle whitespace around numbers', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`  123  `, options)).toBe(123)
        expect(await parseWithMode(numberParser, b`\n-456\n`, options)).toBe(-456)
        expect(await parseWithMode(numberParser, b`\t123.456\t`, options)).toBe(123.456)
      })
    })

    describe('Error Handling', () => {
      it('should reject leading zeros', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`01`, options), {
          messageMatch: /leading zeros/i,
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`00`, options), {
          messageMatch: /leading zeros/i,
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`-01`, options), {
          messageMatch: /leading zeros/i,
        })
      })

      it('should reject hex format', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`0x10`, options), {
          code: 'VALIDATION_ERROR',
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`0xFF`, options), {
          code: 'VALIDATION_ERROR',
        })
      })

      it('should reject octal format', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`0o10`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 2 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`010`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          messageMatch: /leading zeros/i,
        })
      })

      it('should reject binary format', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`0b10`, options), {
          code: 'VALIDATION_ERROR',
        })
      })

      it('should reject NaN and Infinity', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`NaN`, options), {
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`Infinity`, options), {
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`-Infinity`, options), {
          position: { line: 1, column: 1 },
        })
      })

      it('should reject incomplete numbers', async () => {
        const numberParser = number()
        // Must have digits after decimal
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`123.`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit after decimal point', found: 'end of input' },
        })
        // Must have digits after e
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`123e`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 5 },
          details: { expected: 'digit in exponent', found: 'end of input' },
        })
        // Must have digits after e+
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`123e+`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 6 },
          details: { expected: 'digit in exponent', found: 'end of input' },
        })
      })

      it('should reject leading plus', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`+123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        })
      })

      it('should provide structured error for type mismatch', async () => {
        const numberParser = number()
        await expectAtcharaErrorAsync(
          () => parseWithMode(numberParser, b`"not a number"`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'digit' },
          }
        )
      })
    })

    describe('Edge Cases', () => {
      it('should handle zero variations', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`0`, options)).toBe(0)
        expect(await parseWithMode(numberParser, b`-0`, options)).toBe(-0)
        expect(await parseWithMode(numberParser, b`0.0`, options)).toBe(0.0)
        expect(await parseWithMode(numberParser, b`0e0`, options)).toBe(0)
        expect(await parseWithMode(numberParser, b`0E0`, options)).toBe(0)
      })

      it('should handle decimal precision', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`0.1`, options)).toBe(0.1)
        expect(await parseWithMode(numberParser, b`0.123456789`, options)).toBe(0.123456789)
      })

      it('should handle numbers with many decimal places', async () => {
        const numberParser = number()
        const manyDecimals = '0.' + '1'.repeat(100)
        const result = await parseWithMode(numberParser, b`${manyDecimals}`, options)
        expect(typeof result).toBe('number')
      })

      it('should handle all exponent sign combinations', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`1e10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`1E10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`1e+10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`1E+10`, options)).toBe(1e10)
        expect(await parseWithMode(numberParser, b`1e-10`, options)).toBe(1e-10)
        expect(await parseWithMode(numberParser, b`1E-10`, options)).toBe(1e-10)
      })
    })

    describe('IEEE 754 Precision', () => {
      it('should handle numbers beyond safe integer range', async () => {
        const numberParser = number()
        const beyondSafe = '9007199254740993' // MAX_SAFE_INTEGER + 2
        const result = await parseWithMode(numberParser, b`${beyondSafe}`, options)
        expect(typeof result).toBe('number')
      })

      it('should handle very small numbers (underflow)', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`1e-400`, options)).toBe(0)
        expect(await parseWithMode(numberParser, b`5e-324`, options)).toBeCloseTo(5e-324)
      })

      it('should handle very large numbers (overflow)', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`1e400`, options)).toBe(Infinity)
        expect(await parseWithMode(numberParser, b`-1e400`, options)).toBe(-Infinity)
      })

      it('should handle very small and large numbers', async () => {
        const numberParser = number()
        expect(await parseWithMode(numberParser, b`1e-300`, options)).toBe(1e-300)
        expect(await parseWithMode(numberParser, b`1e300`, options)).toBe(1e300)
      })
    })

    describe('Negative Zero', () => {
      it('should preserve negative zero (-0)', async () => {
        const numberParser = number()
        const negZero = await parseWithMode(numberParser, b`-0`, options)
        expect(Object.is(negZero, -0)).toBe(true)
        expect(Object.is(negZero, 0)).toBe(false)
      })

      it('should preserve negative zero (-0.0)', async () => {
        const numberParser = number()
        const negZero = await parseWithMode(numberParser, b`-0.0`, options)
        expect(Object.is(negZero, -0)).toBe(true)
      })

      it('should preserve negative zero (-0e0)', async () => {
        const numberParser = number()
        const negZero = await parseWithMode(numberParser, b`-0e0`, options)
        expect(Object.is(negZero, -0)).toBe(true)
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should reject non-conforming number formats', async () => {
        const numberParser = number()
        // Must start with digit or minus
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`.5`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit' },
        })
        // Must have digit after minus
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`-.5`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit', found: "'.'" },
        })
        // Must have digit after decimal
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`1.`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'digit after decimal point', found: 'end of input' },
        })
        // Must have digit after exponent
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`1e`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 3 },
          details: { expected: 'digit in exponent', found: 'end of input' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`1E`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 3 },
          details: { expected: 'digit in exponent', found: 'end of input' },
        })
        // Must have digit after exponent sign
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`1e-`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 4 },
          details: { expected: 'digit in exponent', found: 'end of input' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`1e+`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 4 },
          details: { expected: 'digit in exponent', found: 'end of input' },
        })
      })

      it('should handle safe integer range', async () => {
        const numberParser = number()
        // Numbers within safe integer range should parse correctly
        const maxSafeInt = 9007199254740991 // 2^53 - 1
        const minSafeInt = -9007199254740991 // -(2^53 - 1)

        expect(await parseWithMode(numberParser, b`${maxSafeInt}`, options)).toBe(maxSafeInt)
        expect(await parseWithMode(numberParser, b`${minSafeInt}`, options)).toBe(minSafeInt)
      })
    })

    describe('Constraints', () => {
      describe('min(n) - inclusive', () => {
        it('should accept number equal to min', async () => {
          const parser = number().min(0)
          expect(await parseWithMode(parser, b`0`, options)).toBe(0)
        })

        it('should accept number above min', async () => {
          const parser = number().min(0)
          expect(await parseWithMode(parser, b`42`, options)).toBe(42)
        })

        it('should reject number below min', async () => {
          const parser = number().min(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-1`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'number >= 0', found: '-1' },
          })
        })

        it('should work with decimal min', async () => {
          const parser = number().min(0.5)
          expect(await parseWithMode(parser, b`0.5`, options)).toBe(0.5)
          expect(await parseWithMode(parser, b`1.0`, options)).toBe(1.0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0.4`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'number >= 0.5' },
          })
        })
      })

      describe('max(n) - inclusive', () => {
        it('should accept number equal to max', async () => {
          const parser = number().max(100)
          expect(await parseWithMode(parser, b`100`, options)).toBe(100)
        })

        it('should accept number below max', async () => {
          const parser = number().max(100)
          expect(await parseWithMode(parser, b`50`, options)).toBe(50)
        })

        it('should reject number above max', async () => {
          const parser = number().max(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`101`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'number <= 100', found: '101' },
          })
        })

        it('should work with negative max', async () => {
          const parser = number().max(-1)
          expect(await parseWithMode(parser, b`-1`, options)).toBe(-1)
          expect(await parseWithMode(parser, b`-10`, options)).toBe(-10)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'number <= -1', found: '0' },
          })
        })
      })

      describe('gt(n) - exclusive', () => {
        it('should accept number strictly greater than bound', async () => {
          const parser = number().gt(0)
          expect(await parseWithMode(parser, b`1`, options)).toBe(1)
          expect(await parseWithMode(parser, b`0.001`, options)).toBe(0.001)
        })

        it('should reject number equal to bound', async () => {
          const parser = number().gt(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'number > 0', found: '0' },
          })
        })

        it('should reject number below bound', async () => {
          const parser = number().gt(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-1`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'number > 0', found: '-1' },
          })
        })
      })

      describe('lt(n) - exclusive', () => {
        it('should accept number strictly less than bound', async () => {
          const parser = number().lt(100)
          expect(await parseWithMode(parser, b`99`, options)).toBe(99)
          expect(await parseWithMode(parser, b`99.999`, options)).toBe(99.999)
        })

        it('should reject number equal to bound', async () => {
          const parser = number().lt(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`100`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'number < 100', found: '100' },
          })
        })

        it('should reject number above bound', async () => {
          const parser = number().lt(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`101`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'number < 100', found: '101' },
          })
        })
      })

      describe('combined constraints', () => {
        it('should support min + max (closed range)', async () => {
          const parser = number().min(0).max(100)
          expect(await parseWithMode(parser, b`0`, options)).toBe(0)
          expect(await parseWithMode(parser, b`50`, options)).toBe(50)
          expect(await parseWithMode(parser, b`100`, options)).toBe(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-1`, options), {
            code: 'VALIDATION_ERROR',
          })
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`101`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should support gt + lt (open range)', async () => {
          const parser = number().gt(0).lt(1)
          expect(await parseWithMode(parser, b`0.5`, options)).toBe(0.5)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0`, options), {
            code: 'VALIDATION_ERROR',
          })
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should support gt + max (half-open range)', async () => {
          const parser = number().gt(0).max(100)
          expect(await parseWithMode(parser, b`0.001`, options)).toBe(0.001)
          expect(await parseWithMode(parser, b`100`, options)).toBe(100)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })

      describe('multipleOf(n)', () => {
        describe('integer multiples', () => {
          it('should accept 0 as multiple of any number', async () => {
            const parser = number().multipleOf(2)
            expect(await parseWithMode(parser, b`0`, options)).toBe(0)
          })

          it('should accept 6 as multiple of 2', async () => {
            const parser = number().multipleOf(2)
            expect(await parseWithMode(parser, b`6`, options)).toBe(6)
          })

          it('should accept 6 as multiple of 3', async () => {
            const parser = number().multipleOf(3)
            expect(await parseWithMode(parser, b`6`, options)).toBe(6)
          })

          it('should accept -6 as multiple of 3', async () => {
            const parser = number().multipleOf(3)
            expect(await parseWithMode(parser, b`-6`, options)).toBe(-6)
          })

          it('should reject 7 as multiple of 2', async () => {
            const parser = number().multipleOf(2)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`7`, options), {
              code: 'VALIDATION_ERROR',
              details: { expected: 'multiple of 2', found: '7' },
            })
          })

          it('should reject 1 as multiple of 2', async () => {
            const parser = number().multipleOf(2)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1`, options), {
              code: 'VALIDATION_ERROR',
              details: { expected: 'multiple of 2', found: '1' },
            })
          })
        })

        describe('decimal multiples', () => {
          it('should accept 0.5 as multiple of 0.5', async () => {
            const parser = number().multipleOf(0.5)
            expect(await parseWithMode(parser, b`0.5`, options)).toBe(0.5)
          })

          it('should accept 1.0 as multiple of 0.5', async () => {
            const parser = number().multipleOf(0.5)
            expect(await parseWithMode(parser, b`1.0`, options)).toBe(1.0)
          })

          it('should accept 1.5 as multiple of 0.5', async () => {
            const parser = number().multipleOf(0.5)
            expect(await parseWithMode(parser, b`1.5`, options)).toBe(1.5)
          })

          it('should reject 0.3 as multiple of 0.5', async () => {
            const parser = number().multipleOf(0.5)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`0.3`, options), {
              code: 'VALIDATION_ERROR',
              details: { expected: 'multiple of 0.5', found: '0.3' },
            })
          })

          it('should accept 0.3 as multiple of 0.1 (IEEE 754 precision)', async () => {
            const parser = number().multipleOf(0.1)
            expect(await parseWithMode(parser, b`0.3`, options)).toBe(0.3)
          })

          it('should accept 1.23 as multiple of 0.01 (IEEE 754 precision)', async () => {
            const parser = number().multipleOf(0.01)
            expect(await parseWithMode(parser, b`1.23`, options)).toBe(1.23)
          })

          it('should reject 1.005 as multiple of 0.01', async () => {
            const parser = number().multipleOf(0.01)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1.005`, options), {
              code: 'VALIDATION_ERROR',
              details: { expected: 'multiple of 0.01', found: '1.005' },
            })
          })
        })

        describe('combined with other constraints', () => {
          it('should accept 6 with min(0).multipleOf(3)', async () => {
            const parser = number().min(0).multipleOf(3)
            expect(await parseWithMode(parser, b`6`, options)).toBe(6)
          })

          it('should reject -3 with min(0).multipleOf(3)', async () => {
            const parser = number().min(0).multipleOf(3)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`-3`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should reject 12 with min(0).max(10).multipleOf(3)', async () => {
            const parser = number().min(0).max(10).multipleOf(3)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`12`, options), {
              code: 'VALIDATION_ERROR',
            })
          })
        })

        describe('edge cases', () => {
          it('should accept negative number as multiple (-6 is multipleOf(2))', async () => {
            const parser = number().multipleOf(2)
            expect(await parseWithMode(parser, b`-6`, options)).toBe(-6)
          })

          it('should handle very large multiples: 1e15 as multipleOf(1e14)', async () => {
            const parser = number().multipleOf(1e14)
            expect(await parseWithMode(parser, b`1e15`, options)).toBe(1e15)
          })

          it('should handle very small multiples: 0.001 as multipleOf(0.001)', async () => {
            const parser = number().multipleOf(0.001)
            expect(await parseWithMode(parser, b`0.001`, options)).toBe(0.001)
          })
        })
      })

      describe('edge cases', () => {
        it('should handle negative zero with min(0)', async () => {
          const parser = number().min(0)
          // -0 >= 0 is true in IEEE 754, so -0 passes the min(0) constraint
          // The parser preserves -0 as the parsed value
          const result = await parseWithMode(parser, b`-0`, options)
          expect(result === 0).toBe(true)
        })

        it('should handle very small decimals near boundary', async () => {
          const parser = number().gt(0)
          expect(await parseWithMode(parser, b`1e-300`, options)).toBe(1e-300)
        })
      })

      describe('immutability', () => {
        it('should not affect original parser when chaining', async () => {
          const original = number()
          const constrained = original.min(0)
          expect(await parseWithMode(original, b`-1`, options)).toBe(-1)
          await expectAtcharaErrorAsync(() => parseWithMode(constrained, b`-1`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer number type', () => {
      const _parser = number()
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<number>()
    })

    it('should preserve type through constraints', () => {
      const _parser = number().min(0).max(100)
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<number>()
    })

    it('should preserve type through multipleOf constraint', () => {
      const _parser = number().multipleOf(2)
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<number>()
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should handle large numbers efficiently', () => {
      const numberParser = number()
      const largeNumber = '123456789012345'
      expect(numberParser.parse(b`${largeNumber}`).toValue()).toBe(123456789012345)
    })

    it('should handle scientific notation efficiently', () => {
      const numberParser = number()
      expect(numberParser.parse(b`1.23e100`).toValue()).toBe(1.23e100)
      expect(numberParser.parse(b`1.23e-100`).toValue()).toBe(1.23e-100)
    })
  })
})
