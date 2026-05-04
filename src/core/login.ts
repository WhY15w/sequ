import { settings } from '../config/config.js';
import { PacketBuilder } from '../utils/pkg/builder.js';
import { Svr } from './svr.js';
import axios from 'axios';
import crypto from 'crypto';
import net from 'net';

const SESSION_SERVER_URL = 'https://account-co.61.com/index.php';
const CONNECT_TIMEOUT_MS = 10000;
const SESSION_TIMEOUT_MS = 10000;

const JSONP_SUFFIX = ');';

export class Login {
  async login(
    userid: number | string,
    password: string,
  ): Promise<{ reader: net.Socket; writer: net.Socket }> {
    const userIdNum = Number(userid);

    const sessionBytes = await this.fetchSessionToken(
      userid.toString(),
      password,
    );

    console.log(`获取 session 成功: ${sessionBytes.toString('hex')}`);

    try {
      const svr = new Svr();
      const svrInfo = await svr.getSvrInfo();
      console.log(`获取 svrInfo 成功: ${JSON.stringify(svrInfo, null, 2)}`);

      const socket = await this.connectSocket({
        ip: svrInfo.ip,
        port: svrInfo.port,
      });

      const loginPacket = this.buildLoginPacket(
        userIdNum,
        sessionBytes,
        svrInfo.onlineID,
      );

      socket.write(loginPacket);

      return { reader: socket, writer: socket };
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  private connectSocket({
    ip = settings.game_server_host,
    port = settings.game_server_port,
  }: {
    ip: string;
    port: number;
  }): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();

      const onError = (err: Error) => {
        clearTimeout(connectTimeout);
        reject(err);
      };

      const connectTimeout = setTimeout(() => {
        socket.removeListener('error', onError);
        socket.destroy();
        reject(new Error('TCP 连接超时 (10s)'));
      }, CONNECT_TIMEOUT_MS);

      socket.connect(port, ip, () => {
        clearTimeout(connectTimeout);
        socket.removeListener('error', onError);
        resolve(socket);
      });
      socket.on('error', onError);
    });
  }

  private async fetchSessionToken(
    account: string,
    password: string,
  ): Promise<Buffer> {
    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
    const timestamp = Date.now().toString();
    const callback = `jQuery19008830978978300397_${timestamp}`;

    const params = {
      r: 'userIdentity/authenticate',
      callback,
      account,
      rememberAcc: 'false',
      passwd: md5Hash,
      rememberPwd: 'true',
      vericode: '',
      game: '02',
      tad: 'none',
      _: timestamp,
    };

    const response = await axios.get(SESSION_SERVER_URL, {
      params,
      responseType: 'text',
      timeout: SESSION_TIMEOUT_MS,
    });

    const payload = Login.parseJsonp(response.data.trim(), callback);

    if (payload.result !== 0) {
      const errMsg = payload.err_desc || JSON.stringify(payload);
      throw new Error(`登录失败: ${errMsg}`);
    }

    const session = payload.data?.session;
    if (!session) {
      throw new Error('响应中缺少 session');
    }

    try {
      return Buffer.from(session, 'hex');
    } catch {
      throw new Error('session 格式错误');
    }
  }

  private static parseJsonp(
    responseText: string,
    expectedCallback?: string,
  ): any {
    if (!responseText.endsWith(JSONP_SUFFIX)) {
      throw new Error('回调格式不正确');
    }
    const openParen = responseText.indexOf('(');
    if (openParen === -1) {
      throw new Error('响应缺少括号');
    }

    const actualCallback = responseText.substring(0, openParen);
    if (expectedCallback && actualCallback !== expectedCallback) {
      if (!actualCallback.startsWith(expectedCallback)) {
        throw new Error(`回调名称不匹配: ${actualCallback}`);
      }
    }

    const jsonText = responseText.substring(
      openParen + 1,
      responseText.length - JSONP_SUFFIX.length,
    );
    return JSON.parse(jsonText);
  }

  private buildLoginPacket(
    userId: number,
    sessionBytes: Buffer,
    onlineId: number,
  ): Buffer {
    const builder = new PacketBuilder();
    builder.setCmdId(1001);
    builder.setUserId(userId);

    // 1. session
    builder.addBytes(this.toFixedBuffer(sessionBytes, 16));
    // 2. topLeftTmcid
    builder.addBytes(this.toFixedBuffer('taomee', 64));
    // 3. onlineID
    builder.addU32(onlineId);
    // 4. 固定值1
    builder.addU32(1);
    // 5. device
    builder.addBytes(this.toFixedBuffer('PC', 16));
    // 6. versionCode
    builder.addU32(10000);
    // 7. loginType
    builder.addU32(1);
    // 8. platform - 1: PC, 2: Android, 3: iOS
    builder.addU32(1);
    // 9. webOrApp
    builder.addU32(2);
    // 10. channelBy
    builder.addBytes(this.toFixedBuffer('unity_app_taomee', 32));
    // 11. extra_pkg_name
    builder.addBytes(this.toFixedBuffer('com.taomee.seer.mobile', 32));
    // 12. extra_idfa_oaid
    builder.addBytes(Buffer.alloc(64));
    // 13. extra_idfv_imei
    builder.addBytes(Buffer.alloc(64));
    // 14. extra_caid_androidid
    builder.addBytes(Buffer.alloc(64));
    // 15. extra_devicetype
    builder.addBytes(this.toFixedBuffer('20SM(LENOVO)', 64));
    // 16. extra_deviceid
    builder.addBytes(Buffer.alloc(64));
    // 17. extra_asa_token
    builder.addBytes(this.buildASAToken());

    const hexString = builder.build();
    return Buffer.from(hexString, 'hex');
  }

  private toFixedBuffer(data: string | Buffer, length: number): Buffer {
    const buf = Buffer.alloc(length, 0);
    if (typeof data === 'string') {
      buf.write(data, 0, 'utf8');
    } else {
      data.copy(buf, 0, 0, Math.min(data.length, length));
    }
    return buf;
  }

  private buildASAToken(): Buffer {
    const str = '';
    const strBuf = Buffer.from(str, 'utf8');

    const buf = Buffer.alloc(4 + strBuf.length);
    buf.writeUInt32BE(strBuf.length, 0);
    strBuf.copy(buf, 4);

    return buf;
  }
}
