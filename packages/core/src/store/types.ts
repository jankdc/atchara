/**
 * ValueStore interface for lazy value access.
 *
 * The ValueStore abstraction decouples lazy classes from the underlying data representation.
 * It allows lazy classes to query values and metadata without holding eager references.
 * This enables future evolution to binary formats or other optimized representations.
 */

import type { SerializedSchema } from '../schema/types'

/**
 * Metadata about a field in the store.
 */
export interface FieldMetadata {
  exists: boolean
  schema: SerializedSchema
}

/**
 * ValueStore interface for accessing values and metadata.
 *
 * Lazy classes use ValueStore to query values without materializing entire structures.
 * Paths are arrays of string keys/indices that navigate the data structure.
 *
 * @example
 * ```ts
 * // Accessing nested field
 * store.get(['users', '0', 'name'])       // Gets data['users'][0]['name']
 * store.has(['users', '0'])               // true if value exists
 * store.getArrayLength(['users'])         // Gets length of users array
 * store.getRecordKeys(['metadata'])       // Gets keys of metadata record
 * ```
 */
export interface ValueStore {
  /**
   * Get a value by path from the store.
   * Returns undefined if the path doesn't exist.
   *
   * @param path Array of keys/indices to navigate
   * @returns The value at that path, or undefined if not found
   */
  get(path: string[]): unknown

  /**
   * Check if a value exists at the given path.
   *
   * @param path Array of keys/indices to navigate
   * @returns True if a value exists at that path
   */
  has(path: string[]): boolean

  /**
   * Get metadata about a field without materializing the field itself.
   * Used for checking field existence and schema information.
   *
   * @param path Base path to navigate to
   * @param key Field key to check metadata for
   * @returns Metadata about the field
   */
  getFieldMetadata(path: string[], key: string): FieldMetadata

  /**
   * Get the length of an array at the given path.
   * Used by LazyArray to report length without materializing all elements.
   *
   * @param path Array of keys/indices to navigate
   * @returns The array length, or 0 if not an array
   */
  getArrayLength(path: string[]): number

  /**
   * Get all keys of a record at the given path.
   * Used by LazyRecord to enumerate keys without materializing all values.
   *
   * @param path Array of keys/indices to navigate
   * @returns Array of all keys in the record
   */
  getRecordKeys(path: string[]): string[]

  /**
   * Get the definitions table for resolving ref schemas.
   * Returns an empty array if no lazy/recursive schemas are in use.
   */
  getDefs(): SerializedSchema[]
}
