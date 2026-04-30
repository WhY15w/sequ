import { settings } from '../config/config.js';
import { Algorithms } from '../core/encrypt.js';
import { Login } from '../core/login.js';
import { ReceivePacketAnalysis } from '../pkg/receive.js';
import { SendPacketProcessing } from '../pkg/send.js';
import {
  getUnityNoticeInfo,
  parseUnityNotice,
} from '../utils/http/fetchData.js';
import { PacketBuilder } from '../utils/pkg/builder.js';
import { sendTextMessage } from '../utils/webHook/feishu.js';
import dayjs from 'dayjs';

const RECONNECT_BASE_MS = 4000;
const RECONNECT_MAX_MS = 30000;
const MAX_RECONNECT_ATTEMPTS = 10;
const MAINTENANCE_CHECK_MS = 60000;
const KEY_INIT_DELAY_MS = 5000;
const HEARTBEAT_MS = 5 * 60 * 1000;

enum State {
  Initial,
  Ready,
  Reconnecting,
  Shutdown,
}

export class TCPService {
  private sender: SendPacketProcessing | null = null;
  private receiver: ReceivePacketAnalysis | null = null;
  private state: State = State.Initial;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectFailure: Error | null = null;
  private reconnectAttempts: number = 0;

  private readyWaiters: Array<{
    resolve: () => void;
    reject: (reason?: any) => void;
  }> = [];

  // ---------- helpers ----------

  private _ts(): string {
    return dayjs().format('YYYY-MM-DD HH:mm:ss');
  }

  private _log(level: 'info' | 'warn' | 'err', ...args: unknown[]): void {
    const prefix = `[${this._ts()}]`;
    if (level === 'err') console.error(prefix, ...args);
    else if (level === 'warn') console.warn(prefix, ...args);
    else console.log(prefix, ...args);
  }

  private _cleanup(): void {
    if (this.receiver) {
      this.receiver.stop();
      this.receiver = null;
    }
    this.sender = null;
  }

  private _msgCallback(): ((msg: string) => void) | undefined {
    return settings.log_callbacks
      ? (msg: string) => console.log(`[${this._ts()}] ${msg}`)
      : undefined;
  }

  // ---------- group helpers ----------

  private _notifyReady(): void {
    this.reconnectFailure = null;
    const waiters = this.readyWaiters.splice(0);
    for (const w of waiters) w.resolve();
  }

  private _notifyFailed(err: Error): void {
    const waiters = this.readyWaiters.splice(0);
    for (const w of waiters) w.reject(err);
  }

  private _waitUntilReady(): Promise<void> {
    if (this.state === State.Ready) return Promise.resolve();
    if (this.state !== State.Reconnecting && this.reconnectFailure) {
      return Promise.reject(this.reconnectFailure);
    }
    return new Promise((resolve, reject) =>
      this.readyWaiters.push({ resolve, reject }),
    );
  }

  private _alert(msg: string): void {
    const task = sendTextMessage(msg);
    if (!task) return;
    void task.catch((err) =>
      console.error('【飞书】告警发送失败:', (err as Error).message),
    );
  }

  // ---------- connection life cycle ----------

  async init(): Promise<void> {
    try {
      await this._doConnect();
    } catch (error) {
      if (this.state === State.Shutdown) return;
      console.error(
        `初始化连接失败: ${(error as Error).message}，准备进入重连流程...`,
      );
      this._startReconnect();
      await this._waitUntilReady();
    }
  }

