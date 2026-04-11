import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { initialize, string, object, nullable, union, number, array } from '../src/index'
import { toBytes as b } from '@atcharajs/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('String Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic String Parsing', () => {
      it('should parse simple strings', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"hello"`, options)).toBe('hello')
        expect(await parseWithMode(stringParser, b`""`, options)).toBe('')
        expect(await parseWithMode(stringParser, b`"Hello, World!"`, options)).toBe('Hello, World!')
      })

      it('should handle whitespace around strings', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`  "hello"  `, options)).toBe('hello')
        expect(await parseWithMode(stringParser, b`\n"hello"\n`, options)).toBe('hello')
        expect(await parseWithMode(stringParser, b`\t"hello"\t`, options)).toBe('hello')
        expect(await parseWithMode(stringParser, b`\r\n"hello"\r\n`, options)).toBe('hello')
      })
    })

    describe('Escape Sequences', () => {
      it('should handle basic escape sequences', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"\\""`, options)).toBe('"')
        expect(await parseWithMode(stringParser, b`"\\\\"`, options)).toBe('\\')
        expect(await parseWithMode(stringParser, b`"\\/"`, options)).toBe('/')
        expect(await parseWithMode(stringParser, b`"\\b"`, options)).toBe('\b')
        expect(await parseWithMode(stringParser, b`"\\f"`, options)).toBe('\f')
        expect(await parseWithMode(stringParser, b`"\\n"`, options)).toBe('\n')
        expect(await parseWithMode(stringParser, b`"\\r"`, options)).toBe('\r')
        expect(await parseWithMode(stringParser, b`"\\t"`, options)).toBe('\t')
      })

      it('should handle unicode escape sequences', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"\\u0048"`, options)).toBe('H')
        expect(await parseWithMode(stringParser, b`"\\u0065\\u006C\\u006C\\u006F"`, options)).toBe(
          'ello'
        )
        expect(
          await parseWithMode(stringParser, b`"\\u0048\\u0065\\u006C\\u006C\\u006F"`, options)
        ).toBe('Hello')
        expect(await parseWithMode(stringParser, b`"\\u2764"`, options)).toBe('❤')
        expect(await parseWithMode(stringParser, b`"\\u0000"`, options)).toBe('\0')
        expect(await parseWithMode(stringParser, b`"\\uFFFF"`, options)).toBe('\uFFFF')
      })
    })

    describe('UTF-8 Support', () => {
      it('should handle UTF-8 strings', async () => {
        const stringParser = string()
        // Basic multilingual plane
        expect(await parseWithMode(stringParser, b`"Hello 世界"`, options)).toBe('Hello 世界')
        expect(await parseWithMode(stringParser, b`"Здравствуй мир"`, options)).toBe(
          'Здравствуй мир'
        )
        expect(await parseWithMode(stringParser, b`"مرحبا بالعالم"`, options)).toBe('مرحبا بالعالم')

        // Emoji (supplementary plane)
        expect(await parseWithMode(stringParser, b`"😀"`, options)).toBe('😀')
        expect(await parseWithMode(stringParser, b`"Hello 👋 World 🌍"`, options)).toBe(
          'Hello 👋 World 🌍'
        )
      })
    })

    describe('Error Handling', () => {
      it('should reject single quotes', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`'hello'`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
        })
      })

      it('should reject unquoted strings', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`hello`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
        })
      })

      it('should reject unterminated strings', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"hello`, options), {
          code: 'UNEXPECTED_EOF',
        })
      })

      it('should reject invalid escape sequences', async () => {
        const stringParser = string()
        // Invalid escape character
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"\\x"`, options), {})
        // Must be 4 hex digits
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"\\u123"`, options), {})
        // Invalid hex character
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"\\u123g"`, options), {})
      })

      it('should reject unescaped control characters', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new TextEncoder().encode('"\n"'), options),
          { code: 'UNEXPECTED_CHARACTER' }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new TextEncoder().encode('"\t"'), options),
          { code: 'UNEXPECTED_CHARACTER' }
        )
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new TextEncoder().encode('"\u0000"'), options),
          { code: 'UNEXPECTED_CHARACTER' }
        )
      })

      it('should reject continuation bytes without start byte', async () => {
        const stringParser = string()

        // "\x80\x80\x80\x80" - 4 continuation bytes
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(
              stringParser,
              new Uint8Array([0x22, 0x80, 0x80, 0x80, 0x80, 0x22]),
              options
            ),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\x80\x80\x80" - 3 continuation bytes
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(stringParser, new Uint8Array([0x22, 0x80, 0x80, 0x80, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\x80" - single continuation byte
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0x80, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xBF" - max continuation byte value
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xbf, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )
      })

      it('should reject invalid UTF-8 start bytes (0xFE, 0xFF)', async () => {
        const stringParser = string()

        // "\xFE" - never valid in UTF-8
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xfe, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xFF" - never valid in UTF-8
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xff, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )
      })

      it('should reject truncated multi-byte UTF-8 sequences', async () => {
        const stringParser = string()

        // "\xC2" - 2-byte start without continuation
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xc2, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xE0\xA0" - 3-byte start missing third byte
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xe0, 0xa0, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xF0\x90\x80" - 4-byte start missing fourth byte
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(stringParser, new Uint8Array([0x22, 0xf0, 0x90, 0x80, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )
      })

      it('should reject overlong UTF-8 encodings', async () => {
        const stringParser = string()

        // "\xC0\x80" - overlong encoding for NUL (U+0000)
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xc0, 0x80, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xC1\xBF" - overlong encoding for U+007F (should be single byte)
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, new Uint8Array([0x22, 0xc1, 0xbf, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xE0\x80\x80" - overlong encoding for NUL in 3 bytes
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(stringParser, new Uint8Array([0x22, 0xe0, 0x80, 0x80, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xF0\x80\x80\x80" - overlong encoding for NUL in 4 bytes
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(
              stringParser,
              new Uint8Array([0x22, 0xf0, 0x80, 0x80, 0x80, 0x22]),
              options
            ),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )
      })

      it('should reject UTF-8 encoded surrogate code points', async () => {
        const stringParser = string()

        // "\xED\xA0\x80" - UTF-8 encoding of U+D800 (high surrogate)
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(stringParser, new Uint8Array([0x22, 0xed, 0xa0, 0x80, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xED\xBF\xBF" - UTF-8 encoding of U+DFFF (low surrogate)
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(stringParser, new Uint8Array([0x22, 0xed, 0xbf, 0xbf, 0x22]), options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )
      })

      it('should reject code points beyond U+10FFFF', async () => {
        const stringParser = string()

        // "\xF4\x90\x80\x80" - U+110000 (first invalid code point)
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(
              stringParser,
              new Uint8Array([0x22, 0xf4, 0x90, 0x80, 0x80, 0x22]),
              options
            ),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )

        // "\xF5\x80\x80\x80" - would encode U+140000 if valid
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(
              stringParser,
              new Uint8Array([0x22, 0xf5, 0x80, 0x80, 0x80, 0x22]),
              options
            ),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 2 },
          }
        )
      })

      it('should reject invalid UTF-8 with valid prefix', async () => {
        const stringParser = string()

        // "hello\x80world" - valid ASCII then invalid continuation byte
        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(
              stringParser,
              new Uint8Array([
                0x22, 0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x80, 0x77, 0x6f, 0x72, 0x6c, 0x64, 0x22,
              ]),
              options
            ),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 7 },
          }
        )
      })

      it('should provide structured error with position for type mismatch', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`123`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
        })
      })

      it('should provide error for unterminated string', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"hello`, options), {
          code: 'UNEXPECTED_EOF',
        })
      })

      it('should provide position for invalid escape sequence', async () => {
        const stringParser = string()
        // Position is at the invalid escape, not the string start
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"\\x"`, options), {
          position: { line: 1, column: 3 },
        })
      })
    })

    describe('Edge Cases', () => {
      it('should handle strings with structural characters', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"{[,:]}"`, options)).toBe('{[,:]}')
        expect(await parseWithMode(stringParser, b`"{\\"test\\": [1,2,3]}"`, options)).toBe(
          '{"test": [1,2,3]}'
        )
      })

      it('should handle empty string', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`""`, options)).toBe('')
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should handle emoji via direct UTF-8', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"😀"`, options)).toBe('😀')
        expect(await parseWithMode(stringParser, b`"😀😁"`, options)).toBe('😀😁')
      })

      it('should decode valid surrogate pairs in unicode escapes', async () => {
        const stringParser = string()
        // Valid pair: \uD83D\uDE00 = U+1F600 = 😀
        expect(await parseWithMode(stringParser, b`"\\uD83D\\uDE00"`, options)).toBe('😀')
      })

      it('should decode consecutive emoji surrogate pairs', async () => {
        const stringParser = string()
        // \uD83D\uDE39 = 😹, \uD83D\uDC8D = 💍
        expect(await parseWithMode(stringParser, b`"\\uD83D\\uDE39\\uD83D\\uDC8D"`, options)).toBe(
          '😹💍'
        )
      })

      it('should decode musical symbol G clef with mixed-case hex', async () => {
        const stringParser = string()
        // \uD834\uDD1E = U+1D11E = 𝄞
        expect(await parseWithMode(stringParser, b`"\\uD834\\uDd1e"`, options)).toBe('𝄞')
      })

      it('should decode maximum valid Unicode code point', async () => {
        const stringParser = string()
        // \uDBFF\uDFFF = U+10FFFF
        expect(await parseWithMode(stringParser, b`"\\uDBFF\\uDFFF"`, options)).toBe('\u{10FFFF}')
      })

      it('should decode near-maximum code point U+10FFFE', async () => {
        const stringParser = string()
        // \uDBFF\uDFFE = U+10FFFE
        expect(await parseWithMode(stringParser, b`"\\uDBFF\\uDFFE"`, options)).toBe('\u{10FFFE}')
      })

      it('should decode supplementary plane character U+1FFFE', async () => {
        const stringParser = string()
        // \uD83F\uDFFE = U+1FFFE
        expect(await parseWithMode(stringParser, b`"\\uD83F\\uDFFE"`, options)).toBe('\u{1FFFE}')
      })

      it('should reject lone high surrogate (not followed by escape)', async () => {
        const stringParser = string()
        // High surrogate not followed by \uXXXX
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"\\uD83D"`, options), {
          code: 'VALIDATION_ERROR',
          messageMatch: /Expected low surrogate escape/,
        })
      })

      it('should reject lone low surrogate in unicode escapes', async () => {
        const stringParser = string()
        await expectAtcharaErrorAsync(() => parseWithMode(stringParser, b`"\\uDE00"`, options), {
          code: 'VALIDATION_ERROR',
          messageMatch: /Expected valid Unicode code point, found U\+DE00/,
        })
      })

      it('should reject reversed surrogate pair in unicode escapes', async () => {
        const stringParser = string()
        // First escape \uDE00 is invalid (low surrogate without high surrogate)
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, b`"\\uDE00\\uD83D"`, options),
          {
            code: 'VALIDATION_ERROR',
            messageMatch: /Expected valid Unicode code point, found U\+DE00/,
          }
        )
      })

      it('should reject high surrogate followed by non-low-surrogate', async () => {
        const stringParser = string()
        // High surrogate followed by regular code point
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringParser, b`"\\uD83D\\u0041"`, options),
          {
            code: 'VALIDATION_ERROR',
            messageMatch: /Expected low surrogate/,
          }
        )
      })

      it('should handle mixed escape sequences', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"hello\\n\\tworldA\\"test\\\\"`, options)).toBe(
          'hello\n\tworldA"test\\'
        )
      })

      it('should handle strings at SIMD boundaries (15 bytes)', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"123456789012345"`, options)).toBe(
          '123456789012345'
        )
      })

      it('should handle strings at SIMD boundaries (16 bytes)', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"1234567890123456"`, options)).toBe(
          '1234567890123456'
        )
      })

      it('should handle strings at SIMD boundaries (17 bytes)', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"12345678901234567"`, options)).toBe(
          '12345678901234567'
        )
      })

      it('should handle strings at SIMD boundaries (32 bytes)', async () => {
        const stringParser = string()
        expect(
          await parseWithMode(stringParser, b`"12345678901234567890123456789012"`, options)
        ).toBe('12345678901234567890123456789012')
      })

      it('should handle escapes at SIMD chunk boundaries (position 15)', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"12345678901234\\n6"`, options)).toBe(
          '12345678901234\n6'
        )
      })

      it('should handle escapes at SIMD chunk boundaries (position 16)', async () => {
        const stringParser = string()
        expect(await parseWithMode(stringParser, b`"123456789012345\\n7"`, options)).toBe(
          '123456789012345\n7'
        )
      })
    })

    describe('Constraints', () => {
      describe('min(n)', () => {
        it('should accept string with length equal to min', async () => {
          const parser = string().min(5)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        })

        it('should accept string with length above min', async () => {
          const parser = string().min(3)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        })

        it('should reject string shorter than min', async () => {
          const parser = string().min(5)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hi"`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'string with at least 5 characters', found: '2 characters' },
          })
        })

        it('should reject empty string when min > 0', async () => {
          const parser = string().min(1)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`""`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'string with at least 1 characters', found: '0 characters' },
          })
        })

        it('should accept empty string when min is 0', async () => {
          const parser = string().min(0)
          expect(await parseWithMode(parser, b`""`, options)).toBe('')
        })

        it('should count Unicode characters, not bytes', async () => {
          // "日本語" = 3 chars, 9 bytes
          const parser = string().min(3)
          expect(await parseWithMode(parser, b`"日本語"`, options)).toBe('日本語')
        })
      })

      describe('max(n)', () => {
        it('should accept string with length equal to max', async () => {
          const parser = string().max(5)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        })

        it('should accept string shorter than max', async () => {
          const parser = string().max(10)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        })

        it('should reject string longer than max', async () => {
          const parser = string().max(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello"`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'string with at most 3 characters', found: '5 characters' },
          })
        })

        it('should accept empty string when max >= 0', async () => {
          const parser = string().max(0)
          expect(await parseWithMode(parser, b`""`, options)).toBe('')
        })

        it('should reject non-empty string when max is 0', async () => {
          const parser = string().max(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"a"`, options), {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 1 },
            details: { expected: 'string with at most 0 characters', found: '1 characters' },
          })
        })

        it('should count Unicode characters for emoji', async () => {
          // "😀" = 1 char, 4 bytes
          const parser = string().max(1)
          expect(await parseWithMode(parser, b`"😀"`, options)).toBe('😀')
        })
      })

      describe('min + max combined', () => {
        it('should accept string within range', async () => {
          const parser = string().min(2).max(10)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        })

        it('should reject string below range', async () => {
          const parser = string().min(3).max(10)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hi"`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'string with at least 3 characters', found: '2 characters' },
          })
        })

        it('should reject string above range', async () => {
          const parser = string().min(1).max(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello"`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'string with at most 3 characters', found: '5 characters' },
          })
        })

        it('should support exact length via min(n).max(n)', async () => {
          const parser = string().min(5).max(5)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hi"`, options), {
            code: 'VALIDATION_ERROR',
          })
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"toolong"`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })

      describe('pattern(regex)', () => {
        describe('basic matching', () => {
          it('should accept string matching simple pattern', async () => {
            const parser = string().pattern(/hello/)
            expect(await parseWithMode(parser, b`"hello world"`, options)).toBe('hello world')
          })

          it('should reject string not matching pattern', async () => {
            const parser = string().pattern(/hello/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"goodbye"`, options), {
              code: 'VALIDATION_ERROR',
              details: {
                expected: 'string matching pattern /hello/',
                found: '"goodbye"',
              },
            })
          })

          it('should accept fully anchored pattern', async () => {
            const parser = string().pattern(/^hello$/)
            expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
          })

          it('should reject partial match against anchored pattern', async () => {
            const parser = string().pattern(/^hello$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello world"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should accept digit-only pattern', async () => {
            const parser = string().pattern(/^\d+$/)
            expect(await parseWithMode(parser, b`"12345"`, options)).toBe('12345')
          })

          it('should reject non-digits against digit-only pattern', async () => {
            const parser = string().pattern(/^\d+$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"123abc"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })
        })

        describe('anchoring behavior', () => {
          it('should match anywhere in string (unanchored)', async () => {
            const parser = string().pattern(/foo/)
            expect(await parseWithMode(parser, b`"bazfoobar"`, options)).toBe('bazfoobar')
          })

          it('should require full match only with both anchors', async () => {
            const parser = string().pattern(/^foo$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"foobar"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should support start anchor only', async () => {
            const parser = string().pattern(/^foo/)
            expect(await parseWithMode(parser, b`"foobar"`, options)).toBe('foobar')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"barfoo"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should support end anchor only', async () => {
            const parser = string().pattern(/bar$/)
            expect(await parseWithMode(parser, b`"foobar"`, options)).toBe('foobar')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"barfoo"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })
        })

        describe('common real-world patterns', () => {
          it('should validate hex color pattern', async () => {
            const parser = string().pattern(/^#[0-9a-fA-F]{6}$/)
            expect(await parseWithMode(parser, b`"#ff00aa"`, options)).toBe('#ff00aa')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"ff00aa"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should validate slug pattern', async () => {
            const parser = string().pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            expect(await parseWithMode(parser, b`"hello-world"`, options)).toBe('hello-world')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"Hello-World"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should validate ISO date pattern', async () => {
            const parser = string().pattern(/^\d{4}-\d{2}-\d{2}$/)
            expect(await parseWithMode(parser, b`"2024-01-15"`, options)).toBe('2024-01-15')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"24-1-5"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should validate UUID-like pattern', async () => {
            const parser = string().pattern(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
            )
            expect(
              await parseWithMode(parser, b`"550e8400-e29b-41d4-a716-446655440000"`, options)
            ).toBe('550e8400-e29b-41d4-a716-446655440000')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"not-a-uuid"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should validate semver pattern', async () => {
            const parser = string().pattern(/^\d+\.\d+\.\d+$/)
            expect(await parseWithMode(parser, b`"1.2.3"`, options)).toBe('1.2.3')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"1.2"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })
        })

        describe('empty string edge cases', () => {
          it('should accept empty string when pattern allows it', async () => {
            const parser = string().pattern(/^$/)
            expect(await parseWithMode(parser, b`""`, options)).toBe('')
          })

          it('should accept empty string with .* pattern', async () => {
            const parser = string().pattern(/^.*$/)
            expect(await parseWithMode(parser, b`""`, options)).toBe('')
          })

          it('should reject empty string when pattern requires content', async () => {
            const parser = string().pattern(/^.+$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`""`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should accept empty string with star quantifier', async () => {
            const parser = string().pattern(/^[a-z]*$/)
            expect(await parseWithMode(parser, b`""`, options)).toBe('')
          })
        })

        describe('Unicode support', () => {
          it('should match literal Unicode characters', async () => {
            const parser = string().pattern(/^こんにちは$/)
            expect(await parseWithMode(parser, b`"こんにちは"`, options)).toBe('こんにちは')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should match emoji', async () => {
            const parser = string().pattern(/^😀+$/)
            expect(await parseWithMode(parser, b`"😀😀"`, options)).toBe('😀😀')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should work with Unicode letter class', async () => {
            const parser = string().pattern('^\\p{L}+$')
            expect(await parseWithMode(parser, b`"Привет"`, options)).toBe('Привет')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"123"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should count Unicode chars with dot', async () => {
            const parser = string().pattern(/^.{3}$/)
            expect(await parseWithMode(parser, b`"日本語"`, options)).toBe('日本語')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"ab"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })
        })

        describe('JSON escape sequences', () => {
          it('should match against unescaped string value', async () => {
            const parser = string().pattern(/\t/)
            expect(await parseWithMode(parser, b`"\\t"`, options)).toBe('\t')
          })

          it('should match newline from JSON escape', async () => {
            const parser = string().pattern(/\n/)
            expect(await parseWithMode(parser, b`"line1\\nline2"`, options)).toBe('line1\nline2')
          })

          it('should match Unicode escape sequence after unescaping', async () => {
            const parser = string().pattern(/^Hello$/)
            expect(
              await parseWithMode(parser, b`"\\u0048\\u0065\\u006C\\u006C\\u006F"`, options)
            ).toBe('Hello')
          })
        })

        describe('regex features', () => {
          it('should support character classes', async () => {
            const parser = string().pattern(/^[a-zA-Z0-9]+$/)
            expect(await parseWithMode(parser, b`"Hello123"`, options)).toBe('Hello123')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"Hello 123"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should support negated character classes', async () => {
            const parser = string().pattern(/^[^0-9]+$/)
            expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello123"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should support quantifiers', async () => {
            const parser = string().pattern(/^a{3,5}$/)
            expect(await parseWithMode(parser, b`"aaa"`, options)).toBe('aaa')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"aa"`, options), {
              code: 'VALIDATION_ERROR',
            })
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"aaaaaa"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should support alternation', async () => {
            const parser = string().pattern(/^(cat|dog|bird)$/)
            expect(await parseWithMode(parser, b`"cat"`, options)).toBe('cat')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"fish"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should support case-insensitive inline flag', async () => {
            const parser = string().pattern('(?i)^hello$')
            expect(await parseWithMode(parser, b`"Hello"`, options)).toBe('Hello')
            expect(await parseWithMode(parser, b`"HELLO"`, options)).toBe('HELLO')
          })

          it('should support dot-matches-newline with inline flag', async () => {
            const parser = string().pattern('(?s)^a.b$')
            expect(await parseWithMode(parser, b`"a\\nb"`, options)).toBe('a\nb')
          })
        })

        describe('unsupported regex features', () => {
          it('should error on pattern with lookahead', async () => {
            const parser = string().pattern('(?=foo)bar')
            await expect(() => parseWithMode(parser, b`"foobar"`, options)).rejects.toThrow(
              /invalid regex pattern/
            )
          })

          it('should error on pattern with backreference', async () => {
            const parser = string().pattern('(a)\\1')
            await expect(() => parseWithMode(parser, b`"aa"`, options)).rejects.toThrow(
              /invalid regex pattern/
            )
          })
        })

        describe('composition with min/max', () => {
          it('should accept when both pattern and length pass', async () => {
            const parser = string()
              .min(1)
              .max(10)
              .pattern(/^[a-z]+$/)
            expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
          })

          it('should reject with min error when pattern passes but too short', async () => {
            const parser = string()
              .min(5)
              .pattern(/^[a-z]*$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hi"`, options), {
              code: 'VALIDATION_ERROR',
              details: { expected: 'string with at least 5 characters', found: '2 characters' },
            })
          })

          it('should reject with max error when pattern passes but too long', async () => {
            const parser = string()
              .max(3)
              .pattern(/^[a-z]+$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"hello"`, options), {
              code: 'VALIDATION_ERROR',
              details: { expected: 'string with at most 3 characters', found: '5 characters' },
            })
          })

          it('should reject with pattern error when length passes', async () => {
            const parser = string()
              .min(1)
              .max(10)
              .pattern(/^[a-z]+$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"Hello123"`, options), {
              code: 'VALIDATION_ERROR',
              details: {
                expected: 'string matching pattern /^[a-z]+$/',
                found: '"Hello123"',
              },
            })
          })

          it('should work regardless of chaining order', async () => {
            const parser = string()
              .pattern(/^[a-z]+$/)
              .min(2)
              .max(5)
            expect(await parseWithMode(parser, b`"abc"`, options)).toBe('abc')
          })
        })

        describe('immutability', () => {
          it('should not affect original parser when chaining pattern', async () => {
            const original = string()
            const constrained = original.pattern(/^[a-z]+$/)
            expect(await parseWithMode(original, b`"Hello123"`, options)).toBe('Hello123')
            await expectAtcharaErrorAsync(
              () => parseWithMode(constrained, b`"Hello123"`, options),
              { code: 'VALIDATION_ERROR' }
            )
          })

          it('should not affect pattern parser when adding min', async () => {
            const withPattern = string().pattern(/^[a-z]+$/)
            const withPatternAndMin = withPattern.min(5)
            expect(await parseWithMode(withPattern, b`"hi"`, options)).toBe('hi')
            await expectAtcharaErrorAsync(
              () => parseWithMode(withPatternAndMin, b`"hi"`, options),
              { code: 'VALIDATION_ERROR' }
            )
          })

          it('should allow different patterns on clones', async () => {
            const base = string()
            const hex = base.pattern(/^[0-9a-f]+$/)
            const alpha = base.pattern(/^[a-zA-Z]+$/)
            expect(await parseWithMode(hex, b`"deadbeef"`, options)).toBe('deadbeef')
            expect(await parseWithMode(alpha, b`"hello"`, options)).toBe('hello')
            expect(await parseWithMode(base, b`"anything 123!"`, options)).toBe('anything 123!')
          })
        })

        describe('in nested schemas', () => {
          it('should work inside object fields', async () => {
            const parser = object({ slug: string().pattern(/^[a-z-]+$/) })
            expect(await parseWithMode(parser, b`{"slug": "hello-world"}`, options)).toEqual({
              slug: 'hello-world',
            })
          })

          it('should work inside nullable', async () => {
            const parser = nullable(string().pattern(/^[a-z]+$/))
            expect(await parseWithMode(parser, b`null`, options)).toBe(null)
            expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"123"`, options), {
              code: 'VALIDATION_ERROR',
            })
          })

          it('should work inside union variants', async () => {
            const parser = union([string().pattern(/^\d+$/), number()])
            expect(await parseWithMode(parser, b`42`, options)).toBe(42)
            expect(await parseWithMode(parser, b`"123"`, options)).toBe('123')
          })

          it('should work as array element schema', async () => {
            const parser = array(string().pattern(/^[a-z]+$/))
            expect(await parseWithMode(parser, b`["hello", "world"]`, options)).toEqual([
              'hello',
              'world',
            ])
          })
        })

        describe('error messages', () => {
          it('should include pattern source in expected', async () => {
            const parser = string().pattern(/^[a-z]+$/)
            const error = await expectAtcharaErrorAsync(
              () => parseWithMode(parser, b`"Hello"`, options),
              {
                code: 'VALIDATION_ERROR',
                details: { expected: 'string matching pattern /^[a-z]+$/' },
              }
            )
            expect(error.details.expected).toBe('string matching pattern /^[a-z]+$/')
          })

          it('should include actual value in found', async () => {
            const parser = string().pattern(/^[a-z]+$/)
            const error = await expectAtcharaErrorAsync(
              () => parseWithMode(parser, b`"Hello"`, options),
              {
                code: 'VALIDATION_ERROR',
                details: { found: '"Hello"' },
              }
            )
            expect(error.details.found).toBe('"Hello"')
          })

          it('should report position at string start', async () => {
            const parser = string().pattern(/^[a-z]+$/)
            await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"Hello"`, options), {
              code: 'VALIDATION_ERROR',
              position: { line: 1, column: 1 },
            })
          })
        })

        describe('API input forms', () => {
          it('should accept RegExp object', async () => {
            const parser = string().pattern(/^[a-z]+$/)
            expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
          })

          it('should accept string pattern', async () => {
            const parser = string().pattern('^[a-z]+$')
            expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
          })

          it('should support inline flags via string pattern', async () => {
            const parser = string().pattern('(?i)^hello$')
            expect(await parseWithMode(parser, b`"HELLO"`, options)).toBe('HELLO')
          })
        })

        describe('invalid regex', () => {
          it('should error on invalid regex pattern', async () => {
            const parser = string().pattern('[invalid')
            await expect(() => parseWithMode(parser, b`"test"`, options)).rejects.toThrow(
              /invalid regex pattern/
            )
          })

          it('should error on unbalanced parentheses', async () => {
            const parser = string().pattern('(unclosed')
            await expect(() => parseWithMode(parser, b`"test"`, options)).rejects.toThrow(
              /invalid regex pattern/
            )
          })

          it('should accept empty pattern (matches everything)', async () => {
            const parser = string().pattern('')
            expect(await parseWithMode(parser, b`"anything"`, options)).toBe('anything')
          })
        })
      })

      describe('immutability', () => {
        it('should not affect original parser when chaining', async () => {
          const original = string()
          const constrained = original.min(5)
          // Original should still accept short strings
          expect(await parseWithMode(original, b`"hi"`, options)).toBe('hi')
          // Constrained should reject them
          await expectAtcharaErrorAsync(() => parseWithMode(constrained, b`"hi"`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })

      describe('in nested schemas', () => {
        it('should work inside object fields', async () => {
          const parser = object({ name: string().min(1).max(50) })
          expect(await parseWithMode(parser, b`{"name": "Alice"}`, options)).toEqual({
            name: 'Alice',
          })
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{"name": ""}`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should work inside nullable (null passes, constrained value checked)', async () => {
          const parser = nullable(string().min(1))
          expect(await parseWithMode(parser, b`null`, options)).toBe(null)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`""`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should work inside union variants', async () => {
          const parser = union([string().min(1), number()])
          expect(await parseWithMode(parser, b`42`, options)).toBe(42)
          expect(await parseWithMode(parser, b`"hello"`, options)).toBe('hello')
        })
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer string type', () => {
      const _parser = string()
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<string>()
    })

    it('should preserve type through constraints', () => {
      const _parser = string().min(1).max(10)
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<string>()
    })

    it('should preserve string type through pattern', () => {
      const _parser = string().pattern(/^[a-z]+$/)
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<string>()
    })

    it('should preserve type through chained pattern + min + max', () => {
      const _parser = string()
        .pattern(/^[a-z]+$/)
        .min(1)
        .max(10)
      type Output = (typeof _parser)['schema']['_output']
      expectTypeOf<Output>().toEqualTypeOf<string>()
    })
  })

  // Performance - sync only
  describe('Performance', () => {
    it('should handle very long strings', () => {
      const stringParser = string()
      const longString = 'a'.repeat(10000)
      expect(stringParser.parse(b`"${longString}"`).toValue()).toBe(longString)
    })
  })
})
