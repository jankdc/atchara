/**
 * Schema-driven binary format decoder for values.
 * Decodes data based on known schema structure without type tags or field names.
 */

import type { SerializedSchema, SerializedObjectSchema } from '@atcharajs/core'
import { ABSENT_FIELD_MARKER, NULL_FLAG } from '@atcharajs/native'
import { ByteReader } from './reader'
import { fnv1a64 } from './hash'

export class BufferDecoder {
  private reader: ByteReader
  private defs: SerializedSchema[]

  constructor(bytes: Uint8Array, defs: SerializedSchema[] = []) {
    this.reader = new ByteReader(bytes)
    this.defs = defs
  }

  /**
   * Reset the decoder with new bytes and reset state.
   * Avoids allocation overhead by reusing the decoder instance.
   */
  reset(bytes: Uint8Array): void {
    this.reader.reset(bytes)
  }

  /** Seek to a specific offset in the byte stream */
  seek(offset: number): void {
    this.reader.seek(offset)
  }

  getOffset(): number {
    return this.reader.getOffset()
  }

  getRemainingBytes(): number {
    return this.reader.getRemainingBytes()
  }

  // ==========================================================================
  // Primitives (BufferDecoder interface)
  // ==========================================================================

  /** Read null flag (0x00 = null, 0x01 = present) */
  readNullFlag(): boolean {
    return this.reader.readU8() === NULL_FLAG
  }

  /** Read a boolean value */
  readBoolean(): boolean {
    return this.reader.readBoolean()
  }

  /** Read a number value (f64) */
  readNumber(): number {
    return this.reader.readF64()
  }

  /** Read a length-prefixed string */
  readString(): string {
    return this.reader.readString()
  }

  /** Read union variant index (u8) */
  readVariantIndex(): number {
    return this.reader.readU8()
  }

  // ==========================================================================
  // Schema-driven read
  // ==========================================================================

  /**
   * Read and deserialize based on schema type
   */
  read(schema: SerializedSchema): unknown {
    switch (schema.kind) {
      case 'string':
        return this.reader.readString()
      case 'number':
      case 'integer':
        return this.reader.readF64()
      case 'boolean':
        return this.reader.readBoolean()
      case 'literal':
        return this.readLiteral(schema)
      case 'object':
        return this.readObject(schema)
      case 'array':
        return this.readArray(schema)
      case 'tuple':
        return this.readTuple(schema)
      case 'nullable':
        return this.readNullable(schema)
      case 'optional':
        return this.read(schema.inner)
      case 'record':
        return this.readRecord(schema)
      case 'union':
        return this.readUnion(schema)
      case 'ref':
        return this.read(this.defs[schema.defId]!)
      default: {
        const exhaustiveCheck: never = schema
        throw new Error(`Unknown schema type: ${String(exhaustiveCheck)}`)
      }
    }
  }

  /** Read array length at current position without decoding elements */
  readArrayLength(): number {
    return this.reader.readU32At(this.reader.getOffset())
  }

  /** Read record keys at current position, skipping values */
  readRecordKeys(valueSchema: SerializedSchema): string[] {
    const offset = this.reader.getOffset()
    const keyCount = this.reader.readU32At(offset)
    if (keyCount === 0) {
      this.reader.seek(offset + 8) // Skip count and kv_data_size
      return []
    }

    this.reader.seek(offset + 8) // Skip count and kv_data_size

    const keys = new Array<string>(keyCount)
    for (let i = 0; i < keyCount; i++) {
      const keyLen = this.reader.readU16()
      keys[i] = this.reader.decodeStringAt(this.reader.getOffset(), keyLen)
      this.reader.skip(keyLen)
      this.skip(valueSchema)
    }

    // Skip hash index at the end
    this.reader.skip(keyCount * 12)

    return keys
  }

  // ============================================================================
  // Array Operations (at specific offset)
  // ============================================================================

  /** Read array length at a specific offset without modifying decoder position */
  getArrayLengthAt(arrayOffset: number): number {
    return this.reader.readU32At(arrayOffset)
  }

  /**
   * Get offset of array element at index by skipping preceding elements.
   * Returns undefined if index is out of bounds.
   */
  getArrayElementOffset(
    arrayOffset: number,
    index: number,
    elementSchema: SerializedSchema
  ): number | undefined {
    const length = this.reader.readU32At(arrayOffset)
    if (index >= length) return undefined

    // Skip length (4 bytes) then skip N elements
    this.reader.seek(arrayOffset + 4)
    for (let i = 0; i < index; i++) {
      this.skip(elementSchema)
    }

    return this.reader.getOffset()
  }

  /** Read array element at index */
  readArrayElementAt(arrayOffset: number, index: number, elementSchema: SerializedSchema): unknown {
    const length = this.reader.readU32At(arrayOffset)
    if (index >= length) return undefined

    this.reader.seek(arrayOffset + 4)
    for (let i = 0; i < index; i++) {
      this.skip(elementSchema)
    }

    return this.read(elementSchema)
  }

  // ============================================================================
  // Record Operations (hash-based O(log n) lookup)
  // ============================================================================

