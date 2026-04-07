import { describe, it, expect, beforeAll } from 'vitest'
import { toBytes as b } from '@atchara/core'
import { type Parser, initialize, object, number, string, array } from '../src/index'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('RFC 8259 General Compliance', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Whitespace Handling', () => {
      it('should accept only valid whitespace characters', async () => {
        const parser = object({
          a: number(),
          b: string(),
        })

        // Space (0x20)
        expect(await parseWithMode(parser, b`{ "a" : 1 , "b" : "test" }`, options)).toEqual({
          a: 1,
          b: 'test',
        })

        // Tab (0x09)
        expect(await parseWithMode(parser, b`{\t"a"\t:\t1\t,\t"b"\t:\t"test"\t}`, options)).toEqual(
          {
            a: 1,
            b: 'test',
          }
        )

        // Line feed (0x0A)
        expect(await parseWithMode(parser, b`{\n"a"\n:\n1\n,\n"b"\n:\n"test"\n}`, options)).toEqual(
          {
            a: 1,
            b: 'test',
          }
        )

        // Carriage return (0x0D)
        expect(await parseWithMode(parser, b`{\r"a"\r:\r1\r,\r"b"\r:\r"test"\r}`, options)).toEqual(
          {
            a: 1,
            b: 'test',
          }
        )

        // Mixed whitespace
        expect(
          await parseWithMode(
            parser,
            b`{\r\n\t "a" \t:\r\n 1 \t,\r\n "b" \t:\r\n "test" \r\n}`,
            options
          )
        ).toEqual({
          a: 1,
          b: 'test',
        })
      })

      it('should reject other whitespace characters', async () => {
        const parser = number()

        // Non-breaking space not allowed (U+00A0)
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u00A0123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        })

        // Other Unicode spaces not allowed
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u2000123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        }) // En quad

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u2001123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        }) // Em quad

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u2002123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        }) // En space

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u2003123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        }) // Em space

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u2028123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        }) // Line separator

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\u2029123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        }) // Paragraph separator
      })

      it('should handle whitespace at all valid positions', async () => {
        const parser = array(object({ x: number() }))

        // Whitespace before and after all structural characters
        expect(await parseWithMode(parser, b` [ { "x" : 1 } , { "x" : 2 } ] `, options)).toEqual([
          { x: 1 },
          { x: 2 },
        ])

        // Extensive whitespace
        expect(
          await parseWithMode(
            parser,
            b`\n\t [\n\t {\n\t "x"\n\t :\n\t 1\n\t }\n\t ,\n\t {\n\t "x"\n\t :\n\t 2\n\t }\n\t ]\n\t `,
            options
          )
        ).toEqual([{ x: 1 }, { x: 2 }])
      })
    })

    describe('Comments Rejection', () => {
      it('should reject single-line comments', async () => {
        const parser = object({ a: number() })

        // Comments before JSON
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`// comment\n{"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`// comment\r\n{"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
          }
        )

        // Comments after JSON
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1} // comment`, options), {
          code: 'VALIDATION_ERROR',
        })
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"a":1}\n// comment`, options),
          {
            code: 'VALIDATION_ERROR',
          }
        )

        // Comments within JSON
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"a": // comment\n1}`, options),
          {
            code: 'VALIDATION_ERROR',
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{// comment\n"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
          }
        )
      })

      it('should reject multi-line comments', async () => {
        const parser = object({ a: number() })

        // Comments before JSON
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`/* comment */{"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`/* multi\nline\ncomment */{"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
          }
        )

        // Comments after JSON
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"a":1}/* comment */`, options),
          {
            code: 'VALIDATION_ERROR',
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"a":1} /* comment */`, options),
          {
            code: 'VALIDATION_ERROR',
          }
        )

        // Comments within JSON
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{"a":/* comment */1}`, options),
          {
            code: 'VALIDATION_ERROR',
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`{/* comment */"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
          }
        )
      })

      it('should not confuse comment-like content in strings', async () => {
        const parser = string()

        // These should parse successfully as they're within strings
        expect(await parseWithMode(parser, b`"// not a comment"`, options)).toBe('// not a comment')
        expect(await parseWithMode(parser, b`"/* not a comment */"`, options)).toBe(
          '/* not a comment */'
        )
        expect(await parseWithMode(parser, b`"text // with comment syntax"`, options)).toBe(
          'text // with comment syntax'
        )
      })
    })

    describe('UTF-8 Compliance', () => {
      it('should handle UTF-8 strings correctly', async () => {
        const parser = string()

        // Basic multilingual plane
        expect(await parseWithMode(parser, b`"Hello 世界"`, options)).toBe('Hello 世界')
        expect(await parseWithMode(parser, b`"Здравствуй мир"`, options)).toBe('Здравствуй мир')
        expect(await parseWithMode(parser, b`"مرحبا بالعالم"`, options)).toBe('مرحبا بالعالم')

        // Emoji (supplementary plane)
        expect(await parseWithMode(parser, b`"😀"`, options)).toBe('😀')
        expect(await parseWithMode(parser, b`"Hello 👋 World 🌍"`, options)).toBe(
          'Hello 👋 World 🌍'
        )

        // Mathematical symbols
        expect(await parseWithMode(parser, b`"∑∆∏√∫"`, options)).toBe('∑∆∏√∫')

        // Various scripts
        expect(await parseWithMode(parser, b`"αβγδε"`, options)).toBe('αβγδε') // Greek
        expect(await parseWithMode(parser, b`"हिंदी"`, options)).toBe('हिंदी') // Hindi
        expect(await parseWithMode(parser, b`"中文"`, options)).toBe('中文') // Chinese
      })

      it('should reject BOM (Byte Order Mark)', async () => {
        const numberParser = number()
        const objectParser = object({ test: number() })

        // UTF-8 BOM (U+FEFF)
        await expectAtcharaErrorAsync(() => parseWithMode(numberParser, b`\uFEFF123`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(
          () => parseWithMode(objectParser, b`\uFEFF{"test": 123}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
          }
        )
      })

      it('should handle UTF-8 in all value types', async () => {
        const parser = object({
          name: string(),
          description: string(),
          tags: array(string()),
        })

        expect(
          await parseWithMode(
            parser,
            b`{"name":"José","description":"Café français","tags":["français","español","русский"]}`,
            options
          )
        ).toEqual({
          name: 'José',
          description: 'Café français',
          tags: ['français', 'español', 'русский'],
        })
      })
    })

    describe('Input Validation', () => {
      it('should handle empty input', async () => {
        const parser = number()

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b``, options), {
          code: 'VALIDATION_ERROR',
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`   `, options), {
          code: 'VALIDATION_ERROR',
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`\n\t\r\n`, options), {
          code: 'VALIDATION_ERROR',
        })
      })

      it('should reject multiple values', async () => {
        const parser = number()

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`123 456`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 4 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`123\n456`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 4 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`123,456`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 4 },
        })

        const stringParser = string()
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, b`"hello" "world"`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 8 },
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, b`"hello"\n"world"`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 8 },
          }
        )
      })

      it('should reject trailing content', async () => {
        const parser = object({ a: number() })

        // Trailing alphabetic content
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1} extra`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 8 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1}\nextra`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 8 },
        })

        // Trailing JSON value
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":1}{"b":2}`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 8 },
        })
      })
    })

    describe('Structural Validation', () => {
      it('should enforce proper JSON structure', async () => {
        // Objects must have proper braces
        await expectAtcharaErrorAsync(
          () => parseWithMode(object({ a: number() }), b`{"a":1`, options),
          {
            code: 'UNEXPECTED_EOF',
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(object({ a: number() }), b`"a":1}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
            details: { character: '"' },
          }
        )

        // Arrays must have proper brackets
        await expectAtcharaErrorAsync(() => parseWithMode(array(number()), b`[1,2,3`, options), {
          code: 'UNEXPECTED_EOF',
        })
        await expectAtcharaErrorAsync(() => parseWithMode(array(number()), b`1,2,3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '1' },
        })

        // No mixing of delimiters
        await expectAtcharaErrorAsync(
          () => parseWithMode(object({ a: number() }), b`[a:1]`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 1 },
            details: { character: '[' },
          }
        )
        await expectAtcharaErrorAsync(() => parseWithMode(array(number()), b`{1,2,3}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '{' },
        })
      })

      it('should enforce comma separation', async () => {
        const objectParser = object({ a: number(), b: number() })

        await expectAtcharaErrorAsync(
          () => parseWithMode(objectParser, b`{"a":1 "b":2}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 8 },
            details: { character: '"' },
          }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(objectParser, b`{"a":1; "b":2}`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 7 },
            details: { character: ';' },
          }
        )

        const arrayParser = array(number())

        await expectAtcharaErrorAsync(() => parseWithMode(arrayParser, b`[1 2 3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 4 },
          details: { character: '2' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(arrayParser, b`[1; 2; 3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 3 },
          details: { character: ';' },
        })
      })

      it('should enforce colon separation in objects', async () => {
        const parser = object({ a: number() })

        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a"=1}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 5 },
          details: { character: '=' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a" 1}`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 6 },
          details: { character: '1' },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"a":}`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 6 },
        })
      })
    })

    describe('Nesting Limits', () => {
      it('should handle very deeply nested structures', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parser: Parser<any> = number()
        let value: unknown = 42

        // Create deeply nested parser (50 levels - well within native serde limits)
        for (let i = 0; i < 50; i++) {
          parser = object({ value: parser })
          value = { value }
        }

        const input = JSON.stringify(value)
        const result = await parseWithMode(parser, b`${input}`, options)

        expect(result).toEqual(value)
      })

      it('should handle deeply nested arrays', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let parser: Parser<any> = number()
        let value: unknown = 42

        // Create deeply nested array parser (50 levels)
        for (let i = 0; i < 50; i++) {
          parser = array(parser)
          value = [value]
        }

        const input = JSON.stringify(value)
        const result = await parseWithMode(parser, b`${input}`, options)

        expect(result).toEqual(value)
      })
    })

    describe('Edge Cases and Stress Tests', () => {
      it('should handle very long strings', async () => {
        const parser = string()
        const longString = 'a'.repeat(10000)
        expect(await parseWithMode(parser, b`"${longString}"`, options)).toBe(longString)
      })

      it('should handle large numbers', async () => {
        const parser = number()

        // Very large integers
        expect(await parseWithMode(parser, b`999999999999999`, options)).toBe(999999999999999)
        expect(await parseWithMode(parser, b`-999999999999999`, options)).toBe(-999999999999999)

        // Scientific notation with large exponents
        expect(await parseWithMode(parser, b`1e100`, options)).toBe(1e100)
        expect(await parseWithMode(parser, b`1e-100`, options)).toBe(1e-100)
      })

      it('should handle large arrays', async () => {
        const parser = array(number())
        const largeArray = Array.from({ length: 1000 }, (_, i) => i)
        const input = JSON.stringify(largeArray)

        const result = await parseWithMode(parser, b`${input}`, options)
        expect(result).toEqual(largeArray)
      })

      it('should handle large objects', async () => {
        const schemaShape = Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`field${i}`, number()])
        )
        const parser = object(schemaShape)

        const largeObject = Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`field${i}`, i])
        )
        const input = JSON.stringify(largeObject)

        const result = await parseWithMode(parser, b`${input}`, options)
        expect(result).toEqual(largeObject)
      })
    })

    describe('Character Encoding Edge Cases', () => {
      it('should handle all valid escape sequences', async () => {
        const parser = string()

        // All standard escape sequences
        expect(await parseWithMode(parser, b`"\\"\\\\\\/\\b\\f\\n\\r\\t"`, options)).toBe(
          '"\\/\b\f\n\r\t'
        )

        // Unicode escape sequences
        expect(await parseWithMode(parser, b`"\\u0000\\u0001\\u001F"`, options)).toBe(
          '\u0000\u0001\u001F'
        )
        expect(await parseWithMode(parser, b`"\\u0020\\u007E\\u007F"`, options)).toBe(
          '\u0020\u007E\u007F'
        )
      })

      it('should handle control characters via escape sequences', async () => {
        const parser = string()

        // All control characters must be escaped
        for (let i = 0; i <= 0x1f; i++) {
          const hexCode = i.toString(16).padStart(4, '0').toUpperCase()
          const escaped = `"\\u${hexCode}"`
          const expected = String.fromCharCode(i)
          expect(await parseWithMode(parser, b`${escaped}`, options)).toBe(expected)
        }
      })

      it('should handle high Unicode code points', async () => {
        const parser = string()

        // Various Unicode planes
        expect(await parseWithMode(parser, b`"\\u2603"`, options)).toBe('☃') // Snowman
        expect(await parseWithMode(parser, b`"\\u2764"`, options)).toBe('❤') // Heart
        expect(await parseWithMode(parser, b`"\\u20AC"`, options)).toBe('€') // Euro sign
        expect(await parseWithMode(parser, b`"\\u00A9"`, options)).toBe('©') // Copyright
      })
    })

    describe('RFC 8259 Number Precision', () => {
      it('should handle numbers at f64 boundaries', async () => {
        const parser = number()
        // Max f64 value
        expect(await parseWithMode(parser, b`1.7976931348623157e+308`, options)).toBe(
          Number.MAX_VALUE
        )
        // Min positive f64 value
        expect(await parseWithMode(parser, b`5e-324`, options)).toBeCloseTo(Number.MIN_VALUE)
      })
    })

    describe('RFC 8259 String Unicode Handling', () => {
      it('should correctly handle emoji via direct UTF-8', async () => {
        const parser = string()
        // Direct UTF-8 emoji encoding
        expect(await parseWithMode(parser, b`"😀😁"`, options)).toBe('😀😁')
      })

      it('should decode valid UTF-16 surrogate pairs', async () => {
        const parser = string()
        // Valid surrogate pairs are now supported
        expect(await parseWithMode(parser, b`"\\uD83D\\uDE00"`, options)).toBe('😀')
      })
    })
  })

  // Sync-only tests for error messages that test throw behavior
  describe('Sync Error Handling', () => {
    it('should reject lone surrogate escape sequences', () => {
      const parser = string()
      // Lone low surrogate is invalid
      expect(() => parser.parse(b`"\\uDE00"`)).toThrow(
        /Expected valid Unicode code point, found U\+DE00/
      )
    })
  })

  // Performance - sync only
  describe('Performance Considerations', () => {
    it('should parse complex nested structures efficiently', () => {
      const complexParser = object({
        users: array(
          object({
            id: number(),
            name: string(),
            email: string(),
            profile: object({
              bio: string(),
              age: number(),
              interests: array(string()),
            }),
            posts: array(
              object({
                id: number(),
                title: string(),
                content: string(),
                tags: array(string()),
              })
            ),
          })
        ),
      })

      const complexData = {
        users: Array.from({ length: 10 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@test.com`,
          profile: {
            bio: `Bio for user ${i}`,
            age: 20 + i,
            interests: ['coding', 'testing', 'json'],
          },
          posts: Array.from({ length: 5 }, (_, j) => ({
            id: j,
            title: `Post ${j} by User ${i}`,
            content: `This is the content of post ${j}`,
            tags: ['tag1', 'tag2'],
          })),
        })),
      }

      const input = JSON.stringify(complexData)
      const start = performance.now()
      const result = complexParser.parse(b`${input}`)
      const duration = performance.now() - start

      expect(result.toValue()).toEqual(complexData)
      expect(duration).toBeLessThan(500) // Should parse complex structure efficiently
    })
  })
})
