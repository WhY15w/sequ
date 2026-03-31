import dayjs from "dayjs";
import { SendPacketProcessing } from "../pkg/send";
import { ReceivePacketAnalysis } from "../pkg/receive";
import { Algorithms } from "../core/encrypt";
import { Login } from "../core/login";
import { settings } from "../config/config";
import { getUnityNoticeInfo, parseUnityNotice } from "../utils/fetchData";
import { PacketBuilder } from "../utils/pkgBuilder";

const RECONNECT_BASE_DELAY_MS = 2000;
const RECONNECT_MAX_DELAY_MS = 30000;
const SERVER_CHECK_INTERVAL_MS = 30000;
const KEY_INIT_DELAY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export class TCPService {
  private sender: SendPacketProcessing | null = null;
  private receiver: ReceivePacketAnalysis | null = null;
  private isReady: boolean = false;
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;

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

    const msgCallback = settings.log_callbacks
      ? (msg: string) =>
          console.log(`[${dayjs().format("YYYY-MM-DD HH:mm:ss")}] ${msg}`)
      : undefined;

    this.sender = new SendPacketProcessing(
      algorithms,
      writer,
      settings.service_account_id,
      msgCallback
    );

    this.receiver = new ReceivePacketAnalysis(
      algorithms,
      reader,
      settings.service_account_id,
      msgCallback,
      () => {
        console.log("【系统提示】网络连接已断开，准备重连...");
        this._scheduleReconnect();
      },
      settings.log_full_packet,
      settings.ignored_cmd_ids
    );

    // 等待 1001 密钥初始化封包处理完毕
    await new Promise((resolve) => setTimeout(resolve, KEY_INIT_DELAY_MS));
    this.isReady = true;
    console.log("TCP 服务端初始化完成，密钥就绪！");

    // 心跳
    this._startHeartbeat();
  }

  /**
   * 开启心跳
   */
  private _startHeartbeat(): void {
    this._stopHeartbeat();

    this.heartbeatTimer = setInterval(async () => {
      if (!this.isReady) return;

      try {
        const account = settings.service_account_id;
        const pkt2157 = new PacketBuilder()
          .setCmdId(2157)
          .addU32(1)
          .addU32(account)
          .build();

        await this.sendAndReceive(2157, pkt2157);
        console.log(
          `[${dayjs().format("YYYY-MM-DD HH:mm:ss")}] 【心跳】2157 保持连接成功`
        );
      } catch (error) {
        console.error(
          `[${dayjs().format("YYYY-MM-DD HH:mm:ss")}] 【心跳】发送心跳包失败:`,
          (error as Error).message
        );
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * 停止心跳
   */
  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * 触发重连流程（幂等，重连进行中时忽略重复调用）
   */
  private _scheduleReconnect(): void {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.isReady = false;

    // 停止心跳
    this._stopHeartbeat();

    // 停止旧的接收器，立即释放资源并中止等待中的响应
    if (this.receiver) {
      this.receiver.stop();
      this.receiver = null;
    }
    this.sender = null;

    // 启动重连死循环
    void this._reconnectLoop().catch((error) => {
      console.error("【重连】重连循环发生意外错误:", (error as Error).message);
    });
  }

  /**
   * 重连循环
   */
  private async _reconnectLoop(): Promise<void> {
    while (this.isReconnecting) {
      try {
        let isMaintenance = false;
        try {
          const noticeList = await getUnityNoticeInfo();
          const result = parseUnityNotice(noticeList);
          isMaintenance = result.status === "维护";
        } catch (httpError) {
          console.warn(`【重连】获取公告失败: ${(httpError as Error).message}`);
        }

        if (isMaintenance) {
          console.warn(
            `【重连】服务器维护中，等待 ${
              SERVER_CHECK_INTERVAL_MS / 1000
            }s 后再次检查...`
          );
          this.reconnectAttempts = 0;
          await new Promise((resolve) =>
            setTimeout(resolve, SERVER_CHECK_INTERVAL_MS)
          );
          continue;
        }

        this.reconnectAttempts++;
        await this._doConnect();

        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        console.log("【重连】重连成功！");
        this._notifyReady();
        return;
      } catch (error) {
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
          RECONNECT_MAX_DELAY_MS
        );

        console.error(
          `【重连】第 ${this.reconnectAttempts} 次重连失败: ${
            (error as Error).message
          }`
        );
        console.log(`【重连】等待 ${delay / 1000}s 后进行下一次尝试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private readyWaiters: Array<() => void> = [];

  /** 通知所有等待就绪的调用方 */
  private _notifyReady(): void {
    const waiters = this.readyWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  /** 等待连接就绪（用于重连期间的调用方阻塞） */
  private _waitUntilReady(): Promise<void> {
    return new Promise((resolve) => this.readyWaiters.push(resolve));
  }

  async sendAndReceive(
    cmdId: number,
    hexPacket: string,
    timeout = 5000
  ): Promise<Buffer | null> {
    if (!this.isReady || !this.sender || !this.receiver) {
      this._scheduleReconnect();
      await this._waitUntilReady();
      if (!this.isReady || !this.sender || !this.receiver) {
        throw new Error("TCP 服务端重连失败，无法发送封包");
      }
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
    return receivedData.subarray(17);
  }
}

export const tcpService = new TCPService();
