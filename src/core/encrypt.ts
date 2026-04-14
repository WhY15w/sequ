import crypto from 'crypto';

export class Algorithms {
  private key: Buffer;
  private result: number;

  constructor() {
    this.key = Buffer.from('!crAckmE4nOthIng:-)', 'utf-8');
    this.result = 0;
  }

  /** 加密 */
  encrypt(plain: Buffer): Buffer {
    const cipherLen = plain.length + 1;
    plain = plain.subarray(4); // 跳过前4字节

    const cipher = Buffer.alloc(plain.length + 1);
    let j = 0;
    let needBecomeZero = false;

    // 注意：key 每轮重置时，key[0] 会被使用两次（协议行为，不可简化）
    for (let i = 0; i < plain.length; i++) {
      if (j === 1 && needBecomeZero) {
        j = 0;
        needBecomeZero = false;
      }
      if (j === this.key.length) {
        j = 0;
        needBecomeZero = true;
      }
      cipher[i] = plain[i]! ^ this.key[j]!;
      j++;
    }
    cipher[cipher.length - 1] = 0;

    // 循环左移5位，右移3位
    for (let i = cipher.length - 1; i > 0; i--) {
      cipher[i] = ((cipher[i]! << 5) & 0xff) | (cipher[i - 1]! >> 3);
    }
    cipher[0] = ((cipher[0]! << 5) & 0xff) | 3;

    const result =
      (this.key[plain.length % this.key.length]! * 13) % cipher.length;

    const rotated = Buffer.concat([
      cipher.subarray(result),
      cipher.subarray(0, result),
    ]);

    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(cipherLen);
    return Buffer.concat([lenBuf, rotated]);
  }

  /** 解密 */
  decrypt(cipher: Buffer): Buffer {
    const plainLen = cipher.length - 1;
    cipher = cipher.subarray(4);

    const result =
      (this.key[(cipher.length - 1) % this.key.length]! * 13) % cipher.length;
    const rotated = Buffer.concat([
      cipher.subarray(cipher.length - result),
      cipher.subarray(0, cipher.length - result),
    ]);

    const plain = Buffer.alloc(rotated.length - 1);

    for (let i = 0; i < rotated.length - 1; i++) {
      plain[i] = ((rotated[i]! >> 5) & 0xff) | ((rotated[i + 1]! << 3) & 0xff);
    }

    let j = 0;
    let needBecomeZero = false;
    // 注意：key 每轮重置时，key[0] 会被使用两次（协议行为，不可简化）
    for (let i = 0; i < plain.length; i++) {
      if (j === 1 && needBecomeZero) {
        j = 0;
        needBecomeZero = false;
      }
      if (j === this.key.length) {
        j = 0;
        needBecomeZero = true;
      }
      plain[i]! ^= this.key[j]!;
      j++;
    }

    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(plainLen);
    return Buffer.concat([lenBuf, plain]);
  }

  /** 初始化 Key */
  InitKey(packetData: Buffer, userId: number): void {
    const lastFourBytes = packetData.subarray(packetData.length - 4);
    const lastUint = lastFourBytes.readUInt32BE();
    const xorResult = lastUint ^ userId;
    const xorStr = xorResult.toString();
    const md5Hash = crypto.createHash('md5').update(xorStr).digest('hex');
    const newKey = md5Hash.slice(0, 10);
    this.key = Buffer.from(newKey, 'utf-8');
    console.log('Updated encryption key to:', this.key.toString());
  }

  /** 设置 result 初始值（由 1001 握手包提供） */
  setResult(value: number): void {
    this.result = value;
  }

  /** 计算 MSerial */
  private MSerial(a: number, b: number, c: number, d: number): number {
    return a + c + Math.trunc(a / -3) + (b % 17) + (d % 23) + 120;
  }

  /** 计算结果 */
  calculateResult(cmdId: number, body: Buffer): number {
    let crc8_val = 0;
    if (cmdId > 1000) {
      for (const byte of body) {
        crc8_val ^= byte;
      }
    }
    const newResult = this.MSerial(this.result, body.length, crc8_val, cmdId);
    this.result = newResult;
    return newResult;
  }
}