  /** Read record key count at a specific offset */
  getRecordKeyCountAt(recordOffset: number): number {
    return this.reader.readU32At(recordOffset)
  }

  /**
   * Find offset of record value by key using hash-based binary search.
   * Returns the offset where the value begins, or undefined if key not found.
   */
  findRecordValueOffset(recordOffset: number, key: string): number | undefined {
    const view = this.reader.getView()
    const keyCount = view.getUint32(recordOffset, false)
    if (keyCount === 0) return undefined

    const kvDataSize = view.getUint32(recordOffset + 4, false)
    const targetHash = fnv1a64(key)

    // Hash index is at the end, after kv_data
    const indexStart = recordOffset + 8 + kvDataSize

    let lo = 0
    let hi = keyCount - 1

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      const entryOffset = indexStart + mid * 12

      const hashHigh = view.getUint32(entryOffset, false)
      const hashLow = view.getUint32(entryOffset + 4, false)
      const entryHash = (BigInt(hashHigh) << 32n) | BigInt(hashLow)

      if (targetHash === entryHash) {
        const kvOffset = view.getUint32(entryOffset + 8, false)
        const keyLen = view.getUint16(kvOffset, false)
        return kvOffset + 2 + keyLen
      } else if (targetHash < entryHash) {
        hi = mid - 1
      } else {
        lo = mid + 1
      }
    }

