/**
 * 二进制读取工具类 - 封装缓冲读取逻辑，自动管理偏移量
 */
class BufferReader {
  private buffer: Buffer;
  private _offset: number;

  constructor(buffer: Buffer) {
    this.buffer = buffer;
    this._offset = 0;
  }

  readUInt32(): number {
    this.checkRemaining(4, 'readUInt32');
    const value = this.buffer.readUInt32BE(this._offset);
    this._offset += 4;
    return value;
  }

  readUInt16(): number {
    this.checkRemaining(2, 'readUInt16');
    const value = this.buffer.readUInt16BE(this._offset);
    this._offset += 2;
    return value;
  }

  readUInt8(): number {
    this.checkRemaining(1, 'readUInt8');
    const value = this.buffer.readUInt8(this._offset);
    this._offset += 1;
    return value;
  }

  readString(length: number): string {
    this.checkRemaining(length, 'readString');
    const end = this._offset + length;
    const strBuffer = this.buffer.slice(this._offset, end);
    this._offset = end;
    // eslint-disable-next-line no-control-regex
    return strBuffer.toString('utf8').replace(/\u0000/g, '');
  }

  skip(bytes: number): void {
    this.checkRemaining(bytes, 'skip');
    this._offset += bytes;
  }

  hasRemaining(size?: number): boolean {
    if (size === undefined) {
      return this._offset < this.buffer.length;
    }
    return this._offset + size <= this.buffer.length;
  }

  getRemainingBytes(): number {
    return Math.max(0, this.buffer.length - this._offset);
  }

  getOffset(): number {
    return this._offset;
  }

  setOffset(offset: number): void {
    if (offset < 0 || offset > this.buffer.length) {
      throw new Error(
        `Invalid offset: ${offset}, buffer length: ${this.buffer.length}`,
      );
    }
    this._offset = offset;
  }

  getLength(): number {
    return this.buffer.length;
  }

  private checkRemaining(requiredBytes: number, operation: string): void {
    const remaining = this.getRemainingBytes();
    if (remaining < requiredBytes) {
      throw new Error(
        `Buffer underflow in ${operation}: required ${requiredBytes} bytes, but only ${remaining} bytes remaining (offset: ${this._offset}, length: ${this.buffer.length})`,
      );
    }
  }

  safeRead<T>(readFn: () => T, defaultValue: T): T {
    try {
      return readFn();
    } catch {
      return defaultValue;
    }
  }

  reset(): void {
    this._offset = 0;
  }
}

/**
 * 位操作工具类
 */
class BitUtil {
  static getBit(value: number, bitIndex: number): number {
    return (value >> bitIndex) & 1;
  }

  static setBit(value: number, bitIndex: number, bitValue: number): number {
    if (bitValue === 1) {
      return value | (1 << bitIndex);
    } else {
      return value & ~(1 << bitIndex);
    }
  }

  static toggleBit(value: number, bitIndex: number): number {
    return value ^ (1 << bitIndex);
  }

  static isBitSet(value: number, bitIndex: number): boolean {
    return ((value >> bitIndex) & 1) === 1;
  }

  static getBits(value: number, startBit: number, endBit: number): number {
    const mask = (1 << (endBit - startBit)) - 1;
    return (value >> startBit) & mask;
  }
}

export { BufferReader, BitUtil };
