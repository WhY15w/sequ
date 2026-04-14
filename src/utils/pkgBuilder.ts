import { HexFormatter } from './format.js';

/**
 * 数据包构建工具类
 */
export class PacketBuilder {
  private length: number = 0;
  private version: number = 0x31; // 默认版本号 49 (十六进制 0x31)
  private cmdId: number = 0;
  private userId: number = 0; // 占位符，SendPacketProcessing 中会重新计算写入
  private result: number = 0; // 占位符，SendPacketProcessing 中会重新计算写入
  private bodyParts: Buffer[] = [];

  setCmdId(cmdId: number): this {
    this.cmdId = cmdId;
    return this;
  }

  setVersion(version: number): this {
    this.version = version;
    return this;
  }

  /**
   * 添加 4 字节整数到包体 (大端序)
   */
  addU32(value: number, debug: boolean = false): this {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt32BE(value, 0);
    this.bodyParts.push(buffer);

    if (debug) {
      console.log(`添加 UInt32: ${value} (0x${HexFormatter.format08X(value)})`);
    }
    return this;
  }

  /**
   * 添加 2 字节整数到包体 (大端序)
   */
  addU16(value: number, debug: boolean = false): this {
    const buffer = Buffer.allocUnsafe(2);
    buffer.writeUInt16BE(value, 0);
    this.bodyParts.push(buffer);

    if (debug) {
      console.log(`添加 UInt16: ${value} (0x${HexFormatter.format04X(value)})`);
    }
    return this;
  }

  /**
   * 添加 1 字节整数到包体
   */
  addU8(value: number, debug: boolean = false): this {
    const buffer = Buffer.allocUnsafe(1);
    buffer.writeUInt8(value, 0);
    this.bodyParts.push(buffer);

    if (debug) {
      console.log(`添加 UInt8: ${value} (0x${HexFormatter.format02X(value)})`);
    }
    return this;
  }

  /**
   * 添加原始字节 Buffer 到包体
   */
  addBytes(bytes: Buffer): this {
    this.bodyParts.push(bytes);
    return this;
  }

  /**
   * 添加十六进制字符串到包体
   */
  addHex(hex: string): this {
    this.bodyParts.push(Buffer.from(hex, 'hex'));
    return this;
  }

  /**
   * 构建完整数据包的十六进制字符串（供 SendPacketProcessing.sendPacket 使用）
   */
  build(debug: boolean = false): string {
    // 计算包体总长度
    const bodyLength = this.bodyParts.reduce(
      (sum, part) => sum + part.length,
      0,
    );

    // 总长度 = 头部(17字节) + 包体长度
    this.length = 17 + bodyLength;

    const lengthBuffer = Buffer.allocUnsafe(4);
    lengthBuffer.writeUInt32BE(this.length, 0);

    const versionBuffer = Buffer.from([this.version]);

    const cmdIdBuffer = Buffer.allocUnsafe(4);
    cmdIdBuffer.writeUInt32BE(this.cmdId, 0);

    const userIdBuffer = Buffer.allocUnsafe(4);
    userIdBuffer.writeUInt32BE(this.userId, 0);

    const resultBuffer = Buffer.allocUnsafe(4);
    resultBuffer.writeUInt32BE(this.result, 0);

    const body =
      this.bodyParts.length > 0
        ? Buffer.concat(this.bodyParts)
        : Buffer.alloc(0);

    // 组装完整数据包 (包含占位符的 17 字节 Header + Body)
    const packet = Buffer.concat([
      lengthBuffer,
      versionBuffer,
      cmdIdBuffer,
      userIdBuffer,
      resultBuffer,
      body,
    ]);

    if (debug) {
      console.log('=== 构建的数据包 ===');
      console.log(`Length:  0x${HexFormatter.format08X(this.length)}`);
      console.log(`Version: 0x${HexFormatter.format02X(this.version)}`);
      console.log(`CmdId:   0x${HexFormatter.format08X(this.cmdId)}`);
      console.log(`UserId:  0x${HexFormatter.format08X(this.userId)} (占位)`);
      console.log(`Result:  0x${HexFormatter.format08X(this.result)} (占位)`);
      console.log(`Body:    ${HexFormatter.formatBuffer(body, 4, ' ')}`);
      console.log(`完整包:  ${HexFormatter.formatBuffer(packet, 4, ' ')}`);
    }

    return packet.toString('hex').toUpperCase();
  }

  /**
   * 预览数据包基础信息（不实际构建）
   */
  preview(): string {
    const bodyLength = this.bodyParts.reduce(
      (sum, part) => sum + part.length,
      0,
    );
    const totalLength = 17 + bodyLength;

    return [
      '=== 数据包预览 ===',
      `总长度: ${totalLength} 字节`,
      `版本号: ${this.version} (0x${HexFormatter.format02X(this.version)})`,
      `命令ID: ${this.cmdId} (0x${HexFormatter.format08X(this.cmdId)})`,
      `包体长度: ${bodyLength} 字节`,
    ].join('\n');
  }

  /**
   * 重置 Builder 状态
   */
  reset(): this {
    this.length = 0;
    this.version = 0x31;
    this.cmdId = 0;
    this.userId = 0;
    this.result = 0;
    this.bodyParts = [];
    return this;
  }
}
