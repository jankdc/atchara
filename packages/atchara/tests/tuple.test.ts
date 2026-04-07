import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import { toBytes as b } from '@atchara/core'
import { initialize, tuple, string, number, boolean, array, object, nullable } from '../src/index'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Tuple Schema', () => {
  beforeAll(async () => {
    await initialize()
  })

  // Parsing tests run against all backends
  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Basic Tuple Parsing', () => {
      it('should parse empty tuples', async () => {
        const parser = tuple([])
        expect(await parseWithMode(parser, b`[]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[ ]`, options)).toEqual([])
        expect(await parseWithMode(parser, b`[\n]`, options)).toEqual([])
      })

      it('should parse single element tuples', async () => {
        const parser = tuple([number()])
        expect(await parseWithMode(parser, b`[42]`, options)).toEqual([42])
        expect(await parseWithMode(parser, b`[ 42 ]`, options)).toEqual([42])
      })

      it('should parse heterogeneous tuples', async () => {
        const parser = tuple([string(), number(), boolean()])
        expect(await parseWithMode(parser, b`["hello",42,true]`, options)).toEqual([
          'hello',
          42,
          true,
        ])
        expect(await parseWithMode(parser, b`[ "hello" , 42 , true ]`, options)).toEqual([
          'hello',
          42,
          true,
        ])
      })

      it('should parse tuples with different primitive combinations', async () => {
        const parser1 = tuple([number(), string()])
        expect(await parseWithMode(parser1, b`[123,"abc"]`, options)).toEqual([123, 'abc'])

        const parser2 = tuple([boolean(), boolean()])
        expect(await parseWithMode(parser2, b`[true,false]`, options)).toEqual([true, false])

        const parser3 = tuple([string(), string(), string()])
        expect(await parseWithMode(parser3, b`["a","b","c"]`, options)).toEqual(['a', 'b', 'c'])
      })
    })

    describe('Nested Tuples', () => {
      it('should parse nested tuples', async () => {
        const parser = tuple([tuple([number(), number()]), string()])
        expect(await parseWithMode(parser, b`[[1,2],"label"]`, options)).toEqual([[1, 2], 'label'])
      })

      it('should parse deeply nested tuples', async () => {
        const parser = tuple([tuple([tuple([number()])])])
        expect(await parseWithMode(parser, b`[[[42]]]`, options)).toEqual([[[42]]])
      })

      it('should parse tuples containing objects', async () => {
        const parser = tuple([object({ x: number(), y: number() }), string()])
        expect(await parseWithMode(parser, b`[{"x":10,"y":20},"point"]`, options)).toEqual([
          { x: 10, y: 20 },
          'point',
        ])
      })

      it('should parse tuples containing arrays', async () => {
        const parser = tuple([array(number()), string()])
        expect(await parseWithMode(parser, b`[[1,2,3],"numbers"]`, options)).toEqual([
          [1, 2, 3],
          'numbers',
        ])
      })
    })

    describe('Tuple in Other Structures', () => {
      it('should parse arrays of tuples', async () => {
        const parser = array(tuple([string(), number()]))
        expect(await parseWithMode(parser, b`[["a",1],["b",2],["c",3]]`, options)).toEqual([
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ])
      })

      it('should parse objects with tuple fields', async () => {
        const parser = object({
          coords: tuple([number(), number()]),
          label: string(),
        })
        expect(
          await parseWithMode(parser, b`{"coords":[10,20],"label":"origin"}`, options)
        ).toEqual({
          coords: [10, 20],
          label: 'origin',
        })
      })

      it('should parse nullable tuples', async () => {
        const parser = nullable(tuple([number(), number()]))
        expect(await parseWithMode(parser, b`[1,2]`, options)).toEqual([1, 2])
        expect(await parseWithMode(parser, b`null`, options)).toEqual(null)
      })

      it('should parse tuples with nullable elements', async () => {
        const parser = tuple([nullable(string()), number()])
        expect(await parseWithMode(parser, b`["hello",42]`, options)).toEqual(['hello', 42])
        expect(await parseWithMode(parser, b`[null,42]`, options)).toEqual([null, 42])
      })
    })

    describe('Strict Length Validation', () => {
      it('should reject tuples with too few elements', async () => {
        const parser = tuple([number(), number(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2]`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1]`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[]`, options), {})
      })

      it('should reject tuples with too many elements', async () => {
        const parser = tuple([number(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3]`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,3,4]`, options), {})
      })

      it('should reject non-empty input for empty tuple schema', async () => {
        const parser = tuple([])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1]`, options), {})
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`["a"]`, options), {})
      })
    })

    describe('Type Validation', () => {
      it('should reject wrong element types', async () => {
        const parser = tuple([string(), number()])

        // Wrong type for first element
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[123,"abc"]`, options), {
          code: 'UNEXPECTED_CHARACTER',
          details: { character: '1' },
        })

        // Wrong type for second element
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`["hello","world"]`, options), {
          code: 'VALIDATION_ERROR',
          details: { expected: 'digit', found: "'\"'" },
        })
      })

      it('should validate nested tuple types', async () => {
        const parser = tuple([tuple([number()]), string()])

        // Inner tuple has wrong type
        await expectAtcharaErrorAsync(
          () => parseWithMode(parser, b`[["not a number"],"label"]`, options),
          {
            code: 'VALIDATION_ERROR',
            details: { expected: 'digit' },
          }
        )
      })
    })

    describe('Error Handling', () => {
      it('should reject trailing commas', async () => {
        const parser = tuple([number(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2,]`, options), {})
      })

      it('should reject leading commas', async () => {
        const parser = tuple([number(), number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[,1,2]`, options), {})
      })

      it('should reject malformed tuples', async () => {
        const parser = tuple([number(), number()])

        // Missing closing bracket
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1,2`, options), {})

        // Missing opening bracket
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`1,2]`, options), {
          position: { line: 1, column: 1 },
        })

        // Invalid separators
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`[1;2]`, options), {})
      })

      it('should reject non-array input', async () => {
        const parser = tuple([number()])
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`42`, options), {
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`"string"`, options), {
          position: { line: 1, column: 1 },
        })
        await expectAtcharaErrorAsync(() => parseWithMode(parser, b`{}`, options), {
          position: { line: 1, column: 1 },
        })
      })
    })

    describe('Whitespace Handling', () => {
      it('should handle various whitespace', async () => {
        const parser = tuple([number(), string()])

        expect(await parseWithMode(parser, b`[1,"a"]`, options)).toEqual([1, 'a'])
        expect(await parseWithMode(parser, b`[ 1 , "a" ]`, options)).toEqual([1, 'a'])
        expect(await parseWithMode(parser, b`[\n1\n,\n"a"\n]`, options)).toEqual([1, 'a'])
        expect(await parseWithMode(parser, b`[\t1\t,\t"a"\t]`, options)).toEqual([1, 'a'])
        expect(await parseWithMode(parser, b`[\r\n1\r\n,\r\n"a"\r\n]`, options)).toEqual([1, 'a'])
      })
    })

    describe('Real-world Use Cases', () => {
      it('should parse coordinate pairs', async () => {
        const point = tuple([number(), number()])
        expect(await parseWithMode(point, b`[10.5, 20.3]`, options)).toEqual([10.5, 20.3])
      })

      it('should parse key-value pairs', async () => {
        const kvPair = tuple([string(), string()])
        expect(await parseWithMode(kvPair, b`["name","John"]`, options)).toEqual(['name', 'John'])
      })

      it('should parse range bounds', async () => {
        const range = tuple([number(), number()])
        expect(await parseWithMode(range, b`[0, 100]`, options)).toEqual([0, 100])
      })

      it('should parse RGB color values', async () => {
        const rgb = tuple([number(), number(), number()])
        expect(await parseWithMode(rgb, b`[255, 128, 0]`, options)).toEqual([255, 128, 0])
      })

      it('should parse labeled data points', async () => {
        const dataPoint = tuple([string(), number(), boolean()])
        expect(await parseWithMode(dataPoint, b`["temperature", 23.5, true]`, options)).toEqual([
          'temperature',
          23.5,
          true,
        ])
      })

      it('should parse CSV-like row data', async () => {
        const row = tuple([string(), number(), number(), string()])
        const input = '["product-123", 42, 19.99, "in-stock"]'
        expect(await parseWithMode(row, b`${input}`, options)).toEqual([
          'product-123',
          42,
          19.99,
          'in-stock',
        ])
      })
    })
  })

  // Type inference - compile-time only
  describe('Type Inference', () => {
    it('should infer simple tuple types', () => {
      const _parser = tuple([string(), number()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[string, number]>()
    })

    it('should infer complex tuple types', () => {
      const _parser = tuple([string(), number(), boolean()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[string, number, boolean]>()
    })

    it('should infer nested tuple types', () => {
      const _parser = tuple([tuple([number(), number()]), string()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[[number, number], string]>()
    })

    it('should infer empty tuple type', () => {
      const _parser = tuple([])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[]>()
    })

    it('should infer tuples with objects', () => {
      const _parser = tuple([object({ id: number() }), string()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[{ id: number }, string]>()
    })

    it('should infer tuples with arrays', () => {
      const _parser = tuple([array(number()), boolean()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[number[], boolean]>()
    })

    it('should infer tuples with nullable elements', () => {
      const _parser = tuple([nullable(string()), number()])
      type Result = (typeof _parser)['schema']['_output']
      expectTypeOf<Result>().toEqualTypeOf<[string | null, number]>()
    })
  })

  // Deferred Access - sync only
  describe('Deferred Access', () => {
    it('should return tuple length via length getter', () => {
      const emptyParser = tuple([])
      expect(emptyParser.parse(b`[]`).length).toBe(0)

      const singleParser = tuple([number()])
      expect(singleParser.parse(b`[1]`).length).toBe(1)

      const tripleParser = tuple([string(), number(), boolean()])
      expect(tripleParser.parse(b`["a",1,true]`).length).toBe(3)
    })

    it('should return undefined for out-of-bounds indices', () => {
      const parser = tuple([number(), number()])
      const result = parser.parse(b`[1,2]`)

      expect(result.at(-1)).toBeUndefined()
      expect(result.at(2)).toBeUndefined()
      expect(result.at(100)).toBeUndefined()
    })

    it('should access elements via at() without materializing the full tuple', () => {
      const parser = tuple([string(), number(), boolean()])
      const result = parser.parse(b`["hello",42,true]`)

      expect(result.at(0)?.toValue()).toBe('hello')
      expect(result.at(1)?.toValue()).toBe(42)
      expect(result.at(2)?.toValue()).toBe(true)
    })

    it('should iterate over elements with Symbol.iterator', () => {
      const parser = tuple([string(), number(), boolean()])
      const result = parser.parse(b`["test",123,false]`)
      const values: unknown[] = []

      for (const deferred of result) {
        values.push(deferred.toValue())
      }

      expect(values).toEqual(['test', 123, false])
    })

    it('should support spread operator via iteration', () => {
      const parser = tuple([number(), number(), number()])
      const result = parser.parse(b`[10,20,30]`)

      const values = [...result].map((d) => d.toValue())
      expect(values).toEqual([10, 20, 30])
    })

    it('should access nested tuples via at()', () => {
      const parser = tuple([tuple([number(), number()]), string()])
      const result = parser.parse(b`[[1,2],"label"]`)

      const innerTuple = result.at(0)
      expect(innerTuple?.at(0)?.toValue()).toBe(1)
      expect(innerTuple?.at(1)?.toValue()).toBe(2)
      expect(result.at(1)?.toValue()).toBe('label')
    })

    it('should access objects within tuples via at()', () => {
      const parser = tuple([object({ x: number(), y: number() }), string()])
      const result = parser.parse(b`[{"x":10,"y":20},"point"]`)

      const point = result.at(0)
      expect(point?.get('x').toValue()).toBe(10)
      expect(point?.get('y').toValue()).toBe(20)
    })

    it('should access arrays within tuples via at()', () => {
      const parser = tuple([array(number()), string()])
      const result = parser.parse(b`[[1,2,3],"numbers"]`)

      const arr = result.at(0)
      expect(arr?.length).toBe(3)
      expect(arr?.at(1)?.toValue()).toBe(2)
    })
  })
})
