import { settings } from '../config/config.js';
import { Algorithms } from '../core/encrypt.js';
import { Login } from '../core/login.js';
import { ReceivePacketAnalysis } from '../pkg/receive.js';
import { SendPacketProcessing } from '../pkg/send.js';
import { getUnityNoticeInfo, parseUnityNotice } from '../utils/fetchData.js';
import { PacketBuilder } from '../utils/pkgBuilder.js';
import { sendTextMessage } from '../utils/webHook/feishu.js';
import dayjs from 'dayjs';

const RECONNECT_BASE_DELAY_MS = 4000;
const RECONNECT_MAX_DELAY_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const SERVER_CHECK_INTERVAL_MS = 60000;
const KEY_INIT_DELAY_MS = 5000;
const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

export class TCPService {
  private sender: SendPacketProcessing | null = null;
  private receiver: ReceivePacketAnalysis | null = null;
  private isReady: boolean = false;
  private isReconnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectFailure: Error | null = null;

  private _notifyReconnectFailure(message: string): void {
    const task = sendTextMessage(message);
    if (!task) return;

    void task.catch((err) => {
      console.error('【飞书】告警发送失败:', (err as Error).message);
    });
  }

  /**
   * 初始化 TCP 连接并完成登录和密钥交换
   */
  async init(): Promise<void> {
    try {
      await this._doConnect();
    } catch (error) {
      console.error(
        `初始化连接失败: ${(error as Error).message}，准备进入重连流程...`,
      );
      this._scheduleReconnect();
      await this._waitUntilReady();
    }
  }

