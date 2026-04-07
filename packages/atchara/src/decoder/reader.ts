/**
 * Low-level byte reading utilities for binary decoding.
 * Shared by value decoder and error decoder.
 */

export class ByteReader {
  private view: DataView
  private offset: number
  private textDecoder: InstanceType<typeof TextDecoder>

  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.offset = 0
    this.textDecoder = new TextDecoder('utf-8')
  }

  /**
   * Reset with new bytes and reset position to start.
   * Avoids allocation overhead by reusing the reader instance.
   */
  reset(bytes: Uint8Array): void {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    this.offset = 0
  }

  /** Seek to a specific offset in the byte stream */
  seek(offset: number): void {
    this.offset = offset
  }

  /** Get current read position */
  getOffset(): number {
    return this.offset
  }

  /** Get number of bytes remaining */
  getRemainingBytes(): number {
    return this.bytes.length - this.offset
  }

  /** Get the underlying bytes */
  getBytes(): Uint8Array {
    return this.bytes
  }

  /** Get the DataView for direct access when needed */
  getView(): DataView {
    return this.view
  }

  // ============================================================================
  // Primitive Reads (all big-endian)
  // ============================================================================

  readU8(): number {
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  readU16(): number {
    const value = this.view.getUint16(this.offset, false)
    this.offset += 2
    return value
  }

  readU32(): number {
    const value = this.view.getUint32(this.offset, false)
    this.offset += 4
    return value
  }

  /** Read u32 at specific offset without advancing position */
  readU32At(offset: number): number {
    return this.view.getUint32(offset, false)
  }

  /** Read u16 at specific offset without advancing position */
  readU16At(offset: number): number {
    return this.view.getUint16(offset, false)
  }

  /** Read u8 at specific offset without advancing position */
  readU8At(offset: number): number {
    return this.view.getUint8(offset)
  }

  readF64(): number {
    const value = this.view.getFloat64(this.offset, false)
    this.offset += 8
    return value
  }

  readBoolean(): boolean {
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value !== 0
  }

  /**
   * Read a length-prefixed string (u32 length + UTF-8 bytes).
   * Uses zero-copy subarray view for efficiency.
   */
  readString(): string {
    const length = this.view.getUint32(this.offset, false)
    this.offset += 4
    const stringBytes = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return this.textDecoder.decode(stringBytes)
  }

  /** Skip past a length-prefixed string without decoding */
  skipString(): void {
    const length = this.view.getUint32(this.offset, false)
    this.offset += 4 + length
  }

  /** Skip n bytes */
  skip(n: number): void {
    this.offset += n
  }

  /**
   * Read raw bytes as a subarray (zero-copy view).
   * Advances position by length.
   */
  readBytes(length: number): Uint8Array {
    const bytes = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return bytes
  }

  /**
   * Decode a string from bytes at specific offset with given length.
   * Does not advance position.
   */
  decodeStringAt(offset: number, length: number): string {
    const stringBytes = this.bytes.subarray(offset, offset + length)
    return this.textDecoder.decode(stringBytes)
  }
}
