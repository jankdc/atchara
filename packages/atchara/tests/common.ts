/**
 * Test helpers for Atchara error assertions.
 */

import type {
  AtcharaError,
  AtcharaErrorCode,
  AtcharaPosition,
  UnexpectedEof,
  InvalidUtf8,
  UnexpectedCharacter,
  ValidationError,
  MissingRequired,
  UnexpectedField,
  UnionNoMatch,
  InvalidSchema,
} from '../src/index'

import { expect } from 'vitest'
import { isAtcharaError } from '../src/index'

export type { ParseMode, ParseOptions, ChunkSize } from './test-utils'
export { parseWithMode, createTestMatrix, getTestModes, CHUNK_SIZES } from './test-utils'

/**
 * Maps error codes to their specific error types.
 */
type ErrorByCode = {
  UNEXPECTED_EOF: UnexpectedEof
  INVALID_UTF8: InvalidUtf8
  UNEXPECTED_CHARACTER: UnexpectedCharacter
  VALIDATION_ERROR: ValidationError
  MISSING_REQUIRED: MissingRequired
  UNEXPECTED_FIELD: UnexpectedField
  UNION_NO_MATCH: UnionNoMatch
  INVALID_SCHEMA: InvalidSchema
}

/**
 * Extract details type for a given error code.
 */
type DetailsForCode<C extends AtcharaErrorCode> = ErrorByCode[C] extends { details: infer D }
  ? D
  : never

/**
 * Error types that have position information.
 */
type ErrorWithPosition = Exclude<AtcharaError, UnexpectedEof | InvalidSchema>

/**
 * Type guard to check if an error has a position.
 * With discriminated unions, this narrows to error types that include position.
 */
function hasPosition(error: AtcharaError): error is ErrorWithPosition {
  return 'position' in error
}

/**
 * Expected error properties for assertion.
 * When `code` is specified, `details` is typed based on that error type.
 */
type ExpectedError<C extends AtcharaErrorCode | undefined = undefined> = {
  code?: C
  position?: AtcharaPosition
  messageMatch?: RegExp | string
  details?: C extends AtcharaErrorCode ? Partial<DetailsForCode<C>> : never
}

/**
 * Return type based on whether code was specified.
 */
type ExpectAtcharaErrorResult<C extends AtcharaErrorCode | undefined> = C extends AtcharaErrorCode
  ? ErrorByCode[C] & Error & { name: 'AtcharaError' }
  : AtcharaError

/**
 * Asserts that a function throws an AtcharaError with the expected properties.
 *
 * When `code` is specified, returns a narrowed type for type-safe access to
 * error-specific properties like `details`.
 *
 * @example
 * ```ts
 * // With code - returns narrowed type, can assert details
 * const error = expectAtcharaError(() => parse(...), {
 *   code: 'VALIDATION_ERROR',
 *   position: { line: 1, column: 1 },
 *   details: { expected: 'string' }
 * })
 * // error.details.expected is accessible without type narrowing
 *
 * // Without code - returns AtcharaError
 * const error = expectAtcharaError(() => parse(...), {
 *   position: { line: 1, column: 1 }
 * })
 * ```
 */
export function expectAtcharaError<C extends AtcharaErrorCode | undefined = undefined>(
  fn: () => void,
  expected: ExpectedError<C> = {} as ExpectedError<C>
): ExpectAtcharaErrorResult<C> {
  let error: unknown

  try {
    fn()
    throw new Error('Expected function to throw an AtcharaError')
  } catch (e) {
    error = e
  }

  // Verify it's an AtcharaError
  if (!isAtcharaError(error)) {
    throw new Error(`Expected AtcharaError but got: ${String(error)}`)
  }

  // Check code if specified
  if (expected.code) {
    expect(error.code).toBe(expected.code)
  }

  // Check position if specified
  if (expected.position) {
    if (!hasPosition(error)) {
      throw new Error(`Expected error to have position but got: ${JSON.stringify(error)}`)
    }
    expect(error.position).toEqual(expected.position)
  }

  // Check message match if specified
  if (expected.messageMatch) {
    if (typeof expected.messageMatch === 'string') {
      expect(error.message).toContain(expected.messageMatch)
    } else {
      expect(error.message).toMatch(expected.messageMatch)
    }
  }

  // Check details if specified
  if (expected.details) {
    if (!('details' in error)) {
      throw new Error(`Expected error to have details but got: ${JSON.stringify(error)}`)
    }
    expect(error.details).toMatchObject(expected.details)
  }

  return error as ExpectAtcharaErrorResult<C>
}

/**
 * Async version of expectAtcharaError for use with parseWithMode.
 * Asserts that an async function throws an AtcharaError with the expected properties.
 */
export async function expectAtcharaErrorAsync<C extends AtcharaErrorCode | undefined = undefined>(
  fn: () => Promise<unknown>,
  expected: ExpectedError<C> = {} as ExpectedError<C>
): Promise<ExpectAtcharaErrorResult<C>> {
  let error: unknown

  try {
    await fn()
    throw new Error('Expected function to throw an AtcharaError')
  } catch (e) {
    error = e
  }

  // Verify it's an AtcharaError
  if (!isAtcharaError(error)) {
    throw new Error(`Expected AtcharaError but got: ${String(error)}`)
  }

  // Check code if specified
  if (expected.code) {
    expect(error.code).toBe(expected.code)
  }

  // Check position if specified
  if (expected.position) {
    if (!hasPosition(error)) {
      throw new Error(`Expected error to have position but got: ${JSON.stringify(error)}`)
    }
    expect(error.position).toEqual(expected.position)
  }

  // Check message match if specified
  if (expected.messageMatch) {
    if (typeof expected.messageMatch === 'string') {
      expect(error.message).toContain(expected.messageMatch)
    } else {
      expect(error.message).toMatch(expected.messageMatch)
    }
  }

  // Check details if specified
  if (expected.details) {
    if (!('details' in error)) {
      throw new Error(`Expected error to have details but got: ${JSON.stringify(error)}`)
    }
    expect(error.details).toMatchObject(expected.details)
  }

  return error as ExpectAtcharaErrorResult<C>
}
