import { bench, describe } from 'vitest'

describe('Parser Type Characteristic Performance', async () => {
  const { initialize, string, number, boolean, literal, object, array, nullable, optional } =
    await import('atchara')
  const { toBytes: b } = await import('@atcharajs/core')

  await initialize()

  // Test data for different schema types (as JSON strings)
  const stringData = JSON.stringify('Hello, World! This is a test string with some length to it.')
  const numberData = JSON.stringify(123456.789)
  const booleanData = JSON.stringify(true)
  const literalData = JSON.stringify('exact-literal-value')

  const objectData = JSON.stringify({
    field1: 'value1',
    field2: 42,
    field3: true,
    field4: 'literal',
    field5: null,
  })

  const arrayData = JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

  // Parser definitions
  const stringParser = string()
  const numberParser = number()
  const booleanParser = boolean()
  const literalParser = literal('exact-literal-value')

  const flatObjectParser = object({
    field1: string(),
    field2: number(),
    field3: boolean(),
    field4: literal('literal'),
    field5: nullable(string()),
  })

  const numberArrayParser = array(number())

  describe('Primitive Type Parsing', () => {
    bench('String', () => {
      stringParser.parse(b`${stringData}`)
    })

    bench('Number', () => {
      numberParser.parse(b`${numberData}`)
    })

    bench('Boolean', () => {
      booleanParser.parse(b`${booleanData}`)
    })

    bench('Literal', () => {
      literalParser.parse(b`${literalData}`)
    })
  })

  describe('Complex Type Parsing', () => {
    bench('Flat Object', () => {
      flatObjectParser.parse(b`${objectData}`)
    })

    bench('Homogeneous Array', () => {
      numberArrayParser.parse(b`${arrayData}`)
    })
  })

  describe('Nested vs Flat Structure Performance', () => {
    const flatData = JSON.stringify({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
      i: 9,
      j: 10,
    })

    const nestedData = JSON.stringify({
      level1: {
        level2: {
          level3: {
            level4: {
              value: 42,
            },
          },
        },
      },
    })

    const flatParser = object({
      a: number(),
      b: number(),
      c: number(),
      d: number(),
      e: number(),
      f: number(),
      g: number(),
      h: number(),
      i: number(),
      j: number(),
    })

    const nestedParser = object({
      level1: object({
        level2: object({
          level3: object({
            level4: object({
              value: number(),
            }),
          }),
        }),
      }),
    })

    bench('Flat (10 fields)', () => {
      flatParser.parse(b`${flatData}`)
    })

    bench('Nested (5 levels)', () => {
      nestedParser.parse(b`${nestedData}`)
    })
  })

  describe('Optional vs Required Fields', () => {
    const dataWithOptional = JSON.stringify({
      required1: 'value1',
      required2: 42,
      optional1: 'optional-value',
      // optional2 is missing
    })

    const allRequiredParser = object({
      required1: string(),
      required2: number(),
      optional1: string(),
      optional2: string(),
    })

    const withOptionalParser = object({
      required1: string(),
      required2: number(),
      optional1: optional(string()),
      optional2: optional(string()),
    })

    bench('All Required', () => {
      try {
        allRequiredParser.parse(b`${dataWithOptional}`)
      } catch {
        // Expected to fail, but measure parsing time
      }
    })

    bench('With Optional', () => {
      withOptionalParser.parse(b`${dataWithOptional}`)
    })
  })

  describe('Array Size Impact', () => {
    const smallArray = JSON.stringify(Array.from({ length: 10 }, (_, i) => i))
    const mediumArray = JSON.stringify(Array.from({ length: 100 }, (_, i) => i))
    const largeArray = JSON.stringify(Array.from({ length: 1000 }, (_, i) => i))

    bench('Small (10 items)', () => {
      numberArrayParser.parse(b`${smallArray}`)
    })

    bench('Medium (100 items)', () => {
      numberArrayParser.parse(b`${mediumArray}`)
    })

    bench('Large (1000 items)', () => {
      numberArrayParser.parse(b`${largeArray}`)
    })
  })

  describe('Native Boundary Overhead', () => {
    // Test to measure overhead of crossing TypeScript-native boundary
    const iterations = 100
    const simpleData = JSON.stringify({ value: 42 })
    const simpleParser = object({ value: number() })

    bench('Many Small (100x)', () => {
      for (let i = 0; i < iterations; i++) {
        simpleParser.parse(b`${simpleData}`)
      }
    })

    bench('Single Large', () => {
      const largeData = JSON.stringify({
        items: Array.from({ length: 100 }, (_, i) => ({ value: i })),
      })
      const largeParser = object({
        items: array(object({ value: number() })),
      })
      largeParser.parse(b`${largeData}`)
    })
  })

  describe('Union Type Parsing', async () => {
    const { union } = await import('atchara')

    // Primitive union
    const primitiveUnionData = JSON.stringify('hello')
    const primitiveUnionParser = union([string(), number(), boolean()])

    // Literal union
    const literalUnionData = JSON.stringify('success')
    const literalUnionParser = union([literal('success'), literal('error'), literal('pending')])

    // Discriminated object union
    const discriminatedData = JSON.stringify({ type: 'user', name: 'John', age: 30 })
    const discriminatedParser = union([
      object({ type: literal('user'), name: string(), age: number() }),
      object({ type: literal('company'), name: string(), employees: number() }),
    ])

    // Structural object union (non-discriminated)
    const structuralData = JSON.stringify({ email: 'test@example.com', verified: true })
    const structuralParser = union([
      object({ email: string(), verified: boolean() }),
      object({ phone: string(), country: string() }),
    ])

    bench('Primitive Union (string | number | boolean)', () => {
      primitiveUnionParser.parse(b`${primitiveUnionData}`)
    })

    bench('Literal Union (3 literals)', () => {
      literalUnionParser.parse(b`${literalUnionData}`)
    })

    bench('Discriminated Object Union', () => {
      discriminatedParser.parse(b`${discriminatedData}`)
    })

    bench('Structural Object Union', () => {
      structuralParser.parse(b`${structuralData}`)
    })
  })

  describe('Union Variant Count Impact', async () => {
    const { union } = await import('atchara')

    // Test data that matches the first variant
    const testData = JSON.stringify('hello')

    // 2 variants
    const union2 = union([string(), number()])

    // 4 variants
    const union4 = union([string(), number(), boolean(), nullable(string())])

    // 8 variants
    const union8 = union([
      string(),
      number(),
      boolean(),
      nullable(string()),
      literal('a'),
      literal('b'),
      literal('c'),
      literal(42),
    ])

    bench('2 variants', () => {
      union2.parse(b`${testData}`)
    })

    bench('4 variants', () => {
      union4.parse(b`${testData}`)
    })

    bench('8 variants', () => {
      union8.parse(b`${testData}`)
    })
  })

  describe('Union Resolution Order', async () => {
    const { union } = await import('atchara')

    // Union with 5 literal variants
    const unionParser = union([
      literal('first'),
      literal('second'),
      literal('third'),
      literal('fourth'),
      literal('last'),
    ])

    const firstMatchData = JSON.stringify('first')
    const middleMatchData = JSON.stringify('third')
    const lastMatchData = JSON.stringify('last')

    bench('First Variant Match', () => {
      unionParser.parse(b`${firstMatchData}`)
    })

    bench('Middle Variant Match', () => {
      unionParser.parse(b`${middleMatchData}`)
    })

    bench('Last Variant Match', () => {
      unionParser.parse(b`${lastMatchData}`)
    })
  })

  describe('Record Type Parsing', async () => {
    const { record } = await import('atchara')

    // Small record (10 keys)
    const smallRecordData = JSON.stringify(
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`key_${i}`, i]))
    )
    // Medium record (100 keys)
    const mediumRecordData = JSON.stringify(
      Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`key_${i}`, i]))
    )
    // Large record (1000 keys)
    const largeRecordData = JSON.stringify(
      Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`key_${i}`, i]))
    )

    const numberRecordParser = record(number())

    bench('Small Record (10 keys)', () => {
      numberRecordParser.parse(b`${smallRecordData}`)
    })

    bench('Medium Record (100 keys)', () => {
      numberRecordParser.parse(b`${mediumRecordData}`)
    })

    bench('Large Record (1000 keys)', () => {
      numberRecordParser.parse(b`${largeRecordData}`)
    })
  })

  describe('Record Key Lookup (Deferred)', async () => {
    const { record } = await import('atchara')

    // Record with 1000 keys for lookup testing
    const largeRecordData = JSON.stringify(
      Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`key_${i}`, i * 2]))
    )

    const numberRecordParser = record(number())

    bench('Parse + Full Decode (toValue)', async () => {
      const deferred = numberRecordParser.parse(b`${largeRecordData}`)
      // Fully materialize the record
      const _ = await deferred.toValue()
    })

    bench('Parse + Single Key Lookup (first)', async () => {
      const deferred = numberRecordParser.parse(b`${largeRecordData}`)
      const _ = await (await deferred.get('key_0'))?.toValue()
    })

    bench('Parse + Single Key Lookup (middle)', async () => {
      const deferred = numberRecordParser.parse(b`${largeRecordData}`)
      const _ = await (await deferred.get('key_500'))?.toValue()
    })

    bench('Parse + Single Key Lookup (last)', async () => {
      const deferred = numberRecordParser.parse(b`${largeRecordData}`)
      const _ = await (await deferred.get('key_999'))?.toValue()
    })

    bench('Parse + 10 Key Lookups', async () => {
      const deferred = numberRecordParser.parse(b`${largeRecordData}`)
      for (let i = 0; i < 10; i++) {
        const _ = await (await deferred.get(`key_${i * 100}`))?.toValue()
      }
    })
  })

  describe('Record vs Object Performance', async () => {
    const { record } = await import('atchara')

    // Same data structure, different schemas
    const data = JSON.stringify({
      field_0: 0,
      field_1: 1,
      field_2: 2,
      field_3: 3,
      field_4: 4,
      field_5: 5,
      field_6: 6,
      field_7: 7,
      field_8: 8,
      field_9: 9,
    })

    // Object with known fields
    const objectParser = object({
      field_0: number(),
      field_1: number(),
      field_2: number(),
      field_3: number(),
      field_4: number(),
      field_5: number(),
      field_6: number(),
      field_7: number(),
      field_8: number(),
      field_9: number(),
    })

    // Record with dynamic keys
    const recordParser = record(number())

    bench('Object (10 known fields)', () => {
      objectParser.parse(b`${data}`)
    })

    bench('Record (10 dynamic keys)', () => {
      recordParser.parse(b`${data}`)
    })
  })

  describe('Nested Record Performance', async () => {
    const { record } = await import('atchara')

    // Nested record structure
    const nestedData = JSON.stringify({
      level1_a: { inner_0: 0, inner_1: 1, inner_2: 2 },
      level1_b: { inner_0: 10, inner_1: 11, inner_2: 12 },
      level1_c: { inner_0: 20, inner_1: 21, inner_2: 22 },
    })

    const nestedRecordParser = record(record(number()))

    bench('Nested Record Parse + Full Decode', async () => {
      const deferred = nestedRecordParser.parse(b`${nestedData}`)
      const _ = await deferred.toValue()
    })

    bench('Nested Record Single Key Lookup', async () => {
      const deferred = nestedRecordParser.parse(b`${nestedData}`)
      const inner = await deferred.get('level1_b')
      const _ = await (await inner?.get('inner_1'))?.toValue()
    })
  })
})
