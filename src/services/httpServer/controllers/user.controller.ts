import {
  getInvalidAccountRes,
  isValidAccount,
  toHexStr,
} from '../../../utils/http/httpUtil.js';
import {
  badRequest,
  fail,
  notFound,
  success,
} from '../../../utils/http/reply.js';
import { buildPacket } from '../../../utils/pkg/builder.js';
import { BufferReader } from '../../../utils/pkg/reader.js';
import { tcpService } from '../../tcpService.js';
import type { Context } from 'hono';

interface NicknameResult {
  success: boolean;
  nickName?: string;
  hexData?: string;
}

const NICKNAME_MIN_LENGTH = 39;
const ONLINE_STATUS_MIN_LENGTH = 12;

const PEAK_PARAMS = [
  124801,
  124802,
  124804,
  124805, // 竞技
  124791,
  124792,
  124793,
  124794, // 狂野
  129441,
  129443,
  129446,
  129447, // 专家
];

const PEAK_QUERY_DELAY_MS = 5;

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

async function sendPacketAndToHex(
  cmdId: number,
  ...params: number[]
): Promise<string> {
  const packet = buildPacket(cmdId, ...params);
  return toHexStr(await tcpService.sendAndReceive(packet));
}

async function fetchNickname(account: number): Promise<NicknameResult> {
  const pkt = buildPacket(2052, account);
  const res = await tcpService.sendAndReceive(pkt);
  if (!res || res.length <= NICKNAME_MIN_LENGTH) return { success: false };
  const reader = new BufferReader(res);
  reader.skip(4);
  return {
    success: true,
    nickName: reader.readString(16),
    hexData: toHexStr(res),
  };
}

interface OnlineResult {
  online: boolean;
  server?: string;
}

async function fetchOnlineStatus(account: number): Promise<OnlineResult> {
  const pkt = buildPacket(2157, 1, account);
  const res = await tcpService.sendAndReceive(pkt);
  if (!res || res.length < ONLINE_STATUS_MIN_LENGTH) return { online: false };
  const reader = new BufferReader(res);
  const isOnline = reader.readUInt32() === 1;
  reader.skip(4);
  const server = String(reader.readUInt32());
  return { online: isOnline, ...(isOnline ? { server } : {}) };
}

// 查询用户在线状态
export async function getUserOnlineStatus(c: Context): Promise<Response> {
  const account = Number(c.req.query('account'));

  if (!isValidAccount(account)) {
    const invalidAccountResponse = getInvalidAccountRes(account);
    return c.json(
      badRequest(invalidAccountResponse.message, invalidAccountResponse.data),
    );
  }

  try {
    const nicknameResult = await fetchNickname(account);
    if (!nicknameResult.success) {
      return c.json(
        notFound('数据返回失败', {
          account: String(account),
          error: '该米米号的信息不存在',
        }),
      );
    }

    const onlineResult = await fetchOnlineStatus(account);

    return c.json(
      success(
        {
          account: String(account),
          nickName: nicknameResult.nickName,
          ...onlineResult,
        },
        '数据返回成功',
      ),
    );
  } catch (error) {
    return c.json(
      fail('数据返回失败', {
        account: String(account),
        error: (error as Error).message,
      }),
    );
  }
}

// 获取米米号详细信息
export async function getUserInfo(c: Context): Promise<Response> {
  const account = Number(c.req.query('account'));

  if (!isValidAccount(account)) {
    const invalidAccountResponse = getInvalidAccountRes(account, true);
    return c.json(
      badRequest(invalidAccountResponse.message, invalidAccountResponse.data, {
        status: invalidAccountResponse.status,
      }),
    );
  }

  try {
    // 验证账号是否存在
    const nicknameResult = await fetchNickname(account);
    if (!nicknameResult.success) {
      return c.json(
        notFound(
          '数据返回失败',
          { account: String(account), error: '该米米号的信息不存在' },
          { status: 1 },
        ),
      );
    }

    // 获取在线状态和简单信息
    const [onlineResult, hexDataSimple] = await Promise.all([
      fetchOnlineStatus(account),
      sendPacketAndToHex(2051, account),
    ]);

    // 成就/精灵信息
    const [hexDatapart1, hexDatapart2] = await Promise.all([
      sendPacketAndToHex(41298, 1, account, 0, 0),
      sendPacketAndToHex(41298, 5, account, 0, 0),
    ]);

    let hexDataPeak = '';
    for (const param of PEAK_PARAMS) {
      hexDataPeak += await sendPacketAndToHex(40002, account, param);
      await sleep(PEAK_QUERY_DELAY_MS);
    }

    return c.json(
      success(
        {
          account: String(account),
          nickName: nicknameResult.nickName,
          hexDataMore: nicknameResult.hexData,
          ...onlineResult,
          hexDataSimple,
          hexDatapart1,
          hexDatapart2,
          hexDataPeak,
        },
        '数据返回成功',
        200,
        { status: 1 },
      ),
    );
  } catch (error) {
    return c.json(
      fail(
        '数据返回失败',
        { account: String(account), error: (error as Error).message },
        500,
        { status: 1 },
      ),
    );
  }
}

// 获取战队信息
export async function getTeamInfo(c: Context): Promise<Response> {
  const teamId = Number(c.req.query('teamId'));

  if (!teamId || isNaN(teamId) || teamId <= 0) {
    return c.json(badRequest('数据返回失败', { error: '请输入有效的战队ID' }));
  }

  try {
    const pkt = buildPacket(2917, teamId);
    const result = await tcpService.sendAndReceive(pkt);

    if (result && result.length > 0) {
      return c.json(
        success(
          { teamId: String(teamId), hexDataTeam: toHexStr(result) },
          '获取成功',
        ),
      );
    }

    return c.json(notFound('数据返回失败', { error: '该战队号的信息不存在' }));
  } catch (error) {
    return c.json(fail('数据返回失败', { error: (error as Error).message }));
  }
}
