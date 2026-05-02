import { settings } from '../config/config.js';
import axios from 'axios';
import crypto from 'crypto';
import net from 'net';

const SESSION_SERVER_URL = 'https://account-co.61.com/index.php';
const CONNECT_TIMEOUT_MS = 10000;
const SESSION_TIMEOUT_MS = 10000;

const PACKET_HEADER_HEX = '0000020D31000003E9';
const PACKET_ZERO_PAD_HEX = '00000000';

const TAIL_HEX =
  '74616F6D65650000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000B38000000015043000000000000000000000000000000002710000000010000000100000002756E6974795F6170705F74616F6D656500000000000000000000000000000000636F6D2E74616F6D65652E736565722E6D6F62696C65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004E6974726F414E3531352D35352841636572290000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

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

    const useridBytes = Buffer.alloc(4);
    useridBytes.writeUInt32BE(userIdNum, 0);

    try {
      const socket = await this.connectSocket();

      const loginPacket = this.buildLoginPacket(useridBytes, sessionBytes);

      socket.write(loginPacket);

      return { reader: socket, writer: socket };
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  private connectSocket(): Promise<net.Socket> {
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

      socket.connect(
        settings.game_server_port,
        settings.game_server_host,
        () => {
          clearTimeout(connectTimeout);
          socket.removeListener('error', onError);
          resolve(socket);
        },
      );
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

  private buildLoginPacket(useridBytes: Buffer, sessionBytes: Buffer): Buffer {
    const fullRecvBody = Buffer.concat([
      sessionBytes,
      Buffer.from(TAIL_HEX, 'hex'),
    ]);

    return Buffer.concat([
      Buffer.from(PACKET_HEADER_HEX, 'hex'),
      useridBytes,
      Buffer.from(PACKET_ZERO_PAD_HEX, 'hex'),
      fullRecvBody,
    ]);
  }
}
