import fs from "fs";
import { EventEmitter } from "events";
import net from "net";
import { Algorithms } from "../core/encrypt";
import path from "path";

export class ReceivePacketAnalysis extends EventEmitter {
  private algorithms: Algorithms;
  private tcpSocket: net.Socket;
  private userid: number;

  private messageCallback?: (msg: string) => void;
  private disconnectCallback?: () => Promise<void> | void;

  private commandDict: Record<string, string> = {};
  private currentCommandId: number | null = null;
  private packetData: Buffer | null = null;
  private dataReadyResolve: ((value: Buffer | null) => void) | null = null;

  private buffer: Buffer = Buffer.alloc(0);
  private running: boolean = true;

  constructor(
    algorithms: Algorithms,
    tcpSocket: net.Socket,
    userid: number,
    messageCallback?: (msg: string) => void,
    disconnectCallback?: () => Promise<void> | void
  ) {
    super();
    this.algorithms = algorithms;
    this.tcpSocket = tcpSocket;
    this.userid = userid;
    this.messageCallback = messageCallback;
    this.disconnectCallback = disconnectCallback;

    this._loadCommandDict();
    this._setupSocketListeners();
  }

  private _loadCommandDict(): void {
    try {
      const filePath = path.resolve(__dirname, "../config/Command.json");
      const data = fs.readFileSync(filePath, "utf-8");

      const parsed = JSON.parse(data);
      for (const key in parsed) {
        this.commandDict[key] = Array.isArray(parsed[key])
          ? parsed[key][0]
          : parsed[key];
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.error("Command.json 文件不存在");
      }
    }
  }

  private _setupSocketListeners(): void {
    if (!this.tcpSocket || this.tcpSocket.destroyed) {
      if (this.messageCallback)
        this.messageCallback("连接|错误|未连接到服务器");
      return;
    }

    this.tcpSocket.on("data", (data: Buffer) => {
      if (!this.running) return;
      this.buffer = Buffer.concat([this.buffer, data]);
      this._processBuffer();
    });

    this.tcpSocket.on("error", async (error: Error) => {
      if (this.messageCallback) {
        this.messageCallback(`接收|错误|${error.message}`);
      }
      this.running = false;
      if (this.disconnectCallback) {
        await this.disconnectCallback();
      }
      this.emit("error", error);
    });

    this.tcpSocket.on("close", async () => {
      if (this.running && this.messageCallback) {
        this.messageCallback("连接|断开|服务器断开连接");
      }
      this.running = false;
      if (this.disconnectCallback) {
        await this.disconnectCallback();
      }
      this.emit("close");
    });
  }

  private _processBuffer(): void {
    while (this.buffer.length >= 4) {
      try {
        // 读取封包长度 (大端序, 4字节)
        const packetLength = this.buffer.readUInt32BE(0);

        if (this.buffer.length < packetLength) {
          break; // 数据包不完整，等待下一次 data 事件
        }

        // 截取当前封包数据
        const packetData = this.buffer.slice(0, packetLength);
        this.buffer = this.buffer.slice(packetLength);

        const cipher = packetData.toString("hex").toUpperCase();

        // 提取命令 ID (offset 5, 长度 4 字节, 大端序)
        const commandValue = packetData.readUInt32BE(5);
        const commandStr =
          this.commandDict[commandValue.toString()] || "Unknown Command";

        if (this.messageCallback) {
          this.messageCallback(`接收|${commandStr}|${cipher}`);
        }

        // 检查是否为正在等待的封包
        if (commandValue === this.currentCommandId) {
          this.packetData = packetData;
          if (this.dataReadyResolve) {
            this.dataReadyResolve(packetData);
            this.dataReadyResolve = null;
          }
        }

        // 1001 命令处理 (密钥初始化)
        if (commandValue === 1001) {
          this.algorithms.InitKey(packetData, this.userid);
          if (this.messageCallback) {
            this.messageCallback("初始化|成功|密钥初始化完成");
          }

          // 提取 Result (offset 13, 长度 4 字节, 大端序)
          const result = packetData.readUInt32BE(13);
          (this.algorithms as any).result = result; // 需要确保 algorithms 有 result 属性

          if (this.messageCallback) {
            this.messageCallback(`初始化|更新|Result: ${result}`);
          }
        }

        // 触发通用事件
        this.emit("packet", {
          commandId: commandValue,
          commandName: commandStr,
          packetData: packetData,
        });
      } catch (error) {
        if (this.messageCallback) {
          this.messageCallback(`接收|错误|${(error as Error).message}`);
        }

        this.buffer = Buffer.alloc(0);
        break;
      }
    }
  }

  /**
   * 等待特定的返回封包
   * @param commandId 命令 ID
   * @param timeout 超时时间 (默认 5000 毫秒)
   */
  async waitForSpecificData(
    commandId: number,
    timeout: number = 5000
  ): Promise<Buffer | null> {
    this.currentCommandId = commandId;
    this.packetData = null;

    return new Promise((resolve) => {
      this.dataReadyResolve = resolve;

      // 设置超时定时器
      const timer = setTimeout(() => {
        if (this.currentCommandId === commandId) {
          if (this.messageCallback) {
            this.messageCallback(`等待|超时|命令 ${commandId} 响应超时`);
          }
          this.currentCommandId = null;
          this.dataReadyResolve = null;
          resolve(null);
        }
      }, timeout);

      // 包装原始的 resolve 以清除定时器
      const originalResolve = this.dataReadyResolve;
      this.dataReadyResolve = (val: Buffer | null) => {
        clearTimeout(timer);
        this.currentCommandId = null;
        if (originalResolve) originalResolve(val);
      };
    });
  }

  stop(): void {
    this.running = false;
    if (this.dataReadyResolve) {
      this.dataReadyResolve(null);
      this.dataReadyResolve = null;
    }
  }
}