  /**
   * 建立 TCP 连接、登录并等待密钥初始化完成
   */
  private async _doConnect(): Promise<void> {
    const algorithms = new Algorithms();
    const login = new Login();

    console.log('正在登录 TCP 服务器...');

    const { reader, writer } = await login.login(
      settings.service_account_id,
      settings.service_account_password,
    );

    const msgCallback = settings.log_callbacks
      ? (msg: string) =>
          console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ${msg}`)
      : undefined;

    this.sender = new SendPacketProcessing(
      algorithms,
      writer,
      settings.service_account_id,
      msgCallback,
    );

    this.receiver = new ReceivePacketAnalysis(
      algorithms,
      reader,
      settings.service_account_id,
      msgCallback,
      () => {
        console.log('【系统提示】网络连接已断开，准备重连...');
        this._scheduleReconnect();
      },
      settings.log_full_packet,
      settings.ignored_cmd_ids,
    );

    // 等待 1001 密钥初始化封包处理完毕
    await new Promise((resolve) => setTimeout(resolve, KEY_INIT_DELAY_MS));
    this.isReady = true;
    console.log('TCP 服务端初始化完成，密钥就绪！');

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

      // 连接断开时不再发送心跳，直接进入重连流程。
      if (!this.sender || !this.sender.isConnected()) {
        console.warn(
          `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 【心跳】检测到 Socket 断开，跳过心跳并触发重连`,
        );
        this._scheduleReconnect();
        return;
      }

      try {
        const account = settings.service_account_id;
        const pkt2157 = new PacketBuilder()
          .setCmdId(2157)
          .addU32(1)
          .addU32(account)
          .build();

        await this.sendAndReceive(pkt2157);
        console.log(
          `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 【心跳】2157 保持连接成功`,
        );
      } catch (error) {
        console.error(
          `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 【心跳】发送心跳包失败:`,
          (error as Error).message,
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
    this.reconnectFailure = null;

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
      console.error('【重连】重连循环发生意外错误:', (error as Error).message);
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
          isMaintenance = result.status === '维护';
        } catch (httpError) {
          console.warn(`【重连】获取公告失败: ${(httpError as Error).message}`);
        }

        if (isMaintenance) {
          console.warn(
            `【重连】服务器维护中，等待 ${
              SERVER_CHECK_INTERVAL_MS / 1000
            }s 后再次检查...`,
          );
          this.reconnectAttempts = 0;
          await new Promise((resolve) =>
            setTimeout(resolve, SERVER_CHECK_INTERVAL_MS),
          );
          continue;
        }

        this.reconnectAttempts++;

        // 重连前清理旧资源
        if (this.receiver) {
          this.receiver.stop();
          this.receiver = null;
        }
        this.sender = null;

        await this._doConnect();

        this.reconnectAttempts = 0;
        this.isReconnecting = false;
        console.log('【重连】重连成功！');
        this._notifyReady();
        return;
      } catch (error) {
        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          const finalError = new Error(
            `TCP 服务端重连失败，已连续尝试 ${MAX_RECONNECT_ATTEMPTS} 次，已停止自动重连`,
          );
          const finalAlert =
            `【seer-query 告警】重连终止\n` +
            `时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n` +
            `原因: ${finalError.message}`;

          console.error(`【重连】${finalError.message}`);
          this._notifyReconnectFailure(finalAlert);
          this.isReconnecting = false;
          this.isReady = false;
          this.reconnectFailure = finalError;
          this._notifyFailed(finalError);
          throw finalError;
        }

        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
          RECONNECT_MAX_DELAY_MS,
        );

        console.error(
          `【重连】第 ${this.reconnectAttempts} 次重连失败: ${
            (error as Error).message
          }`,
        );
        console.log(`【重连】等待 ${delay / 1000}s 后进行下一次尝试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private readyWaiters: Array<{
    resolve: () => void;
    reject: (reason?: any) => void;
  }> = [];

  /** 通知所有等待就绪的调用方 */
  private _notifyReady(): void {
    this.reconnectFailure = null;
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.resolve();
  }

  /** 通知所有等待中的调用方：重连失败 */
  private _notifyFailed(error: Error): void {
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  /** 等待连接就绪（用于重连期间的调用方阻塞） */
  private _waitUntilReady(): Promise<void> {
    if (this.isReady) {
      return Promise.resolve();
    }

    if (!this.isReconnecting && this.reconnectFailure) {
      return Promise.reject(this.reconnectFailure);
    }

    return new Promise((resolve, reject) =>
      this.readyWaiters.push({ resolve, reject }),
    );
  }

  /**
   * 发送封包并等待响应
   * @param pktOrHex 封包对象或已构建的十六进制字符串
   * @param timeout 等待响应的超时时间（毫秒），默认为 5000ms
   * @returns 响应数据的 Buffer（已去掉 17 字节头部），如果超时或发生错误则返回 null
   */
  async sendAndReceive(
    pktOrHex: PacketBuilder | string,
    timeout = 5000,
  ): Promise<Buffer | null> {
    const hexPacket =
      typeof pktOrHex === 'string' ? pktOrHex : pktOrHex.build();
    const packetBuf = Buffer.from(hexPacket, 'hex');
    const cmdId = packetBuf.readUInt32BE(5);

    const ensureReady = async () => {
      if (!this.isReady || !this.sender || !this.receiver) {
        this._scheduleReconnect();
        await this._waitUntilReady();
        if (!this.isReady || !this.sender || !this.receiver) {
          throw new Error('TCP 服务端重连失败，无法发送封包');
        }
      }
    };

    const sendOnce = async (): Promise<Buffer | null> => {
      if (!this.sender || !this.receiver) {
        throw new Error('TCP 服务端未初始化');
      }

      const receivePromise = this.receiver.waitForSpecificData(cmdId, timeout);
      const sendSuccess = await this.sender.sendPacket(hexPacket);

      if (!sendSuccess) {
        throw new Error('封包发送失败');
      }

      const receivedData = await receivePromise;
      if (!receivedData) return null;

      // 截取 body 部分（去掉前 17 字节头部）
      return receivedData.subarray(17);
    };

    await ensureReady();

    try {
      return await sendOnce();
    } catch (error) {
      const message = (error as Error).message;
      const isDisconnectError =
        message.includes('Socket连接已断开') ||
        message.includes('封包发送失败');

      if (!isDisconnectError) {
        throw error;
      }

      console.warn(`【发送】检测到连接异常，开始重连并重试: ${message}`);
      this._scheduleReconnect();
      await this._waitUntilReady();

      if (!this.isReady || !this.sender || !this.receiver) {
        throw new Error('TCP 服务端重连失败，无法重试发送封包');
      }

      return sendOnce();
    }
  }

  /**
   * 关闭服务
   */
  shutdown(): void {
    this.isReconnecting = false;
    this.isReady = false;
    this.reconnectFailure = new Error('TCP 服务已关闭');
    this._stopHeartbeat();

    if (this.receiver) {
      this.receiver.stop();
      this.receiver = null;
    }
    this.sender = null;

    // 通知所有等待中的调用方
    const waiters = this.readyWaiters.splice(0);
    for (const waiter of waiters) waiter.reject(this.reconnectFailure);

    console.log('TCP 服务已关闭');
  }
}

export const tcpService = new TCPService();
