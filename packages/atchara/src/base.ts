/**
 * Native API implementation - provides tree-shakeable functional API for creating parsers
 */

import type { Parser, Schema } from '@atcharajs/core'

import { NativeParser } from './native'

import { StringSchema } from './schema/string'
import { ObjectSchema } from './schema/object'
import { NumberSchema } from './schema/number'
import { IntegerSchema } from './schema/integer'
import { BooleanSchema } from './schema/boolean'
import { NullableSchema } from './schema/nullable'
import { OptionalSchema } from './schema/optional'
import { LiteralSchema } from './schema/literal'
import { TupleSchema } from './schema/tuple'
import { RecordSchema } from './schema/record'
import { UnionSchema } from './schema/union'
import { ArraySchema } from './schema/array'
import { LazySchema } from './schema/lazy'

// Rejects Parser<OptionalSchema<any>> at type level - optional() only makes sense in object fields
type RejectOptional<T> = T extends Parser<OptionalSchema<Parser<Schema>>> ? never : T

/**
 * Initialize the parser module.
 * With native bindings, initialization is automatic. This function is kept for backwards compatibility.
 *
 * @returns A promise that resolves immediately
 *
 * @example
 * ```ts
 * import { initialize, object, string, number, toBytes as b } from 'atchara'
 *
 * await initialize()
 *
 * const User = object({
 *   name: string(),
 *   age: number()
 * })
 *
 * const user = User.parse(b`{"name": "Alice", "age": 30}`)
 * ```
 */
export async function initialize(): Promise<void> {
  // No-op: native bindings are loaded automatically
  // Function is async for API consistency and potential future async initialization
}

/**
 * Creates a parser that validates and parses JSON strings.
 *
 * @returns A parser for string values
 *
 * @example
 * ```ts
 * import { string, toBytes as b } from 'atchara'
 *
 * const parser = string()
 * parser.parse(b`"hello"`) // "hello"
 *
 * // With constraints
 * const bounded = string().min(1).max(255)
 * ```
 */
export function string() {
  return new StringSchema()
}

/**
 * Creates a parser that validates and parses JSON numbers (integers and floats).
 *
 * @returns A parser for number values
 *
 * @example
 * ```ts
 * import { number, toBytes as b } from 'atchara'
 *
 * const parser = number()
 * parser.parse(b`42`)      // 42
 * parser.parse(b`3.14`)    // 3.14
 * parser.parse(b`-1.5e10`) // -1.5e10
 *
 * // With constraints
 * const positive = number().min(0)
 * const percentage = number().min(0).max(100)
 * ```
 */
export function number() {
  return new NumberSchema()
}

/**
 * Creates a parser that validates and parses JSON integers.
 * Unlike `number()`, this rejects floating-point values.
 *
 * @returns A parser for integer values
 *
 * @example
 * ```ts
 * import { integer, toBytes as b } from 'atchara'
 *
 * const parser = integer()
 * parser.parse(b`42`)   // 42
 * parser.parse(b`-100`) // -100
 * parser.parse(b`3.14`) // throws - not an integer
 *
 * // With constraints
 * const natural = integer().min(0)
 * ```
 */
export function integer() {
  return new IntegerSchema()
}

/**
 * Creates a parser that validates and parses JSON booleans.
 *
 * @returns A parser for boolean values
 *
 * @example
 * ```ts
 * import { boolean, toBytes as b } from 'atchara'
 *
 * const parser = boolean()
 * parser.parse(b`true`)  // true
 * parser.parse(b`false`) // false
 * ```
 */
