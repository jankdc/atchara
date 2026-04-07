import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { initialize, literal } from '../src/index'
import { toBytes as b } from '@atchara/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Literal Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Null Literal', () => {
      it('should parse null', async () => {
        const nullLiteral = literal(null)
        expect(await parseWithMode(nullLiteral, b`null`, options)).toBe(null)
      })

      it('should handle whitespace', async () => {
        const nullLiteral = literal(null)
        expect(await parseWithMode(nullLiteral, b`  null  `, options)).toBe(null)
        expect(await parseWithMode(nullLiteral, b`\nnull\n`, options)).toBe(null)
        expect(await parseWithMode(nullLiteral, b`\tnull\t`, options)).toBe(null)
      })

      it('should reject invalid null values', async () => {
        const nullLiteral = literal(null)
        // Case sensitive - wrong capitalization produces validation error
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`Null`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'Null'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`NULL`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'NULL'" },
        })

        // Quoted null - string value doesn't match null literal
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`"null"`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'\"nul'" },
        })

        // Other values - validation errors for non-matching patterns
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`undefined`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'unde'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`nil`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: 'end of input' },
        })
      })
    })

    describe('String Literals', () => {
      it('should parse exact literal string values', async () => {
        const helloLiteral = literal('hello')
        expect(await parseWithMode(helloLiteral, b`"hello"`, options)).toBe('hello')
        await expectAtcharaErrorAsync(() => parseWithMode(helloLiteral, b`"world"`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: '"hello"', found: '"world"' },
        })

        const testLiteral = literal('test')
        expect(await parseWithMode(testLiteral, b`"test"`, options)).toBe('test')
        await expectAtcharaErrorAsync(() => parseWithMode(testLiteral, b`"testing"`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: '"test"', found: '"testing"' },
        })
      })

      it('should handle string literals with special characters', async () => {
        const specialLiteral = literal('hello\nworld')
        expect(await parseWithMode(specialLiteral, b`"hello\\nworld"`, options)).toBe(
          'hello\nworld'
        )
      })
    })

    describe('Number Literals', () => {
      it('should parse exact literal number values', async () => {
        const num42 = literal(42)
        expect(await parseWithMode(num42, b`42`, options)).toBe(42)
        await expectAtcharaErrorAsync(() => parseWithMode(num42, b`43`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: '42', found: '43' },
        })

        const zeroLiteral = literal(0)
        expect(await parseWithMode(zeroLiteral, b`0`, options)).toBe(0)
        await expectAtcharaErrorAsync(() => parseWithMode(zeroLiteral, b`1`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: '0', found: '1' },
        })

        const negativeLiteral = literal(-1)
        expect(await parseWithMode(negativeLiteral, b`-1`, options)).toBe(-1)
        await expectAtcharaErrorAsync(() => parseWithMode(negativeLiteral, b`1`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: '-1', found: '1' },
        })
      })

      it('should handle decimal literals', async () => {
        const decimalLiteral = literal(3.14)
        expect(await parseWithMode(decimalLiteral, b`3.14`, options)).toBe(3.14)
        await expectAtcharaErrorAsync(() => parseWithMode(decimalLiteral, b`3.15`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: '3.14', found: '3.15' },
        })
      })
    })

    describe('Boolean Literals', () => {
      it('should parse exact literal boolean values', async () => {
        const trueLiteral = literal(true)
        expect(await parseWithMode(trueLiteral, b`true`, options)).toBe(true)
        await expectAtcharaErrorAsync(() => parseWithMode(trueLiteral, b`false`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'true', found: 'false' },
        })

        const falseLiteral = literal(false)
        expect(await parseWithMode(falseLiteral, b`false`, options)).toBe(false)
        await expectAtcharaErrorAsync(() => parseWithMode(falseLiteral, b`true`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: 'false', found: 'true' },
        })
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should only accept exact null literal', async () => {
        const nullLiteral = literal(null)

        // Only "null" is valid JSON null
        expect(await parseWithMode(nullLiteral, b`null`, options)).toBe(null)

        // Wrong capitalization - validation error (word comparison)
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`Null`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'Null'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`NULL`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'NULL'" },
        })

        // Similar but invalid tokens - validation errors
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`nil`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: 'end of input' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`none`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'none'" },
        })

        // Non-JSON keywords - validation error (word comparison)
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`undefined`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'unde'" },
        })
      })

      it('should reject quoted null', async () => {
        const nullLiteral = literal(null)

        // JSON null is not quoted - double-quoted produces validation error
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`"null"`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "'\"nul'" },
        })

        // Single quotes are not valid JSON - validation error
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`'null'`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: "''nul'" },
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle complex literal values', async () => {
        // Test various literal types
        const complexString = literal('hello "world"')
        expect(await parseWithMode(complexString, b`"hello \\"world\\""`, options)).toBe(
          'hello "world"'
        )

        const scientificNumber = literal(1e10)
        expect(await parseWithMode(scientificNumber, b`10000000000`, options)).toBe(1e10)
      })

      it('should not partially match literals', async () => {
        const nullLiteral = literal(null)

        // Truncated null - looks like null but ends early
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`nul`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'null'", found: 'end of input' },
        })

        // null with trailing characters - validation error (extra content)
        await expectAtcharaErrorAsync(() => parseWithMode(nullLiteral, b`nullx`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 5 },
        })
      })

      it('should handle whitespace correctly', async () => {
        const testLiteral = literal('test')

        // Should handle whitespace around literals
        expect(await parseWithMode(testLiteral, b`  "test"  `, options)).toBe('test')
        expect(await parseWithMode(testLiteral, b`\n"test"\n`, options)).toBe('test')
        expect(await parseWithMode(testLiteral, b`\t"test"\t`, options)).toBe('test')
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer literal types', () => {
      const _stringLiteral = literal('hello')
      type StringLiteral = (typeof _stringLiteral)['schema']['_output']
      expectTypeOf<StringLiteral>().toEqualTypeOf<'hello'>()

      const _numberLiteral = literal(42)
      type NumberLiteral = (typeof _numberLiteral)['schema']['_output']
      expectTypeOf<NumberLiteral>().toEqualTypeOf<42>()

      const _booleanLiteral = literal(true)
      type BooleanLiteral = (typeof _booleanLiteral)['schema']['_output']
      expectTypeOf<BooleanLiteral>().toEqualTypeOf<true>()

      const _nullLiteral = literal(null)
      type NullLiteral = (typeof _nullLiteral)['schema']['_output']
      expectTypeOf<NullLiteral>().toEqualTypeOf<null>()
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should parse literals efficiently', () => {
      const nullLiteral = literal(null)
      const stringLiteral = literal('test')
      const numberLiteral = literal(123)

      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        nullLiteral.parse(b`null`)
        stringLiteral.parse(b`"test"`)
        numberLiteral.parse(b`123`)
      }
      const duration = performance.now() - start
      expect(duration).toBeLessThan(100) // Should be very fast
    })
  })
})
