import { Algorithms } from "../core/encrypt";
import net from "net";
import { HexFormatter } from "../utils/format";

type MessageCallback = (message: string) => void;

/**
 * 发送数据包处理类
 */
export class SendPacketProcessing {
  private algorithms: Algorithms;
  private writer: net.Socket;
  private messageCallback: MessageCallback | null;

  private length: Buffer | null = null;
  private version: number | null = null;
  private cmdId: Buffer | null = null;
  private userId: Buffer;
  private result: Buffer | null = null;
  private body: Buffer | null = null;

  constructor(
    algorithms: Algorithms,
    writer: net.Socket,
    userid: number,
    messageCallback?: MessageCallback
  ) {
    this.algorithms = algorithms;
    this.writer = writer;
    this.messageCallback = messageCallback || null;

    // 将用户ID转换为4字节大端序Buffer
    this.userId = Buffer.allocUnsafe(4);
    this.userId.writeUInt32BE(userid, 0);
  }

  /**
   * 解析数据包
   */
  parsePacket(packet: Buffer): this {
    if (packet.length >= 17) {
      this.length = packet.slice(0, 4);
      this.version = packet[4];
      this.cmdId = packet.slice(5, 9);
      this.result = packet.slice(13, 17);
      this.body = packet.slice(17);

      // 使用格式化工具打印调试信息
      if (process.env.DEBUG_PACKET === "true") {
        console.log("=== 数据包解析 ===");
        console.log(
          `Length: ${this.length.readUInt32BE(0)} (0x${HexFormatter.format08X(
            this.length.readUInt32BE(0)
          )})`
        );
        console.log(
          `Version: ${this.version} (0x${HexFormatter.format02X(this.version)})`
        );
        console.log(
          `CmdId: ${this.cmdId.readUInt32BE(0)} (0x${HexFormatter.format08X(
            this.cmdId.readUInt32BE(0)
          )})`
        );
        console.log(
          `UserId: ${this.userId.readUInt32BE(0)} (0x${HexFormatter.format08X(
            this.userId.readUInt32BE(0)
          )})`
        );
        console.log(
          `Result: ${this.result.readUInt32BE(0)} (0x${HexFormatter.format08X(
            this.result.readUInt32BE(0)
          )})`
        );
        console.log(`Body: ${this.body.toString("hex").toUpperCase()}`);
        console.log(
          `Body (formatted): ${HexFormatter.formatBuffer(this.body)}`
        );
      }
    }

    return this;
  }

  /**
   * 组装数据包
   */
  groupPacket(packet: string): Buffer | null {
    try {
      // 移除可能的空格和换行符
      packet = packet.replace(/\s+/g, "");

      // 验证十六进制格式
      if (!/^[0-9A-Fa-f]+$/.test(packet)) {
        throw new Error("包含非十六进制字符");
      }

      const packetBytes = Buffer.from(packet, "hex");

      // 解析数据包各个字段
      this.parsePacket(packetBytes);

      if (
        !this.cmdId ||
        !this.body ||
        this.length === null ||
        this.version === null
      ) {
        throw new Error("数据包解析失败：字段提取不完整");
      }

      const cmdIdValue = this.cmdId.readUInt32BE(0);
      const resultValue = this.algorithms.calculateResult(
        cmdIdValue,
        this.body
      );

      // 将Result值转换为4字节Buffer（使用大端序）
      const resultBuffer = Buffer.allocUnsafe(4);
      resultBuffer.writeUInt32BE(resultValue, 0);

      // 重新组装完整数据包 (包含计算出的 Result)
      const assembledPacket = Buffer.concat([
        this.length,
        Buffer.from([this.version]),
        this.cmdId,
        this.userId,
        resultBuffer,
        this.body,
      ]);

      return assembledPacket;
    } catch (error) {
      if (this.messageCallback) {
        this.messageCallback("发送|错误|封包数据格式错误");
      }
      console.error("组装数据包失败:", error);
      return null;
    }
  }

  /**
   * 发送数据包
   */
  async sendPacket(packedMessage: string): Promise<boolean> {
    try {
      const assembledPacket = this.groupPacket(packedMessage);

      if (!assembledPacket) {
        return false;
      }

      if (this.messageCallback) {
        this.messageCallback(
          `发送|未加密|${assembledPacket.toString("hex").toUpperCase()}`
        );
      }

      return await this.writeToSocket(assembledPacket);
    } catch (error) {
      console.error("发送数据包失败:", error);
      if (this.messageCallback) {
        this.messageCallback(`发送|错误|${(error as Error).message}`);
      }
      return false;
    }
  }

  /**
   * 写入Socket
   */
  private writeToSocket(data: Buffer): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.writer || this.writer.destroyed) {
        reject(new Error("Socket连接已断开"));
        return;
      }

      this.writer.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(true);
        }
      });
    });
  }

  /**
   * 获取格式化的数据包信息
   */
  getFormattedPacketInfo(): string | null {
    if (
      !this.length ||
      this.version === null ||
      !this.cmdId ||
      !this.result ||
      !this.body
    ) {
      return null;
    }

    const lengthValue = this.length.readUInt32BE(0);
    const cmdIdValue = this.cmdId.readUInt32BE(0);
    const userIdValue = this.userId.readUInt32BE(0);
    const resultValue = this.result.readUInt32BE(0);

    return [
      "=== 数据包信息 ===",
      `Length:  ${lengthValue
        .toString()
        .padStart(10)} (0x${HexFormatter.format08X(lengthValue)})`,
      `Version: ${this.version
        .toString()
        .padStart(10)} (0x${HexFormatter.format02X(this.version)})`,
      `CmdId:   ${cmdIdValue
        .toString()
        .padStart(10)} (0x${HexFormatter.format08X(cmdIdValue)})`,
      `UserId:  ${userIdValue
        .toString()
        .padStart(10)} (0x${HexFormatter.format08X(userIdValue)})`,
      `Result:  ${resultValue
        .toString()
        .padStart(10)} (0x${HexFormatter.format08X(resultValue)})`,
      `Body:    ${HexFormatter.formatBuffer(this.body, 4, " ")}`,
    ].join("\n");
  }

  setMessageCallback(callback: MessageCallback): void {
    this.messageCallback = callback;
  }

  isConnected(): boolean {
    return this.writer && !this.writer.destroyed;
  }
}
