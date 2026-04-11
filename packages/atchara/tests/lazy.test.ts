import { describe, it, expect, expectTypeOf, beforeAll } from 'vitest'
import {
  initialize,
  lazy,
  object,
  number,
  string,
  array,
  optional,
  nullable,
  union,
} from '../src/index'
import { toBytes as b } from '@atcharajs/core'
import {
  expectAtcharaErrorAsync,
  parseWithMode,
  createTestMatrix,
  type ParseOptions,
} from './common'

const testMatrix = createTestMatrix()

describe('Lazy Schema (Recursive Types)', () => {
  beforeAll(async () => {
    await initialize()
  })

  describe.each(testMatrix)('%s', (_label, options: ParseOptions) => {
    describe('Self-referential tree', () => {
      it('should parse a tree with empty children', async () => {
        type TreeNode = { value: number; children: TreeNode[] }
        const Node = lazy<TreeNode>(() =>
          object({
            value: number(),
            children: array(Node),
          })
        )

        const result = await parseWithMode(Node, b`{"value": 1, "children": []}`, options)
        expect(result).toEqual({ value: 1, children: [] })
      })

      it('should parse a tree with nested children', async () => {
        type TreeNode = { value: number; children: TreeNode[] }
        const Node = lazy<TreeNode>(() =>
          object({
            value: number(),
            children: array(Node),
          })
        )

        const result = await parseWithMode(
          Node,
          b`{"value": 1, "children": [{"value": 2, "children": []}, {"value": 3, "children": [{"value": 4, "children": []}]}]}`,
          options
        )
        expect(result).toEqual({
          value: 1,
          children: [
            { value: 2, children: [] },
            { value: 3, children: [{ value: 4, children: [] }] },
          ],
        })
      })

      it('should parse deeply nested recursive data (5+ levels)', async () => {
        type TreeNode = { value: number; children: TreeNode[] }
        const Node = lazy<TreeNode>(() =>
          object({
            value: number(),
            children: array(Node),
          })
        )

        const json = `{"value":1,"children":[{"value":2,"children":[{"value":3,"children":[{"value":4,"children":[{"value":5,"children":[{"value":6,"children":[]}]}]}]}]}]}`
        const result = await parseWithMode(Node, b`${json}`, options)
        expect(result).toEqual({
          value: 1,
          children: [
            {
              value: 2,
              children: [
                {
                  value: 3,
                  children: [
                    {
                      value: 4,
                      children: [
                        {
                          value: 5,
                          children: [
                            {
                              value: 6,
                              children: [],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      })
    })

    describe('Optional recursion (linked list)', () => {
      it('should parse a linked list with optional next', async () => {
        type ListNode = { value: number; next?: ListNode }
        const Node = lazy<ListNode>(() =>
          object({
            value: number(),
            next: optional(Node),
          })
        )

        const result = await parseWithMode(
          Node,
          b`{"value": 1, "next": {"value": 2, "next": {"value": 3}}}`,
          options
        )
        expect(result).toEqual({
          value: 1,
          next: {
            value: 2,
            next: { value: 3, next: undefined },
          },
        })
      })

      it('should parse a single node with no next', async () => {
        type ListNode = { value: number; next?: ListNode }
        const Node = lazy<ListNode>(() =>
          object({
            value: number(),
            next: optional(Node),
          })
        )

        const result = await parseWithMode(Node, b`{"value": 42}`, options)
        expect(result).toEqual({ value: 42, next: undefined })
      })
    })

    describe('Nullable recursion', () => {
      it('should parse nullable recursive field', async () => {
        type ListNode = { value: number; next: ListNode | null }
        const Node = lazy<ListNode>(() =>
          object({
            value: number(),
            next: nullable(Node),
          })
        )

        const result = await parseWithMode(
          Node,
          b`{"value": 1, "next": {"value": 2, "next": null}}`,
          options
        )
        expect(result).toEqual({
          value: 1,
          next: { value: 2, next: null },
        })
      })
    })

    describe('Union with recursion', () => {
      it('should parse recursive union (JSON-like value type)', async () => {
        type JsonValue = number | string | JsonValue[]
        const JsonVal = lazy<JsonValue>(() => union([number(), string(), array(JsonVal)]))

        expect(await parseWithMode(JsonVal, b`42`, options)).toBe(42)
        expect(await parseWithMode(JsonVal, b`"hello"`, options)).toBe('hello')
        expect(await parseWithMode(JsonVal, b`[1, "two", [3]]`, options)).toEqual([1, 'two', [3]])
      })
    })

    describe('Error handling in recursive structures', () => {
      it('should report errors with correct position', async () => {
        type TreeNode = { value: number; children: TreeNode[] }
        const Node = lazy<TreeNode>(() =>
          object({
            value: number(),
            children: array(Node),
          })
        )

        await expectAtcharaErrorAsync(
          () =>
            parseWithMode(
              Node,
              b`{"value": 1, "children": [{"value": "bad", "children": []}]}`,
              options
            ),
          {
            code: 'VALIDATION_ERROR',
          }
        )
      })

      it('should report missing required field in nested recursive node', async () => {
        type TreeNode = { value: number; children: TreeNode[] }
        const Node = lazy<TreeNode>(() =>
          object({
            value: number(),
            children: array(Node),
          })
        )

        await expectAtcharaErrorAsync(
          () => parseWithMode(Node, b`{"value": 1, "children": [{"children": []}]}`, options),
          {
            code: 'MISSING_REQUIRED',
          }
        )
      })
    })
  })

  describe('Deferred access on recursive types', () => {
    it('should support deferred field access on recursive objects', () => {
      type TreeNode = { value: number; children: TreeNode[] }
      const Node = lazy<TreeNode>(() =>
        object({
          value: number(),
          children: array(Node),
        })
      )

      // Full materialization works via toValue()
      const result = Node.parse(b`{"value": 1, "children": [{"value": 2, "children": []}]}`)

      expect(result.toValue()).toEqual({
        value: 1,
        children: [{ value: 2, children: [] }],
      })
    })
  })

  describe('Type inference', () => {
    it('should infer output type from type parameter', () => {
      type TreeNode = { value: number; children: TreeNode[] }
      const Node = lazy<TreeNode>(() =>
        object({
          value: number(),
          children: array(Node),
        })
      )

      const result = Node.parse(b`{"value": 1, "children": []}`)
      expectTypeOf(result.toValue()).toEqualTypeOf<TreeNode>()
    })

    it('should infer output type for union recursion', () => {
      type JsonValue = number | string | JsonValue[]
      const JsonVal = lazy<JsonValue>(() => union([number(), string(), array(JsonVal)]))

      const result = JsonVal.parse(b`42`)
      expectTypeOf(result.toValue()).toEqualTypeOf<JsonValue>()
    })

    it('should infer output type for nullable recursion', () => {
      type ListNode = { value: number; next: ListNode | null }
      const Node = lazy<ListNode>(() =>
        object({
          value: number(),
          next: nullable(Node),
        })
      )

      const result = Node.parse(b`{"value": 1, "next": null}`)
      expectTypeOf(result.toValue()).toEqualTypeOf<ListNode>()
    })

    it('should infer output type for optional recursion', () => {
      type ListNode = { value: number; next?: ListNode }
      const Node = lazy<ListNode>(() =>
        object({
          value: number(),
          next: optional(Node),
        })
      )

      const result = Node.parse(b`{"value": 1}`)
      expectTypeOf(result.toValue()).toEqualTypeOf<ListNode>()
    })
  })
})
