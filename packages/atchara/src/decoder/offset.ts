/**
 * OffsetIndex provides lazy access to the offset table embedded at the end of the binary.
 * The offset table allows O(1) random access to values without deserializing the entire structure.
 */
export class OffsetIndex {
  private view: DataView
  private tableCount: number
  private tableStartOffset: number
  private valueDataLength: number
  private cache: Map<number, number> // schema_index → offset cache

  constructor(binary: Uint8Array) {
    this.view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength)
    this.cache = new Map()

    // Read table count from last 4 bytes
    this.tableCount = this.view.getUint32(binary.length - 4, false)

    // Calculate where offset table starts (each entry is 4 bytes)
    this.tableStartOffset = binary.length - 4 - this.tableCount * 4
    this.valueDataLength = this.tableStartOffset
  }

  /**
   * Get the offset for a given schema index.
   * Uses lazy reading and caching for performance.
   */
  getOffset(schemaIndex: number): number | undefined {
    // Check cache first
    if (this.cache.has(schemaIndex)) {
      return this.cache.get(schemaIndex)
    }

    // Bounds check
    if (schemaIndex >= this.tableCount || schemaIndex < 0) {
      return undefined
    }

    // Direct array access: offset at position schemaIndex
    const offsetPos = this.tableStartOffset + schemaIndex * 4
    const offset = this.view.getUint32(offsetPos, false)

    // Cache for subsequent lookups
    this.cache.set(schemaIndex, offset)
    return offset
  }

  /**
   * Get the length of the value data (before offset table)
   */
  getValueDataLength(): number {
    return this.valueDataLength
  }

  /**
   * Get the total number of offsets in the table
   */
  getCount(): number {
    return this.tableCount
  }
}
