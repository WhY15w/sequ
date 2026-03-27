import { SendPacketProcessing } from "../pkg/send";
import { ReceivePacketAnalysis } from "../pkg/receive";
import { Algorithms } from "../core/encrypt";
import { Login } from "../core/login";
import { settings } from "../config/config";

const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const KEY_INIT_DELAY_MS = 5000;

export class TCPService {
  private sender: SendPacketProcessing | null = null;
  private receiver: ReceivePacketAnalysis | null = null;
  private isReady: boolean = false;
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;

  /**
   * 初始化 TCP 连接并完成登录和密钥交换
   */
  async init(): Promise<void> {
    await this._doConnect();
  }

  /**
   * 建立 TCP 连接、登录并等待密钥初始化完成
   */
  private async _doConnect(): Promise<void> {
    const algorithms = new Algorithms();
    const login = new Login();

    console.log("正在登录 TCP 服务器...");

    const { reader, writer } = await login.login(
      settings.service_account_id,
      settings.service_account_password
    );

    this.sender = new SendPacketProcessing(
      algorithms,
      writer,
      settings.service_account_id,
      (msg) => console.log(msg)
    );

    this.receiver = new ReceivePacketAnalysis(
      algorithms,
      reader,
      settings.service_account_id,
      (msg) => console.log(msg),
      () => {
        console.log("【系统提示】网络连接已断开，准备重连...");
        this._scheduleReconnect();
      }
    );

    // 等待 1001 密钥初始化封包处理完毕
    await new Promise((resolve) => setTimeout(resolve, KEY_INIT_DELAY_MS));
    this.isReady = true;
    console.log("TCP 服务端初始化完成，密钥就绪！");
  }

  /**
   * 触发重连流程（幂等，重连进行中时忽略重复调用）
   */
  private _scheduleReconnect(): void {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.isReady = false;

    // 停止旧的接收器，立即释放资源并中止等待中的响应
    if (this.receiver) {
      this.receiver.stop();
      this.receiver = null;
    }
    this.sender = null;

    void this._reconnectLoop().catch((error) => {
      console.error("【重连】重连循环发生意外错误:", (error as Error).message);
    });
  }

  /**
   * 指数退避重连循环（无限次重试，延迟上限 30s）
   */
  private async _reconnectLoop(): Promise<void> {
    while (true) {
      this.reconnectAttempts++;
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
        RECONNECT_MAX_DELAY_MS
      );

      console.log(
        `【重连】第 ${this.reconnectAttempts} 次重连尝试，等待 ${delay / 1000}s...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      try {
        await this._doConnect();
        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        console.log("【重连】重连成功！");
        return;
      } catch (error) {
        console.error(
          `【重连】第 ${this.reconnectAttempts} 次重连失败:`,
          (error as Error).message
        );
      }
    }
  }

  async sendAndReceive(
    cmdId: number,
    hexPacket: string,
    timeout = 5000
  ): Promise<Buffer | null> {
    if (!this.isReady || !this.sender || !this.receiver) {
      throw new Error("TCP 服务端暂未连接或准备就绪");
    }

    const receivePromise = this.receiver.waitForSpecificData(cmdId, timeout);
    const sendSuccess = await this.sender.sendPacket(hexPacket);

    if (!sendSuccess) {
      throw new Error("封包发送失败");
    }

    const receivedData = await receivePromise;
    if (!receivedData) {
      return null;
    }
    // 截取 body 部分（去掉前 17 字节头部）
    const body = receivedData.subarray(17);

    return body;
  }
}

export const tcpService = new TCPService();
