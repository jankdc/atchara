/**
 * Binary error decoder for errors encoded by the native parser.
 * Decodes errors from the binary format and reconstructs AtcharaError objects.
 */

import type {
  AtcharaError,
  InvalidSchema,
  InvalidUtf8,
  MissingRequired,
  UnexpectedCharacter,
  UnexpectedEof,
  UnexpectedField,
  UnionNoMatch,
  ValidationError,
} from '@atchara/core'
import { createAtcharaError } from '@atchara/core'
import {
  ERROR_CODE_INVALID_SCHEMA,
  ERROR_CODE_INVALID_UTF8,
  ERROR_CODE_MISSING_REQUIRED,
  ERROR_CODE_UNEXPECTED_CHARACTER,
  ERROR_CODE_UNEXPECTED_EOF,
  ERROR_CODE_UNEXPECTED_FIELD,
  ERROR_CODE_UNION_NO_MATCH,
  ERROR_CODE_VALIDATION_ERROR,
} from '@atchara/native'
import { ByteReader } from './reader'

/**
 * Decodes binary-encoded errors from the native parser.
 * Uses composition with ByteReader for low-level byte operations.
 */
export class ErrorDecoder {
  private reader: ByteReader

  constructor(bytes: Uint8Array) {
    this.reader = new ByteReader(bytes)
  }

  /**
   * Decode the binary error and return an AtcharaError ready to be thrown.
   */
  decode(): AtcharaError {
    const code = this.reader.readU8()

    switch (code) {
      case ERROR_CODE_UNEXPECTED_EOF:
        return createAtcharaError<UnexpectedEof>('Unexpected end of input', {
          code: 'UNEXPECTED_EOF',
        })

      case ERROR_CODE_INVALID_UTF8: {
        const line = this.reader.readU32()
        const column = this.reader.readU32()
        const rawMessage = this.reader.readString()
        return createAtcharaError<InvalidUtf8>(
          `Invalid UTF-8 at line ${line}, column ${column}: ${rawMessage}`,
          {
            code: 'INVALID_UTF8',
            position: { line, column },
            details: { rawMessage },
          }
        )
      }

      case ERROR_CODE_UNEXPECTED_CHARACTER: {
        const line = this.reader.readU32()
        const column = this.reader.readU32()
        const character = this.reader.readString()
        return createAtcharaError<UnexpectedCharacter>(
          `Unexpected character '${character}' at line ${line}, column ${column}`,
          {
            code: 'UNEXPECTED_CHARACTER',
            position: { line, column },
            details: { character },
          }
        )
      }

      case ERROR_CODE_VALIDATION_ERROR: {
        const line = this.reader.readU32()
        const column = this.reader.readU32()
        const expected = this.reader.readString()
        const found = this.reader.readString()
        return createAtcharaError<ValidationError>(
          `Expected ${expected}, found ${found} at line ${line}, column ${column}`,
          {
            code: 'VALIDATION_ERROR',
            position: { line, column },
            details: { expected, found },
          }
        )
      }

      case ERROR_CODE_MISSING_REQUIRED: {
        const line = this.reader.readU32()
        const column = this.reader.readU32()
        const field = this.reader.readString()
        return createAtcharaError<MissingRequired>(
          `Missing required field '${field}' in object at line ${line}, column ${column}`,
          {
            code: 'MISSING_REQUIRED',
            position: { line, column },
            details: { field },
          }
        )
      }

      case ERROR_CODE_UNEXPECTED_FIELD: {
        const line = this.reader.readU32()
        const column = this.reader.readU32()
        const field = this.reader.readString()
        return createAtcharaError<UnexpectedField>(
          `Unexpected field '${field}' at line ${line}, column ${column}`,
          {
            code: 'UNEXPECTED_FIELD',
            position: { line, column },
            details: { field },
          }
        )
      }

      case ERROR_CODE_UNION_NO_MATCH: {
        const line = this.reader.readU32()
        const column = this.reader.readU32()
        const count = this.reader.readU32()
        const variantErrors: AtcharaError[] = []

        for (let i = 0; i < count; i++) {
          variantErrors.push(this.decode())
        }

        const variantSummary = variantErrors.map((e, i) => `[${i}] ${e.message}`).join('; ')

        return createAtcharaError<UnionNoMatch>(
          `No union variant matched at line ${line}, column ${column}. Variant errors: ${variantSummary}`,
          {
            code: 'UNION_NO_MATCH',
            position: { line, column },
            details: { variantErrors },
          }
        )
      }

      case ERROR_CODE_INVALID_SCHEMA: {
        const message = this.reader.readString()
        return createAtcharaError<InvalidSchema>(`Invalid schema: ${message}`, {
          code: 'INVALID_SCHEMA',
        })
      }

      default:
        throw new Error(`Unknown error code: ${code}`)
    }
  }
}
