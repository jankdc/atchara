import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { initialize, boolean } from '../src/index'
import { toBytes as b } from '@atcharajs/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Boolean Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Boolean Parsing', () => {
      it('should parse true and false', async () => {
        const booleanParser = boolean()
        expect(await parseWithMode(booleanParser, b`true`, options)).toBe(true)
        expect(await parseWithMode(booleanParser, b`false`, options)).toBe(false)
      })

      it('should handle whitespace', async () => {
        const booleanParser = boolean()
        expect(await parseWithMode(booleanParser, b`  true  `, options)).toBe(true)
        expect(await parseWithMode(booleanParser, b`\nfalse\n`, options)).toBe(false)
        expect(await parseWithMode(booleanParser, b`\ttrue\t`, options)).toBe(true)
        expect(await parseWithMode(booleanParser, b`\r\nfalse\r\n`, options)).toBe(false)
      })
    })

    describe('Error Handling', () => {
      it('should reject case-sensitive variants', async () => {
        const booleanParser = boolean()
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`True`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'T' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`TRUE`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'T' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`False`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'F' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`FALSE`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'F' },
        })
      })

      it('should reject quoted boolean values', async () => {
        const booleanParser = boolean()
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`"true"`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '"' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`"false"`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '"' },
        })
      })

      it('should reject non-boolean values', async () => {
        const booleanParser = boolean()
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`yes`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'y' },
        })
        // 'no' starts with 'n' like 'null', so parser expects null keyword
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`no`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'n' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`1`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '1' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`0`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '0' },
        })
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should only accept exact boolean literals', async () => {
        const booleanParser = boolean()
        // Only "true" and "false" are valid JSON booleans
        expect(await parseWithMode(booleanParser, b`true`, options)).toBe(true)
        expect(await parseWithMode(booleanParser, b`false`, options)).toBe(false)

        // Capital letters are unexpected characters
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`True`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'T' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`FALSE`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'F' },
        })
        // Partial matches expect the full keyword
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`t`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'true'", found: 'end of input' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`f`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'false'", found: 'end of input' },
        })
        // Case mismatch on last character
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`truE`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'true'", found: "'truE'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`falsE`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'false'", found: "'falsE'" },
        })
      })

      it('should reject quoted boolean values', async () => {
        const booleanParser = boolean()
        // JSON booleans are not quoted
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`"true"`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '"' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`"false"`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '"' },
        })
        // Single quotes are not valid JSON string delimiters
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`'true'`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: "'" },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`'false'`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: "'" },
        })
      })

      it('should reject numeric representations', async () => {
        const booleanParser = boolean()
        // JSON doesn't use 1/0 for true/false
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`1`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '1' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`0`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '0' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`-1`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '-' },
        })
      })

      it('should reject alternative boolean representations', async () => {
        const booleanParser = boolean()
        // Common boolean alternatives not allowed in JSON
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`yes`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'y' },
        })
        // 'no' starts with 'n' like 'null', parser sees unexpected 'n' character
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`no`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'n' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`on`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'o' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`off`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'o' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`Y`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'Y' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`N`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: 'N' },
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle booleans in various contexts', async () => {
        const booleanParser = boolean()
        // Test that boolean parsing doesn't interfere with other context
        expect(await parseWithMode(booleanParser, b`true`, options)).toBe(true)
        expect(await parseWithMode(booleanParser, b`false`, options)).toBe(false)
      })

      it('should not partially match', async () => {
        const booleanParser = boolean()
        // Incomplete keywords expect the full keyword
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`tru`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'true'", found: 'end of input' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`fals`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
          details: { expected: "'false'", found: 'end of input' },
        })
        // Extra characters after valid keywords are unexpected
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`truex`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 5 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(booleanParser, b`falsex`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 6 },
        })
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer boolean type', () => {
      const _parser = boolean()
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<boolean>()
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should parse booleans efficiently', () => {
      const booleanParser = boolean()
      const start = performance.now()
      for (let i = 0; i < 1000; i++) {
        booleanParser.parse(b`true`)
        booleanParser.parse(b`false`)
      }
      const duration = performance.now() - start
      expect(duration).toBeLessThan(100) // Should be very fast
    })
  })
})
