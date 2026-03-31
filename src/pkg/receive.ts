import { EventEmitter } from "events";
import net from "net";
import { Algorithms } from "../core/encrypt";
import { getCommandName } from "../utils/commandDict";

export class ReceivePacketAnalysis extends EventEmitter {
  private algorithms: Algorithms;
  private tcpSocket: net.Socket;
  private userid: number;

  private messageCallback?: (msg: string) => void;
  private disconnectCallback?: () => Promise<void> | void;

  private waiters: Map<number, Array<(value: Buffer | null) => void>> =
    new Map();

  private buffer: Buffer = Buffer.alloc(0);
  private running: boolean = true;

  private logFullPacket: boolean;
  private ignoredCmdIds: Set<number>;

  constructor(
    algorithms: Algorithms,
    tcpSocket: net.Socket,
    userid: number,
    messageCallback?: (msg: string) => void,
    disconnectCallback?: () => Promise<void> | void,
    logFullPacket: boolean = false,
    ignoredCmdIds: number[] = [8002, 3452, 2004, 2001, 41228, 1002, 2002]
  ) {
    super();
    this.algorithms = algorithms;
    this.tcpSocket = tcpSocket;
    this.userid = userid;
    this.messageCallback = messageCallback;
    this.disconnectCallback = disconnectCallback;

    this.logFullPacket = logFullPacket;
    this.ignoredCmdIds = new Set(ignoredCmdIds);

    this._setupSocketListeners();
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

        // 提取命令 ID (offset 5, 长度 4 字节, 大端序)
        const commandValue = packetData.readUInt32BE(5);
        const commandStr = getCommandName(commandValue);

        if (this.messageCallback && !this.ignoredCmdIds.has(commandValue)) {
          if (this.logFullPacket) {
            const cipher = packetData.toString("hex").toUpperCase();
            this.messageCallback(
              `接收|[${commandValue}] ${commandStr}|${cipher}`
            );
          } else {
            this.messageCallback(
              `接收|[${commandValue}] ${commandStr}|length:${packetLength}`
            );
          }
        }

        // 检查是否有等待该命令的 waiter（取队列中第一个）
        const queue = this.waiters.get(commandValue);
        if (queue && queue.length > 0) {
          const resolve = queue[0];
          queue.shift();
          if (queue.length === 0) this.waiters.delete(commandValue);
          resolve(packetData);
        }

        // 1001 命令处理 (密钥初始化)
        if (commandValue === 1001) {
          this.algorithms.InitKey(packetData, this.userid);
          if (this.messageCallback) {
            this.messageCallback("初始化|成功|密钥初始化完成");
          }

          // 提取 Result (offset 13, 长度 4 字节, 大端序)
          const result = packetData.readUInt32BE(13);
          this.algorithms.setResult(result);

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
    return new Promise((resolve) => {
      const wrappedResolve = (val: Buffer | null) => {
        clearTimeout(timer);
        resolve(val);
      };

      const timer = setTimeout(() => {
        const queue = this.waiters.get(commandId);
        if (queue) {
          const idx = queue.indexOf(wrappedResolve);
          if (idx !== -1) queue.splice(idx, 1);
          if (queue.length === 0) this.waiters.delete(commandId);
        }
        if (this.messageCallback) {
          this.messageCallback(`等待|超时|命令 ${commandId} 响应超时`);
        }
        resolve(null);
      }, timeout);

      if (!this.waiters.has(commandId)) {
        this.waiters.set(commandId, []);
      }
      this.waiters.get(commandId)!.push(wrappedResolve);
    });
  }

  stop(): void {
    this.running = false;
    for (const queue of this.waiters.values()) {
      for (const resolve of queue) {
        resolve(null);
      }
    }
    this.waiters.clear();
  }
}
