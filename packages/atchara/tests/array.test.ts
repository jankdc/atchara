import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import {
  initialize,
  array,
  number,
  string,
  object,
  boolean,
  nullable,
  isAtcharaError,
} from '../src/index'
import { toBytes as b } from '@atcharajs/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  CHUNK_SIZES,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Array Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Array Parsing', () => {
      it('should parse empty arrays', async () => {
        const parser = array(number())
        expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[ ]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[\n]`, options)).toEqual([])
      })

      it('should parse simple arrays', async () => {
        const parser = array(number())
        expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[ 1 , 2 , 3 ]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\n1,\n2,\n3\n]`, options)).toEqual([1, 2, 3])
      })

      it('should parse arrays with different value types', async () => {
        const stringArray = array(string())
        expect(await parseWithMode(stringArray, b`["hello","world"]`, options)).toEqual([
          'hello',
          'world',
        ])

        const booleanArray = array(boolean())
        expect(await parseWithMode(booleanArray, b`[true,false,true]`, options)).toEqual([
          true,
          false,
          true,
        ])
      })
    })

    describe('Nested Arrays', () => {
      it('should parse nested arrays', async () => {
        const parser = array(array(number()))
        expect(await parseWithMode(parser, b`[[1,2],[3,4]]`, options)).toEqual([
          [1, 2],
          [3, 4],
        ])
      })

      it('should parse arrays of objects', async () => {
        const parser = array(
          object({
            id: number(),
            name: string(),
          })
        )

        expect(
          await parseWithMode(parser, b`[{"id":1,"name":"John"},{"id":2,"name":"Jane"}]`, options)
        ).toEqual([
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' },
        ])
      })

      it('should handle deeply nested arrays', async () => {
        const parser = array(array(array(number())))
        expect(await parseWithMode(parser, b`[[[1,2],[3,4]],[[5,6],[7,8]]]`, options)).toEqual([
          [
            [1, 2],
            [3, 4],
          ],
          [
            [5, 6],
            [7, 8],
          ],
        ])
      })
    })

    describe('Error Handling', () => {
      it('should reject trailing commas', async () => {
        const parser = array(number())
        // Trailing comma after elements - expects another element but finds ]
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3,]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 8 },
          details: { expected: 'digit', found: "']'" },
        })
        // Leading comma - expects element but finds comma
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[,]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 2 },
          details: { expected: 'digit', found: "','" },
        })
      })

      it('should validate element types', async () => {
        const numberArray = array(number())
        // String found where number expected
        await expectAtcharaErrorAsync(
          () => parseWithMode(numberArray, b`[1,"invalid",3]`, options),
          {
            code: 'VALIDATION_ERROR',
            position: { line: 1, column: 4 },
            details: { expected: 'digit', found: "'\"'" },
          }
        )

        const stringArray = array(string())
        // Number found where string expected
        await expectAtcharaErrorAsync(
          () => parseWithMode(stringArray, b`["valid",123,"also valid"]`, options),
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line: 1, column: 10 },
            details: { character: '1' },
          }
        )
      })

      it('should handle malformed arrays', async () => {
        const parser = array(number())

        // Missing closing bracket - unexpected EOF
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3`, options), {
          code: 'UNEXPECTED_EOF',
        })

        // Missing opening bracket - expects [ but finds number
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1,2,3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '1' },
        })

        // Invalid separators - semicolon is unexpected character
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1;2;3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 3 },
          details: { character: ';' },
        })

        // Missing comma separators - expects comma or ] but finds next element
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1 2 3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 4 },
          details: { character: '2' },
        })
      })
    })

    describe('RFC 8259 Compliance', () => {
      it('should reject trailing commas', async () => {
        const parser = array(number())

        // Valid: no trailing comma
        expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])

        // Invalid: trailing comma after multiple elements
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3,]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 8 },
          details: { expected: 'digit', found: "']'" },
        })
        // Invalid: trailing comma after single element
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 4 },
          details: { expected: 'digit', found: "']'" },
        })
        // Invalid: only comma
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[,]`, options), {
          code: 'VALIDATION_ERROR',
          position: { line: 1, column: 2 },
          details: { expected: 'digit', found: "','" },
        })
      })

      it('should handle empty arrays', async () => {
        const parser = array(number())

        // Valid empty arrays
        expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[ ]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[\n]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[\t]`, options)).toEqual([])
      })

      it('should require proper array structure', async () => {
        const parser = array(number())

        // Must start with [ - expects [ but finds number
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1,2,3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 1 },
          details: { character: '1' },
        })

        // Must end with ] - unexpected EOF
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3`, options), {
          code: 'UNEXPECTED_EOF',
        })

        // Must have comma separators - expects comma or ] but finds next element
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1 2 3]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          position: { line: 1, column: 4 },
          details: { character: '2' },
        })
      })

      it('should handle all valid JSON whitespace', async () => {
        const parser = array(number())

        // Space, tab, newline, carriage return
        expect(await parseWithMode(parser, b`[ 1 , 2 , 3 ]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\t1\t,\t2\t,\t3\t]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\n1\n,\n2\n,\n3\n]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\r1\r,\r2\r,\r3\r]`, options)).toEqual([1, 2, 3])
      })
    })

    describe('Edge Cases', () => {
      it('should handle single element arrays', async () => {
        const parser = array(number())
        expect(await parseWithMode(parser, b`[42]`, options)).toEqual([42])

        const stringParser = array(string())
        expect(await parseWithMode(stringParser, b`["single"]`, options)).toEqual(['single'])
      })

      it('should handle arrays with nullable elements', async () => {
        const parser = array(nullable(string()))
        expect(await parseWithMode(parser, b`["hello",null,"world"]`, options)).toEqual([
          'hello',
          null,
          'world',
        ])
      })

      it('should handle whitespace variations', async () => {
        const parser = array(number())

        expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[ 1 , 2 , 3 ]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\n1,\n2,\n3\n]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\t1,\t2,\t3\t]`, options)).toEqual([1, 2, 3])
        expect(await parseWithMode(parser, b`[\r\n1,\r\n2,\r\n3\r\n]`, options)).toEqual([1, 2, 3])
      })

      it('should handle deeply nested arrays (3+ levels)', async () => {
        const parser = array(array(array(number())))
        expect(await parseWithMode(parser, b`[[[1,2],[3,4]],[[5,6],[7,8]]]`, options)).toEqual([
          [
            [1, 2],
            [3, 4],
          ],
          [
            [5, 6],
            [7, 8],
          ],
        ])
      })

      it('should handle arrays of objects containing arrays', async () => {
        const parser = array(
          object({
            items: array(
              object({
                values: array(number()),
              })
            ),
          })
        )
        const input = '[{"items":[{"values":[1,2]},{"values":[3,4]}]}]'
        expect(await parseWithMode(parser, b`${input}`, options)).toEqual([
          {
            items: [{ values: [1, 2] }, { values: [3, 4] }],
          },
        ])
      })

      it('should handle arrays with nested object arrays', async () => {
        const parser = array(
          object({
            nested: array(object({ value: number() })),
          })
        )

        expect(
          await parseWithMode(parser, b`[{"nested":[{"value":1},{"value":2}]}]`, options)
        ).toEqual([{ nested: [{ value: 1 }, { value: 2 }] }])
      })

      it('should handle arrays with nullable object elements', async () => {
        const parser = array(
          nullable(
            object({
              id: number(),
            })
          )
        )
        expect(await parseWithMode(parser, b`[{"id":1},null,{"id":2},null]`, options)).toEqual([
          { id: 1 },
          null,
          { id: 2 },
          null,
        ])
      })

      it('should handle complex mixed structures', async () => {
        const parser = array(
          object({
            id: number(),
            tags: array(string()),
            metadata: nullable(
              object({
                created: string(),
              })
            ),
          })
        )

        const input = JSON.stringify([
          {
            id: 1,
            tags: ['tag1', 'tag2'],
            metadata: { created: '2023-01-01' },
          },
          {
            id: 2,
            tags: [],
            metadata: null,
          },
        ])

        expect(await parseWithMode(parser, b`${input}`, options)).toEqual([
          {
            id: 1,
            tags: ['tag1', 'tag2'],
            metadata: { created: '2023-01-01' },
          },
          {
            id: 2,
            tags: [],
            metadata: null,
          },
        ])
      })
    })

    describe('Constraints', () => {
      describe('min(n)', () => {
        it('should accept array with length equal to min', async () => {
          const parser = array(number()).min(3)
          expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        })

        it('should accept array with length above min', async () => {
          const parser = array(number()).min(2)
          expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        })

        it('should reject array shorter than min', async () => {
          const parser = array(number()).min(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2]`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'array with at least 3 elements', found: '2 elements' },
          })
        })

        it('should reject empty array when min > 0', async () => {
          const parser = array(number()).min(1)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[]`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'array with at least 1 elements', found: '0 elements' },
          })
        })

        it('should accept empty array when min is 0', async () => {
          const parser = array(number()).min(0)
          expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
        })
      })

      describe('max(n)', () => {
        it('should accept array with length equal to max', async () => {
          const parser = array(number()).max(3)
          expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        })

        it('should accept array shorter than max', async () => {
          const parser = array(number()).max(5)
          expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        })

        it('should reject array longer than max', async () => {
          const parser = array(number()).max(2)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3]`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'array with at most 2 elements', found: '3 elements' },
          })
        })

        it('should accept empty array when max >= 0', async () => {
          const parser = array(number()).max(0)
          expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
        })

        it('should reject non-empty when max is 0', async () => {
          const parser = array(number()).max(0)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1]`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'array with at most 0 elements', found: '1 elements' },
          })
        })
      })

      describe('min + max combined', () => {
        it('should accept array within range', async () => {
          const parser = array(number()).min(2).max(4)
          expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
        })

        it('should reject below range', async () => {
          const parser = array(number()).min(3).max(5)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2]`, options), {
            code: 'VALIDATION_ERROR',
          })
        })

        it('should reject above range', async () => {
          const parser = array(number()).min(1).max(2)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3]`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })

      describe('early rejection on max', () => {
        it('should report error position near the element that exceeds max', async () => {
          const parser = array(number()).max(2)
          // Third element at position after [1,2, which is column 6
          const error = await expectAtcharaErrorAsync(
            () => parseWithMode(parser, b`[1,2,3]`, options),
            { code: 'VALIDATION_ERROR' }
          )
          expect(error.details.found).toBe('3 elements')
        })
      })

      describe('with element constraints', () => {
        it('should combine array constraints with element constraints', async () => {
          const parser = array(number().min(0)).min(1).max(5)
          expect(await parseWithMode(parser, b`[1,2,3]`, options)).toEqual([1, 2, 3])
          // Element constraint violation
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[-1,2,3]`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'number >= 0' },
          })
        })

        it('should report element constraint error before array count check', async () => {
          // Array min is 3, but the second element violates element constraint
          const parser = array(string().min(1)).min(3)
          await expectAtcharaErrorAsync(() => parseWithMode(parser, b`["a","",  "c"]`, options), {
            code: 'VALIDATION_ERROR',
            details: { expected: 'string with at least 1 characters' },
          })
        })
      })

      describe('immutability', () => {
        it('should not affect original parser when chaining', async () => {
          const original = array(number())
          const constrained = original.min(2)
          expect(await parseWithMode(original, b`[1]`, options)).toEqual([1])
          await expectAtcharaErrorAsync(() => parseWithMode(constrained, b`[1]`, options), {
            code: 'VALIDATION_ERROR',
          })
        })
      })
    })
  })

  // Type inference tests - compile-time only, no matrix needed
  describe('Type Inference', () => {
    it('should infer array types', () => {
      const _numbersParser = array(number())
      type Numbers = (typeof _numbersParser)['schema']['_output']
      expectTypeOf<Numbers>().toEqualTypeOf<number[]>()

      const _usersParser = array(
        object({
          id: number(),
          name: string(),
        })
      )
      type Users = (typeof _usersParser)['schema']['_output']
      expectTypeOf<Users>().toEqualTypeOf<
        Array<{
          id: number
          name: string
        }>
      >()
    })

    it('should infer nested array types', () => {
      const _nestedParser = array(array(string()))
      type Nested = (typeof _nestedParser)['schema']['_output']
      expectTypeOf<Nested>().toEqualTypeOf<string[][]>()
    })
  })

  // Performance tests - sync only to avoid streaming overhead skewing results
  describe('Performance', () => {
    it('should handle large arrays efficiently', () => {
      const parser = array(number())
      const largeArray = Array.from({ length: 1000 }, (_, i) => i)
      const input = JSON.stringify(largeArray)

      const start = performance.now()
      const result = parser.parse(b`${input}`)
      const duration = performance.now() - start

      expect(result.toValue()).toEqual(largeArray)
      expect(duration).toBeLessThan(200) // Should parse in less than 200ms
    })

    it('should handle arrays of objects efficiently', () => {
      const parser = array(
        object({
          id: number(),
          name: string(),
          isActive: boolean(),
        })
      )

      const largeObjectArray = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        isActive: i % 2 === 0,
      }))

      const input = JSON.stringify(largeObjectArray)
      const start = performance.now()
      const result = parser.parse(b`${input}`)
      const duration = performance.now() - start

      expect(result.toValue()).toEqual(largeObjectArray)
      expect(duration).toBeLessThan(200)
    })
  })

  // parseEach tests - streaming array iteration yielding elements during parsing
  describe('parseEach', () => {
    function createChunkedStream(data: Uint8Array, chunkSize: number): Readable {
      let offset = 0
      return new Readable({
        read() {
          if (offset >= data.length) {
            this.push(null)
            return
          }
          const end = Math.min(offset + chunkSize, data.length)
          this.push(Buffer.from(data.slice(offset, end)))
          offset = end
        },
      })
    }

    describe.each(CHUNK_SIZES.map((s) => [s === Infinity ? 'single chunk' : `${s}B chunks`, s]))(
      '%s',
      (_label, chunkSize) => {
        it('should iterate and collect all elements', async () => {
          const parser = array(number())
          const values: number[] = []
          for await (const item of parser.parseEach(createChunkedStream(b`[1,2,3]`, chunkSize))) {
            values.push(item.toValue())
          }
          expect(values).toEqual([1, 2, 3])
        })

        it('should handle empty arrays', async () => {
          const parser = array(number())
          const values: number[] = []
          for await (const item of parser.parseEach(createChunkedStream(b`[]`, chunkSize))) {
            values.push(item.toValue())
          }
          expect(values).toEqual([])
        })

        it('should support deferred field access on yielded object elements', async () => {
          const parser = array(object({ id: number(), name: string() }))
          const names: string[] = []
          for await (const item of parser.parseEach(
            createChunkedStream(b`[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]`, chunkSize)
          )) {
            names.push(item.get('name').toValue())
          }
          expect(names).toEqual(['Alice', 'Bob'])
        })

        it('should handle nested structures', async () => {
          const parser = array(object({ tags: array(string()) }))
          const values: Array<{ tags: string[] }> = []
          for await (const item of parser.parseEach(
            createChunkedStream(b`[{"tags":["a","b"]},{"tags":["c"]}]`, chunkSize)
          )) {
            values.push(item.toValue())
          }
          expect(values).toEqual([{ tags: ['a', 'b'] }, { tags: ['c'] }])
        })

        it('should yield valid elements before throwing on schema error', async () => {
          const parser = array(number())
          let error: unknown
          const values: number[] = []
          try {
            for await (const item of parser.parseEach(
              createChunkedStream(b`[1,2,"bad",4]`, chunkSize)
            )) {
              values.push(item.toValue())
            }
          } catch (e) {
            error = e
          }
          expect(values).toEqual([1, 2])
          expect(isAtcharaError(error)).toBe(true)
        })

        it('should throw on malformed JSON', async () => {
          const parser = array(number())
          let error: unknown
          try {
            for await (const _item of parser.parseEach(createChunkedStream(b`[1,2,`, chunkSize))) {
              // consume
            }
          } catch (e) {
            error = e
          }
          expect(isAtcharaError(error)).toBe(true)
        })

        it('should enforce max constraint eagerly', async () => {
          const parser = array(number()).max(2)
          let error: unknown
          const values: number[] = []
          try {
            for await (const item of parser.parseEach(createChunkedStream(b`[1,2,3]`, chunkSize))) {
              values.push(item.toValue())
            }
          } catch (e) {
            error = e
          }
          expect(isAtcharaError(error)).toBe(true)
          if (isAtcharaError(error) && error.code === 'VALIDATION_ERROR') {
            expect(error.details.expected).toContain('at most 2')
          }
        })

        it('should support break for early termination', async () => {
          const parser = array(number())
          const json = JSON.stringify(Array.from({ length: 100 }, (_, i) => i))
          const values: number[] = []
          for await (const item of parser.parseEach(
            createChunkedStream(new TextEncoder().encode(json), chunkSize)
          )) {
            values.push(item.toValue())
            if (values.length >= 3) break
          }
          expect(values).toEqual([0, 1, 2])
        })
      }
    )
  })

  // Deferred access tests - sync only, tests the TypeScript deferred API
  describe('Deferred Access', () => {
    it('should return array length via length getter', () => {
      const parser = array(string())

      expect(parser.parse(b`[]`).length).toBe(0)
      expect(parser.parse(b`["a"]`).length).toBe(1)
      expect(parser.parse(b`["a","b","c"]`).length).toBe(3)
    })

    it('should return undefined for out-of-bounds indices', () => {
      const parser = array(number())
      const result = parser.parse(b`[1,2,3]`)

      expect(result.at(-1)).toBeUndefined()
      expect(result.at(3)).toBeUndefined()
      expect(result.at(100)).toBeUndefined()
    })

    it('should access elements via at() without materializing the full array', () => {
      const parser = array(number())
      const result = parser.parse(b`[10,20,30,40,50]`)

      expect(result.at(0)?.toValue()).toBe(10)
      expect(result.at(2)?.toValue()).toBe(30)
      expect(result.at(4)?.toValue()).toBe(50)
    })

    it('should iterate over elements with Symbol.iterator', () => {
      const parser = array(number())
      const result = parser.parse(b`[100,200,300]`)
      const values: number[] = []

      for (const deferred of result) {
        values.push(deferred.toValue())
      }

      expect(values).toEqual([100, 200, 300])
    })

    it('should support spread operator via iteration', () => {
      const parser = array(number())
      const result = parser.parse(b`[1,2,3]`)

      const values = [...result].map((d) => d.toValue())
      expect(values).toEqual([1, 2, 3])
    })

    it('should access nested arrays via at()', () => {
      const parser = array(array(number()))
      const result = parser.parse(b`[[1,2],[3,4],[5,6]]`)

      const innerArray = result.at(1)
      expect(innerArray?.length).toBe(2)
      expect(innerArray?.at(0)?.toValue()).toBe(3)
      expect(innerArray?.at(1)?.toValue()).toBe(4)
    })

    it('should access objects within arrays via at()', () => {
      const parser = array(object({ id: number(), name: string() }))
      const result = parser.parse(b`[{"id":1,"name":"first"},{"id":2,"name":"second"}]`)

      const item = result.at(0)
      expect(item?.get('id').toValue()).toBe(1)
      expect(item?.get('name').toValue()).toBe('first')
    })
  })
})