    return undefined
  }

  /** Read record value by key using hash-based binary search */
  readRecordValueAt(recordOffset: number, key: string, valueSchema: SerializedSchema): unknown {
    const valueOffset = this.findRecordValueOffset(recordOffset, key)
    if (valueOffset === undefined) return undefined

    this.reader.seek(valueOffset)
    return this.read(valueSchema)
  }

  // ============================================================================
  // Object Operations (O(1) offset table lookup)
  // ============================================================================

  /** Check if object contains a field by reading offset table entry - O(1) */
  hasObjectFieldAt(
    objectOffset: number,
    fieldIndex: number,
    _schema: SerializedObjectSchema
  ): boolean {
    const relativeOffset = this.reader.readU32At(objectOffset + fieldIndex * 4)
    return relativeOffset !== ABSENT_FIELD_MARKER
  }

  /**
   * Find offset of object field value by field index - O(1).
   * Returns undefined if field is not present.
   */
  findObjectFieldOffset(
    objectOffset: number,
    fieldIndex: number,
    schema: SerializedObjectSchema
  ): number | undefined {
    const fieldCount = schema.objectFields.length
    const relativeOffset = this.reader.readU32At(objectOffset + fieldIndex * 4)

    if (relativeOffset === ABSENT_FIELD_MARKER) return undefined

    const valuesStart = objectOffset + fieldCount * 4
    return valuesStart + relativeOffset
  }

  /** Read object field value by field index - O(1) */
  readObjectFieldAt(
    objectOffset: number,
    fieldIndex: number,
    schema: SerializedObjectSchema
  ): unknown {
    const fieldOffset = this.findObjectFieldOffset(objectOffset, fieldIndex, schema)
    if (fieldOffset === undefined) return undefined

    const field = schema.objectFields[fieldIndex]
    if (!field) return undefined

    this.reader.seek(fieldOffset)
    return this.read(field.schema)
  }

  /**
   * Advance past a value without materializing it.
   * Used for efficient iteration when only partial data is needed.
   */
  skip(schema: SerializedSchema): void {
    switch (schema.kind) {
      case 'string':
        this.reader.skipString()
        break
      case 'number':
      case 'integer':
        this.reader.skip(8)
        break
      case 'boolean':
        this.reader.skip(1)
        break
      case 'literal':
        this.skipLiteral(schema)
        break
      case 'object':
        this.skipObject(schema)
        break
      case 'array':
        this.skipArray(schema)
        break
      case 'tuple':
        this.skipTuple(schema)
        break
      case 'nullable':
        this.skipNullable(schema)
        break
      case 'optional':
        this.skip(schema.inner)
        break
      case 'record':
        this.skipRecord()
        break
      case 'union':
        this.skipUnion(schema)
        break
      case 'ref':
        this.skip(this.defs[schema.defId]!)
        break
      default: {
        const exhaustiveCheck: never = schema
        throw new Error(`Unknown schema type: ${String(exhaustiveCheck)}`)
      }
    }
  }

  // ============================================================================
  // Private Read Methods
  // ============================================================================

  private readLiteral(schema: {
    kind: 'literal'
    value: string | number | boolean | null
  }): unknown {
    if (schema.value === null) {
      return null
    }

    switch (typeof schema.value) {
      case 'string':
        return this.reader.readString()
      case 'number':
        return this.reader.readF64()
      case 'boolean':
        return this.reader.readBoolean()
      default:
        throw new Error(`Unknown literal type: ${typeof schema.value}`)
    }
  }

  private readNullable(schema: { kind: 'nullable'; inner: SerializedSchema }): unknown {
    const flag = this.reader.readU8()
    return flag === NULL_FLAG ? null : this.read(schema.inner)
  }

  private readArray(schema: { kind: 'array'; elements: SerializedSchema }): unknown[] {
    const length = this.reader.readU32()
    const array = new Array<unknown>(length)

    for (let i = 0; i < length; i++) {
      array[i] = this.read(schema.elements)
    }

    return array
  }

  private readTuple(schema: { kind: 'tuple'; elements: SerializedSchema[] }): unknown[] {
    const elements = schema.elements
    const result = new Array<unknown>(elements.length)

    for (let i = 0; i < elements.length; i++) {
      result[i] = this.read(elements[i]!)
    }

    return result
  }

  private readRecord(schema: {
    kind: 'record'
    valueSchema: SerializedSchema
  }): Record<string, unknown> {
    const keyCount = this.reader.readU32()

    if (keyCount === 0) {
      this.reader.skip(4) // Skip kv_data_size
      return {}
    }

    this.reader.skip(4) // Skip kv_data_size

    const result: Record<string, unknown> = {}

    for (let i = 0; i < keyCount; i++) {
      const keyLen = this.reader.readU16()
      const key = this.reader.decodeStringAt(this.reader.getOffset(), keyLen)
      this.reader.skip(keyLen)

      result[key] = this.read(schema.valueSchema)
    }

    // Skip hash index at the end
    this.reader.skip(keyCount * 12)

    return result
  }

  private readObject(schema: {
    kind: 'object'
    objectFields: Array<{ key: string; index: number; schema: SerializedSchema }>
  }): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const fieldCount = schema.objectFields.length
    const objectStart = this.reader.getOffset()
    const valuesStart = objectStart + fieldCount * 4

    let maxEnd = valuesStart

    for (let i = 0; i < fieldCount; i++) {
      const relativeOffset = this.reader.readU32At(objectStart + i * 4)
      if (relativeOffset === ABSENT_FIELD_MARKER) continue

      const field = schema.objectFields[i]
      if (!field) {
        throw new Error(`Invalid field index: ${i}`)
      }

      this.reader.seek(valuesStart + relativeOffset)
      result[field.key] = this.read(field.schema)
      const currentOffset = this.reader.getOffset()
      if (currentOffset > maxEnd) maxEnd = currentOffset
    }

    this.reader.seek(maxEnd)
    return result
  }

  private readUnion(schema: { kind: 'union'; variants: SerializedSchema[] }): unknown {
    const variantIndex = this.reader.readU8()
    const variantSchema = schema.variants[variantIndex]
    if (variantSchema === undefined) {
      throw new Error(`Invalid union variant index: ${variantIndex}`)
    }
    return this.read(variantSchema)
  }

  // ============================================================================
  // Private Skip Methods
  // ============================================================================

  private skipLiteral(schema: { kind: 'literal'; value: string | number | boolean | null }): void {
    if (schema.value === null) return
    if (typeof schema.value === 'string') this.reader.skipString()
    else if (typeof schema.value === 'number') this.reader.skip(8)
    else if (typeof schema.value === 'boolean') this.reader.skip(1)
  }

  private skipNullable(schema: { kind: 'nullable'; inner: SerializedSchema }): void {
    const flag = this.reader.readU8()
    if (flag !== NULL_FLAG) this.skip(schema.inner)
  }

  private skipArray(schema: { kind: 'array'; elements: SerializedSchema }): void {
    const length = this.reader.readU32()
    for (let i = 0; i < length; i++) {
      this.skip(schema.elements)
    }
  }

  private skipTuple(schema: { kind: 'tuple'; elements: SerializedSchema[] }): void {
    for (const element of schema.elements) {
      this.skip(element)
    }
  }

  private skipRecord(): void {
    const offset = this.reader.getOffset()
    const keyCount = this.reader.readU32At(offset)
    const kvDataSize = this.reader.readU32At(offset + 4)

    // Skip: count (4) + kv_data_size (4) + kv_data + hash_index (12 * count)
    this.reader.seek(offset + 8 + kvDataSize + keyCount * 12)
  }

  private skipObject(schema: {
    kind: 'object'
    objectFields: Array<{ key: string; index: number; schema: SerializedSchema }>
  }): void {
    const fieldCount = schema.objectFields.length
    const objectStart = this.reader.getOffset()
    const valuesStart = objectStart + fieldCount * 4

    let maxEnd = valuesStart
    for (let i = 0; i < fieldCount; i++) {
      const relativeOffset = this.reader.readU32At(objectStart + i * 4)
      if (relativeOffset === ABSENT_FIELD_MARKER) continue

      const field = schema.objectFields[i]
      if (!field) throw new Error(`Invalid field index: ${i}`)

      this.reader.seek(valuesStart + relativeOffset)
      this.skip(field.schema)
      const currentOffset = this.reader.getOffset()
      if (currentOffset > maxEnd) maxEnd = currentOffset
    }

    this.reader.seek(maxEnd)
  }

  private skipUnion(schema: { kind: 'union'; variants: SerializedSchema[] }): void {
    const variantIndex = this.reader.readU8()
    const variantSchema = schema.variants[variantIndex]
    if (variantSchema === undefined) {
      throw new Error(`Invalid union variant index: ${variantIndex}`)
    }
    this.skip(variantSchema)
  }
}