export function boolean() {
  const schema = new BooleanSchema()
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Creates a parser that accepts either the wrapped type or `null`.
 *
 * @param valueParser - The parser for the non-null value
 * @returns A parser that accepts the value type or null
 *
 * @example
 * ```ts
 * import { nullable, string, toBytes as b } from 'atchara'
 *
 * const parser = nullable(string())
 * parser.parse(b`"hello"`) // "hello"
 * parser.parse(b`null`)    // null
 *
 * // Type is inferred as: string | null
 * ```
 */
export function nullable<T extends Parser<Schema>>(valueParser: T) {
  const schema = new NullableSchema(valueParser)
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Marks an object field as optional, allowing it to be omitted.
 * This should only be used within `object()` shape definitions.
 *
 * @param valueParser - The parser for the field value when present
 * @returns A parser that marks the field as optional
 *
 * @example
 * ```ts
 * import { object, string, number, optional, toBytes as b } from 'atchara'
 *
 * const parser = object({
 *   name: string(),
 *   age: optional(number())
 * })
 *
 * parser.parse(b`{"name":"Alice"}`)          // { name: "Alice", age: undefined }
 * parser.parse(b`{"name":"Bob","age":30}`)   // { name: "Bob", age: 30 }
 *
 * // Type is inferred as: { name: string; age?: number }
 * ```
 */
export function optional<T extends Parser<Schema>>(valueParser: T) {
  const schema = new OptionalSchema(valueParser)
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Creates a parser for JSON objects with a defined shape.
 * Each key in the shape corresponds to an expected field in the JSON object.
 *
 * @param shape - An object mapping field names to their parsers
 * @returns A parser for objects matching the shape
 *
 * @example
 * ```ts
 * import { object, number, string, optional, literal, toBytes as b } from 'atchara'
 *
 * const userParser = object({
 *   id: number(),
 *   name: string(),
 *   email: optional(string()),
 *   role: literal('admin')
 * })
 *
 * const user = userParser.parse(b`{"id":1,"name":"Alice","role":"admin"}`)
 * // user: { id: number; name: string; email?: string; role: "admin" }
 * ```
 */
export function object<T extends Record<string, Parser<Schema>>>(shape: T) {
  const schema = new ObjectSchema(shape)
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Creates a parser for JSON arrays where all elements share the same type.
 *
 * @param elements - The parser for each element in the array
 * @returns A parser for arrays of the element type
 *
 * @example
 * ```ts
 * import { array, number, toBytes as b } from 'atchara'
 *
 * const parser = array(number())
 * parser.parse(b`[1,2,3]`) // [1, 2, 3]
 *
 * // With constraints
 * const bounded = array(number()).min(1).max(10)
 * ```
 */
export function array<T extends Parser<Schema>>(elements: T) {
  return new ArraySchema(elements)
}

/**
 * Creates a parser that only accepts a specific literal value.
 * Useful for discriminated unions, constants, and exact value matching.
 *
 * @param value - The exact value to match (string, number, boolean, or null)
 * @returns A parser that only accepts the literal value
 *
 * @example
 * ```ts
 * import { literal, union, object, number, string, toBytes as b } from 'atchara'
 *
 * const parser = literal('success')
 * parser.parse(b`"success"`) // "success"
 * parser.parse(b`"failure"`) // throws - not the expected literal
 *
 * // Discriminated unions
 * const eventParser = union([
 *   object({ type: literal('click'), x: number(), y: number() }),
 *   object({ type: literal('keypress'), key: string() })
 * ])
 * ```
 */
export function literal<T extends string | number | boolean | null>(value: T) {
  const schema = new LiteralSchema(value)
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Creates a parser for fixed-length arrays where each position has a specific type.
 * Unlike `array()`, tuples have a known length and can have different types per position.
 *
 * @param elements - An array of parsers, one for each position in the tuple
 * @returns A parser for tuples matching the element types
 *
 * @example
 * ```ts
 * import { tuple, number, string, boolean, toBytes as b } from 'atchara'
 *
 * // Coordinate pair
 * const point = tuple([number(), number()])
 * point.parse(b`[10,20]`) // [10, 20] as [number, number]
 *
 * // Mixed types
 * const entry = tuple([string(), number(), boolean()])
 * entry.parse(b`["key",42,true]`) // ["key", 42, true] as [string, number, boolean]
 *
 * // Empty tuple
 * const empty = tuple([])
 * empty.parse(b`[]`) // [] as []
 * ```
 */
export function tuple<T extends readonly [] | readonly [Parser<Schema>, ...Parser<Schema>[]]>(
  elements: T
) {
  const schema = new TupleSchema(elements)
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Creates a parser for objects with string keys and uniform value types.
 * Unlike `object()`, record keys are not known at compile time.
 *
 * @param valueSchema - The parser for each value in the record
 * @returns A parser for records with the value type
 *
 * @example
 * ```ts
 * import { record, number, string, toBytes as b } from 'atchara'
 *
 * // String-to-number mapping
 * const scores = record(number())
 * scores.parse(b`{"alice":100,"bob":85}`)
 * // { alice: 100, bob: 85 } as Record<string, number>
 *
 * // Nested records
 * const config = record(record(string()))
 * config.parse(b`{"db":{"host":"localhost"}}`)
 * ```
 */
export function record<T extends Parser<Schema>>(valueSchema: T) {
  return new RecordSchema(valueSchema)
}

/**
 * Creates a parser that accepts any of the provided variant types.
 * Variants are tried in order until one succeeds.
 *
 * @param variants - An array of parsers representing possible types
 * @returns A parser that accepts any of the variant types
 *
 * @example
 * ```ts
 * import { union, string, number, object, literal, toBytes as b } from 'atchara'
 *
 * // Simple union
 * const stringOrNumber = union([string(), number()])
 * stringOrNumber.parse(b`"hello"`) // "hello"
 * stringOrNumber.parse(b`42`)      // 42
 *
 * // Discriminated union (recommended for objects)
 * const shape = union([
 *   object({ kind: literal('circle'), radius: number() }),
 *   object({ kind: literal('rect'), width: number(), height: number() })
 * ])
 *
 * shape.parse(b`{"kind":"circle","radius":5}`)
 * // { kind: "circle", radius: 5 }
 * ```
 */
export function union<T extends readonly [Parser<Schema>, ...Parser<Schema>[]]>(
  variants: { [K in keyof T]: RejectOptional<T[K]> } & T
) {
  const schema = new UnionSchema(variants)
  const parser: Parser<typeof schema> = new NativeParser(schema)
  return parser
}

/**
 * Creates a lazily-evaluated schema for recursive data structures.
 * The schema is resolved on first use, enabling self-referential definitions.
 *
 * Provide the output type as a type parameter to enable recursive self-reference
 * without a variable annotation. TypeScript resolves the return type from the
 * type parameter alone, breaking the circular inference.
 *
 * @param fn - A function that returns the parser to defer to
 * @returns A parser wrapping the lazily-resolved schema
 *
 * @example
 * ```ts
 * import { lazy, object, number, array, toBytes as b } from 'atchara'
 *
 * type TreeNode = { value: number; children: TreeNode[] }
 *
 * const Node = lazy<TreeNode>(() =>
 *   object({
 *     value: number(),
 *     children: array(Node),
 *   })
 * )
 *
 * Node.parse(b`{"value": 1, "children": []}`)
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- thunk typed as any to break circular type inference for recursive schemas
export function lazy<TOutput>(fn: () => any): LazySchema<Parser<Schema<TOutput>>>
// eslint-disable-next-line no-redeclare
export function lazy<T extends Parser<Schema>>(fn: () => T): LazySchema<T>
// eslint-disable-next-line no-redeclare
export function lazy(fn: () => Parser<Schema>): LazySchema<Parser<Schema>> {
  return new LazySchema(fn)
}
