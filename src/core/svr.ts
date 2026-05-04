import { PacketBuilder } from '../utils/pkg/builder.js';
import { HEADER_SIZE } from '../utils/pkg/protocol.js';
import { BufferReader } from '../utils/pkg/reader.js';
import axios from 'axios';
import net from 'net';

const UNITY_IP_URL = 'https://seer-login-ip.61.com/unity-ip.txt';
const DEFAULT_SVR = { ip: '175.24.235.221', port: 1864 };
const CONNECT_TIMEOUT_MS = 10000;
const SESSION_TIMEOUT_MS = 10000;

export interface ServerInfo {
  onlineID: number;
  userCnt: number;
  userCntType: number;
  ip: string;
  port: number;
  friends: number;
}

export class Svr {
  async getSvrInfo(): Promise<{
    onlineID: number;
    ip: string;
    port: number;
  }> {
    const servers = await this.getRangeServer(1800, 1900);
    if (servers.length === 0) {
      throw new Error('没有可用的服务器');
    }
    const idx = Math.floor(Math.random() * servers.length);
    return {
      onlineID: servers[idx]!.onlineID,
      ip: servers[idx]!.ip,
      port: servers[idx]!.port,
    };
  }

  private async getRangeServer(
    start: number = 1,
    end: number = 100,
  ): Promise<ServerInfo[]> {
    const socket = await this.connectToGameServer();

    return new Promise((resolve, reject) => {
      let done = false;
      let buffer = Buffer.alloc(0);

      const timeout = setTimeout(() => {
        if (done) return;
        done = true;
        socket.destroy();
        reject(new Error('getRangeServer 响应超时'));
      }, SESSION_TIMEOUT_MS);

      const onError = (err: Error) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        socket.destroy();
        reject(err);
      };

      socket.on('data', (data: Buffer) => {
        if (done) return;
        try {
          buffer = Buffer.concat([buffer, data]);

          while (buffer.length >= HEADER_SIZE) {
            const packetLength = buffer.readUInt32BE(0);

            if (packetLength < HEADER_SIZE || packetLength > 1024 * 1024) {
              clearTimeout(timeout);
              done = true;
              socket.destroy();
              reject(new Error(`异常封包长度: ${packetLength}`));
              return;
            }

            if (buffer.length < packetLength) break;

            const raw = buffer.subarray(0, packetLength);
            buffer = buffer.subarray(packetLength);

            const body = raw.subarray(HEADER_SIZE);
            const servers = Svr.parseRangeSvrInfo(body);
            clearTimeout(timeout);
            done = true;
            socket.destroy();
            resolve(servers);
            return;
          }
        } catch (err) {
          clearTimeout(timeout);
          done = true;
          socket.destroy();
          reject(err);
        }
      });

      socket.on('error', onError);

      const builder = new PacketBuilder();
      builder.setCmdId(106).addU32(start).addU32(end).addU32(0);
      socket.write(Buffer.from(builder.build(), 'hex'));
    });
  }

  private static parseRangeSvrInfo(body: Buffer): ServerInfo[] {
    const reader = new BufferReader(body);
    const onlineCnt = reader.readUInt32();
    const servers: ServerInfo[] = [];

    for (let i = 0; i < onlineCnt; i++) {
      const onlineID = reader.readUInt32();
      const userCnt = reader.readUInt32();
      const ip = reader.readString(16);
      const port = reader.readUInt16();
      const friends = reader.readUInt32();

      if (onlineID > 0) {
        servers.push({
          onlineID,
          userCnt,
          userCntType: Svr.computeUserCntType(userCnt),
          ip,
          port,
          friends,
        });
      }
    }

    return servers;
  }

  private static computeUserCntType(userCnt: number): number {
    switch (userCnt) {
      case 1:
      case 2:
      case 3:
        return 1;
      case 4:
      case 5:
        return 2;
      case 6:
        return 3;
      default:
        return 0;
    }
  }

  private async connectToGameServer(): Promise<net.Socket> {
    const { ip, port } = await this.getGameServerIp();
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

  private async getGameServerIp(): Promise<{ ip: string; port: number }> {
    try {
      const { data } = await axios.get(UNITY_IP_URL, {
        timeout: 5000,
      });

      const ips = data.split('|');
      const [ip, port] = ips[Math.floor(Math.random() * ips.length)].split(':');
      return { ip, port: parseInt(port, 10) };
    } catch (error) {
      console.error('获取游戏服务器 IP 失败:', error);
      return DEFAULT_SVR;
    }
  }
}