  private async _doConnect(): Promise<void> {
    this.state = State.Initial;
    const algorithms = new Algorithms();
    const login = new Login();

    this._log('info', '正在登录 TCP 服务器...');

    const { reader, writer } = await login.login(
      settings.service_account_id,
      settings.service_account_password,
    );

    const msgCb = this._msgCallback();

    this.sender = new SendPacketProcessing(
      algorithms,
      writer,
      settings.service_account_id,
      msgCb,
    );

    this.receiver = new ReceivePacketAnalysis(
      algorithms,
      reader,
      settings.service_account_id,
      msgCb,
      () => {
        this._log('warn', '【系统】网络连接已断开，准备重连...');
        this._startReconnect();
      },
      settings.log_full_packet,
      settings.ignored_cmd_ids,
    );

    await new Promise((resolve) => setTimeout(resolve, KEY_INIT_DELAY_MS));

    if ((this.state as State) === State.Shutdown) {
      this._cleanup();
      throw new Error('TCP 服务已关闭，中止连接建立');
    }

    this.state = State.Ready;
    this._log('info', 'TCP 初始化完成，密钥就绪！');
    this._startHeartbeat();
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(async () => {
      if (this.state !== State.Ready) return;

      if (!this.sender?.isConnected()) {
        this._log('warn', '【心跳】Socket 断开，触发重连');
        this._startReconnect();
        return;
      }

      try {
        const pkt2157 = new PacketBuilder()
          .setCmdId(2157)
          .addU32(1)
          .addU32(settings.service_account_id)
          .build();
        await this.sendAndReceive(pkt2157);
        this._log('info', '【心跳】2157 保持连接成功');
      } catch (error) {
        this._log('err', '【心跳】发送失败:', (error as Error).message);
      }
    }, HEARTBEAT_MS);
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ---------- reconnect ----------

  private _startReconnect(): void {
    if (this.state === State.Shutdown || this.state === State.Reconnecting) {
      return;
    }
    this.state = State.Reconnecting;
    this.reconnectFailure = null;
    this._stopHeartbeat();
    this._cleanup();

    void this._reconnectLoop().catch((error) => {
      this._log('err', '【重连】异常错误:', (error as Error).message);
    });
  }

  private async _reconnectLoop(): Promise<void> {
    while (this.state === State.Reconnecting) {
      this._cleanup();
      this.reconnectAttempts++;

      const isMaintenance = await this._checkMaintenance();
      if (isMaintenance) {
        this.reconnectAttempts = 0;
        await new Promise((resolve) =>
          setTimeout(resolve, MAINTENANCE_CHECK_MS),
        );
        continue;
      }

      try {
        await this._doConnect();
        this.reconnectAttempts = 0;
        this._log('info', '【重连】连接成功！');
        this._notifyReady();
        return;
      } catch (error) {
        if ((this.state as State) === State.Shutdown) return;

        if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          const finalError = new Error(
            `TCP 重连失败，已连续尝试 ${MAX_RECONNECT_ATTEMPTS} 次`,
          );
          const alert =
            `【seer-query 告警】重连终止\n` +
            `时间: ${this._ts()}\n` +
            `原因: ${finalError.message}`;

          this._log('err', '【重连】', finalError.message);
          this._alert(alert);
          this.state = State.Initial;
          this.reconnectFailure = finalError;
          this._notifyFailed(finalError);
          throw finalError;
        }

        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts - 1),
          RECONNECT_MAX_MS,
        );

        this._log(
          'err',
          `【重连】第 ${this.reconnectAttempts} 次失败: ${(error as Error).message}`,
        );
        this._log('info', `【重连】等待 ${delay / 1000}s 后重试...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async _checkMaintenance(): Promise<boolean> {
    try {
      const noticeList = await getUnityNoticeInfo();
      const result = parseUnityNotice(noticeList);
      if (result.status === '维护') {
        this._log('warn', '【重连】服务器维护中，等待...');
        return true;
      }
    } catch (err) {
      this._log('warn', `【重连】获取公告失败: ${(err as Error).message}`);
    }
    return false;
  }

  // ---------- public api ----------

  async sendAndReceive(
    pktOrHex: PacketBuilder | string,
    timeout = 5000,
  ): Promise<Buffer | null> {
    const hexPkt = typeof pktOrHex === 'string' ? pktOrHex : pktOrHex.build();
    const pktBuf = Buffer.from(hexPkt, 'hex');
    const cmdId = pktBuf.readUInt32BE(5);

    const doSend = async (): Promise<Buffer | null> => {
      if (!this.sender || !this.receiver) {
        throw new Error('TCP 未初始化');
      }

      const respPromise = this.receiver.waitForSpecificData(cmdId, timeout);
      const ok = await this.sender.sendPacket(hexPkt);

      if (!ok) throw new Error('封包发送失败');

      const data = await respPromise;
      return data?.subarray(17) ?? null;
    };

    if (this.state !== State.Ready) {
      if (this.state === State.Shutdown) {
        throw new Error('TCP 服务已关闭');
      }
      this._startReconnect();
      await this._waitUntilReady();
    }

    try {
      return await doSend();
    } catch (error) {
      if ((this.state as State) === State.Shutdown) throw error;

      const msg = (error as Error).message;
      const retryable =
        msg.includes('Socket连接已断开') || msg.includes('封包发送失败');

      if (!retryable) throw error;

      this._log('warn', `【发送】连接异常，重连重试: ${msg}`);
      this._startReconnect();
      await this._waitUntilReady();
      return doSend();
    }
  }

  shutdown(): void {
    this.state = State.Shutdown;
    this.reconnectFailure = new Error('TCP 服务已关闭');
    this._stopHeartbeat();
    this._cleanup();

    const waiters = this.readyWaiters.splice(0);
    for (const w of waiters) w.reject(this.reconnectFailure);

    this._log('info', 'TCP 服务已关闭');
  }
}

export const tcpService = new TCPService();
