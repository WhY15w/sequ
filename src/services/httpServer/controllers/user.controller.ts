import type { Request, Response } from "express";
import { tcpService } from "../../tcpService.js";
import { PacketBuilder } from "../../../utils/pkgBuilder.js";
import { BufferReader } from "../../../utils/reader.js";
import { badRequest, fail, notFound, success } from "../../../utils/reply.js";
import {
  isValidAccount,
  getInvalidAccountRes,
  toHexStr,
} from "../../../utils/httpUtil.js";

interface NicknameResult {
  success: boolean;
  nickName?: string;
  hexData?: string;
}

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

const buildPacket = (cmdId: number, ...params: number[]): string => {
  const builder = new PacketBuilder().setCmdId(cmdId);
  for (const param of params) {
    builder.addU32(param);
  }
  return builder.build();
};

const sleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

async function sendPacketAndToHex(
  cmdId: number,
  ...params: number[]
): Promise<string> {
  const packet = buildPacket(cmdId, ...params);
  return toHexStr(await tcpService.sendAndReceive(cmdId, packet));
}

async function fetchNickname(account: number): Promise<NicknameResult> {
  const pkt = buildPacket(2052, account);
  const res = await tcpService.sendAndReceive(2052, pkt);
  if (!res || res.length <= 39) return { success: false };
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
  const res = await tcpService.sendAndReceive(2157, pkt);
  if (!res || res.length < 12) return { online: false };
  const reader = new BufferReader(res);
  const isOnline = reader.readUInt32() === 1;
  reader.skip(4);
  const server = String(reader.readUInt32());
  return { online: isOnline, ...(isOnline ? { server } : {}) };
}

// 查询用户在线状态
export async function getUserOnlineStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const account = Number(req.query.account);

  if (!isValidAccount(account)) {
    const invalidAccountResponse = getInvalidAccountRes(account);
    res.json(
      badRequest(invalidAccountResponse.message, invalidAccountResponse.data),
    );
    return;
  }

  try {
    const nicknameResult = await fetchNickname(account);
    if (!nicknameResult.success) {
      res.json(
        notFound("数据返回失败", {
          account: String(account),
          error: "该米米号的信息不存在",
        }),
      );
      return;
    }

    const onlineResult = await fetchOnlineStatus(account);

    res.json(
      success(
        {
          account: String(account),
          nickName: nicknameResult.nickName,
          ...onlineResult,
        },
        "数据返回成功",
      ),
    );
  } catch (error) {
    res.json(
      fail("数据返回失败", {
        account: String(account),
        error: (error as Error).message,
      }),
    );
  }
}

// 获取米米号详细信息
export async function getUserInfo(req: Request, res: Response): Promise<void> {
  const account = Number(req.query.account);

  if (!isValidAccount(account)) {
    const invalidAccountResponse = getInvalidAccountRes(account, true);
    res.json(
      badRequest(invalidAccountResponse.message, invalidAccountResponse.data, {
        status: invalidAccountResponse.status,
      }),
    );
    return;
  }

  try {
    // 验证账号是否存在
    const nicknameResult = await fetchNickname(account);
    if (!nicknameResult.success) {
      res.json(
        notFound(
          "数据返回失败",
          { account: String(account), error: "该米米号的信息不存在" },
          { status: 1 },
        ),
      );
      return;
    }

    // 获取在线状态和简单信息
    const [onlineResult, hexDataSimple] = await Promise.all([
      fetchOnlineStatus(account),
      sendPacketAndToHex(2051, account),
    ]);

    // 成就/精灵信息
    const [hexDataPrat1, hexDataPrat2] = await Promise.all([
      sendPacketAndToHex(41298, 1, account, 0, 0),
      sendPacketAndToHex(41298, 5, account, 0, 0),
    ]);

    let hexDataPeak = "";
    for (const param of PEAK_PARAMS) {
      hexDataPeak += await sendPacketAndToHex(40002, account, param);
      await sleep(PEAK_QUERY_DELAY_MS);
    }

    res.json(
      success(
        {
          account: String(account),
          nickName: nicknameResult.nickName,
          hexDataMore: nicknameResult.hexData,
          ...onlineResult,
          hexDataSimple,
          hexDataPrat1,
          hexDataPrat2,
          hexDataPeak,
        },
        "数据返回成功",
        200,
        { status: 1 },
      ),
    );
  } catch (error) {
    res.json(
      fail(
        "数据返回失败",
        { account: String(account), error: (error as Error).message },
        500,
        { status: 1 },
      ),
    );
  }
}

// 获取战队信息
export async function getTeamInfo(req: Request, res: Response): Promise<void> {
  const teamId = Number(req.query.teamId);

  if (!teamId || isNaN(teamId) || teamId <= 0) {
    res.json(badRequest("数据返回失败", { error: "请输入有效的战队ID" }));
    return;
  }

  try {
    const pkt = new PacketBuilder().setCmdId(2917).addU32(teamId).build();
    const result = await tcpService.sendAndReceive(2917, pkt);

    if (result && result.length > 0) {
      res.json(
        success(
          { teamId: String(teamId), hexDataTeam: toHexStr(result) },
          "获取成功",
        ),
      );
      return;
    }

    res.json(notFound("数据返回失败", { error: "该战队号的信息不存在" }));
  } catch (error) {
    res.json(fail("数据返回失败", { error: (error as Error).message }));
  }
}
