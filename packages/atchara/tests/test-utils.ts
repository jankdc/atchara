/**
 * Test utilities for running parse tests against multiple backends.
 *
 * Enables the same test cases to run against:
 * - sync: In-memory BufferEncoder (parse())
 * - streaming: Chunked kahon storage (parseLargeStream())
 */

import { Readable } from 'node:stream'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import type { Parser, Schema, InferDeferred, Unwrap, DeferredValue } from '@atcharajs/core'

export type ParseMode = 'sync' | 'streaming'

/**
 * Chunk sizes for streaming tests.
 * Different sizes stress different edge cases in the chunked parser:
 * - 1: Catches state machine bugs at every byte boundary
 * - 7: Prime number, misaligns with common buffer sizes
 * - 64: Typical small chunk
 * - 1024: Larger chunk
 * - Infinity: Single chunk (degenerates to non-streaming)
 */
export const CHUNK_SIZES = [1, 7, 64, 1024, Infinity] as const

export type ChunkSize = (typeof CHUNK_SIZES)[number]

export interface ParseOptions {
  mode: ParseMode
  chunkSize?: ChunkSize
}

/**
 * Parses input using the specified mode and returns the materialized value.
 * Automatically handles resource cleanup for large/streaming modes.
 */
export async function parseWithMode<S extends Schema<unknown, unknown, DeferredValue<unknown>>>(
  parser: Parser<S>,
  input: Uint8Array,
  options: ParseOptions
): Promise<Unwrap<InferDeferred<S>>> {
  const { mode, chunkSize = 64 } = options

  switch (mode) {
    case 'sync': {
      const result = parser.parse(input)
      return (await result.toValue()) as Unwrap<InferDeferred<S>>
    }

    case 'streaming': {
      const stream = createChunkedStream(input, chunkSize)
      const result = await parser.parseLarge(stream)
      try {
        return (await result.data.toValue()) as Unwrap<InferDeferred<S>>
      } finally {
        result.close()
      }
    }
  }
}

/**
 * Parses input expecting an error.
 * Returns the thrown error for assertion, or throws if no error occurred.
 */
export async function parseWithModeExpectError<
  S extends Schema<unknown, unknown, DeferredValue<unknown>>,
>(parser: Parser<S>, input: Uint8Array, options: ParseOptions): Promise<Error> {
  try {
    await parseWithMode(parser, input, options)
    throw new Error('Expected parse to throw an error')
  } catch (error) {
    if (error instanceof Error && error.message === 'Expected parse to throw an error') {
      throw error
    }
    return error as Error
  }
}

/**
 * Creates a readable stream that emits data in chunks of the specified size.
 */
function createChunkedStream(data: Uint8Array, chunkSize: number): Readable {
  let offset = 0

  return new Readable({
    read() {
      if (offset >= data.length) {
        this.push(null)
        return
      }

      const end = Math.min(offset + chunkSize, data.length)
      const chunk = data.slice(offset, end)
      offset = end
      this.push(Buffer.from(chunk))
    },
  })
}

/**
 * Returns test modes to run based on environment.
 * Can be filtered via ATCHARA_TEST_MODE env var.
 */
export function getTestModes(): ParseMode[] {
  const envMode = process.env.ATCHARA_TEST_MODE as ParseMode | undefined

  if (envMode && ['sync', 'streaming'].includes(envMode)) {
    return [envMode]
  }

  return ['sync', 'streaming']
}

/**
 * Returns chunk sizes to test for streaming mode.
 * Can be filtered via ATCHARA_CHUNK_SIZE env var.
 */
export function getChunkSizes(): ChunkSize[] {
  const envSize = process.env.ATCHARA_CHUNK_SIZE

  if (envSize === 'all') {
    return [...CHUNK_SIZES]
  }

  if (envSize) {
    const size = Number(envSize)
    if (!isNaN(size) && size > 0) {
      return [size]
    }
  }

  // Default: test a representative subset for faster CI
  return [7, 64]
}

/**
 * Helper to create test matrix for describe.each
 * Returns array of [label, options] pairs
 */
export function createTestMatrix(): Array<[string, ParseOptions]> {
  const modes = getTestModes()
  const matrix: Array<[string, ParseOptions]> = []

  for (const mode of modes) {
    if (mode === 'streaming') {
      for (const chunkSize of getChunkSizes()) {
        const label =
          chunkSize === Infinity ? `streaming (single chunk)` : `streaming (${chunkSize}B chunks)`
        matrix.push([label, { mode, chunkSize }])
      }
    } else {
      matrix.push([mode, { mode }])
    }
  }

  return matrix
}
