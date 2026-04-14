/**
 * The base interface for all the JSON parsers.
 */

import type { Schema } from '../schema/types'
import type { InferDeferred } from '../deferred/types'
import type { Readable } from 'stream'

export interface Parser<T extends Schema> {
  readonly schema: T

  /**
   * Parse JSON from UTF-8 encoded bytes and return a deferred-wrapped result.
   * The result is a deferred wrapper that provides on-demand access to parsed values.
   */
  parse(input: Uint8Array): InferDeferred<T>

  /**
   * Parse large JSON documents incrementally from a readable stream.
   * Parses and stores to redb as chunks arrive - never buffers the entire document.
   * Enables parsing files larger than available RAM.
   * Returns a result object with explicit close() for resource management.
   */
  parseLarge(stream: Readable): Promise<LargeParseResult<T>>
}

/**
 * Result from parsing large documents with explicit resource management.
 */
export interface LargeParseResult<T extends Schema> {
  data: InferDeferred<T>
  close(): void
  readonly isClosed: boolean
}

/**
 * Result from parseEach with explicit resource management.
 * Implements AsyncIterable so it works with `for await...of`.
 * Call close() when done accessing yielded deferreds, or use `await using` for automatic cleanup.
 *
 * @typeParam E - The deferred type of each yielded element
 */
export interface EachParseResult<E> {
  [Symbol.asyncIterator](): AsyncIterableIterator<E>
  close(): void
  readonly isClosed: boolean
  [Symbol.asyncDispose](): Promise<void>
}
