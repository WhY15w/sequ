import { settings } from '../config/config.js';
import axios from 'axios';
import crypto from 'crypto';
import net from 'net';

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
      const socket = new net.Socket();

      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          clearTimeout(connectTimeout);
          reject(err);
        };

        // 连接超时保护 (10秒)
        const connectTimeout = setTimeout(() => {
          socket.removeListener('error', onError);
          socket.destroy();
          reject(new Error('TCP 连接超时 (10s)'));
        }, 10000);

        socket.connect(
          settings.game_server_port,
          settings.game_server_host,
          () => {
            clearTimeout(connectTimeout);
            socket.removeListener('error', onError);
            resolve();
          },
        );
        socket.on('error', onError);
      });

      const loginPacket = this.LOGIN_IN(useridBytes, sessionBytes);

      socket.write(loginPacket);

      return { reader: socket, writer: socket };
    } catch (error) {
      console.error('Connection error:', error);
      throw error;
    }
  }

  async fetchSessionToken(account: string, password: string): Promise<Buffer> {
    const singleMd5Password = crypto
      .createHash('md5')
      .update(password)
      .digest('hex');
    const timestamp = Date.now().toString();
    const callback = `jQuery19008830978978300397_${timestamp}`;

    const params = {
      r: 'userIdentity/authenticate',
      callback: callback,
      account: account,
      rememberAcc: 'false',
      passwd: singleMd5Password,
      rememberPwd: 'true',
      vericode: '',
      game: '02',
      tad: 'none',
      _: timestamp,
    };

    const response = await axios.get('https://account-co.61.com/index.php', {
      params: params,
      responseType: 'text',
      timeout: 10000,
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

  static parseJsonp(responseText: string, expectedCallback?: string): any {
    const suffix = ');';
    if (!responseText.endsWith(suffix)) {
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
      responseText.length - suffix.length,
    );
    return JSON.parse(jsonText);
  }

  LOGIN_IN(useridBytes: Buffer, sessionBytes: Buffer): Buffer {
    const tailHex =
      '74616F6D65650000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000B38000000015043000000000000000000000000000000002710000000010000000100000002756E6974795F6170705F74616F6D656500000000000000000000000000000000636F6D2E74616F6D65652E736565722E6D6F62696C65000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004E6974726F414E3531352D35352841636572290000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

    const fullRecvBody = Buffer.concat([
      sessionBytes,
      Buffer.from(tailHex, 'hex'),
    ]);

    const packetData = Buffer.concat([
      Buffer.from('0000020D31000003E9', 'hex'),
      useridBytes,
      Buffer.from('00000000', 'hex'),
      fullRecvBody,
    ]);

    return packetData;
  }
}
