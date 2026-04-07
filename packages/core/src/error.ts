/**
 * Atchara Error Types
 *
 * Structured error handling for Atchara parsing errors.
 * Uses discriminated unions for type-safe error handling.
 */

/**
 * Error codes matching the Rust AtcharaError enum variants.
 */
export type AtcharaErrorCode =
  | 'UNEXPECTED_EOF'
  | 'INVALID_UTF8'
  | 'UNEXPECTED_CHARACTER'
  | 'VALIDATION_ERROR'
  | 'MISSING_REQUIRED'
  | 'UNEXPECTED_FIELD'
  | 'UNION_NO_MATCH'
  | 'INVALID_SCHEMA'

/**
 * Position information for error location in the JSON input.
 */
export interface AtcharaPosition {
  /** 1-indexed line number */
  line: number
  /** 1-indexed column number */
  column: number
}

// ============================================================================
// Issue Types
// ============================================================================

/**
 * Base properties common to all issue types.
 */
interface AtcharaErrorBase extends Error {
  /** Error code identifying the type of error */
  code: AtcharaErrorCode
  /** Human-readable error message */
  message: string
}

/**
 * Unexpected end of input while parsing.
 * No position available since we reached EOF.
 */
export interface UnexpectedEof extends AtcharaErrorBase {
  code: 'UNEXPECTED_EOF'
}

/**
 * Invalid UTF-8 byte sequence encountered.
 */
export interface InvalidUtf8 extends AtcharaErrorBase {
  code: 'INVALID_UTF8'
  position: AtcharaPosition
  details: {
    /** The raw error message from the UTF-8 decoder */
    rawMessage: string
  }
}

/**
 * Unexpected character in JSON input.
 */
export interface UnexpectedCharacter extends AtcharaErrorBase {
  code: 'UNEXPECTED_CHARACTER'
  position: AtcharaPosition
  details: {
    /** The unexpected character */
    character: string
  }
}

/**
 * Schema validation failed - type mismatch or constraint violation.
 */
export interface ValidationError extends AtcharaErrorBase {
  code: 'VALIDATION_ERROR'
  position: AtcharaPosition
  details: {
    /** What type/value was expected */
    expected: string
    /** What was actually found */
    found: string
  }
}

/**
 * Required field missing from object.
 */
export interface MissingRequired extends AtcharaErrorBase {
  code: 'MISSING_REQUIRED'
  position: AtcharaPosition
  details: {
    /** The name of the missing field */
    field: string
  }
}

/**
 * Unexpected field in object (when using strict mode).
 */
export interface UnexpectedField extends AtcharaErrorBase {
  code: 'UNEXPECTED_FIELD'
  position: AtcharaPosition
  details: {
    /** The name of the unexpected field */
    field: string
  }
}

/**
 * No union variant matched the input.
 * Contains nested errors from each variant attempt.
 */
export interface UnionNoMatch extends AtcharaErrorBase {
  code: 'UNION_NO_MATCH'
  position: AtcharaPosition
  details: {
    /** Errors from each union variant that failed to match */
    variantErrors: readonly AtcharaError[]
  }
}

/**
 * Invalid schema structure during deserialization.
 * No position since this is a schema error, not a JSON error.
 */
export interface InvalidSchema extends AtcharaErrorBase {
  code: 'INVALID_SCHEMA'
}

// ============================================================================
// AtcharaError Type
// ============================================================================

export type AtcharaError =
  | UnexpectedEof
  | InvalidUtf8
  | UnexpectedCharacter
  | ValidationError
  | MissingRequired
  | UnexpectedField
  | UnionNoMatch
  | InvalidSchema

/**
 * Type guard to check if an error is an AtcharaError.
 *
 * The native layer creates Error objects with `name: 'AtcharaError'`
 * and error properties (code, position, details) set directly on the object.
 *
 * @example
 * ```typescript
 * import { toBytes as b } from '@atchara/core'
 *
 * try {
 *   parser.parse(b`{"invalid": }`)
 * } catch (e) {
 *   if (isAtcharaError(e)) {
 *     if (e.code === 'VALIDATION_ERROR') {
 *       // TypeScript narrows: e.details.expected, e.details.found
 *       console.log(`Expected ${e.details.expected}`)
 *     }
 *   }
 * }
 * ```
 */
export function isAtcharaError(error: unknown): error is AtcharaError {
  return (
    error instanceof Error &&
    error.name === 'AtcharaError' &&
    'code' in error &&
    typeof (error as AtcharaError).code === 'string'
  )
}

/**
 * Creates an AtcharaError of the specified type.
 *
 * @param message - Human-readable error message
 * @param properties - Error-specific properties (code, position, details)
 * @returns An AtcharaError ready to be thrown
 *
 * @example
 * ```typescript
 * throw createAtcharaError<InvalidSchema>('Invalid union variant', {
 *   code: 'INVALID_SCHEMA',
 *   details: { reason: 'optional() cannot be used as a union variant' }
 * })
 * ```
 */
export function createAtcharaError<T extends AtcharaError>(
  message: string,
  properties: Omit<T, keyof Error>
): T {
  const error = new Error(message) as T
  error.name = 'AtcharaError'
  Object.assign(error, properties)
  return error
}
