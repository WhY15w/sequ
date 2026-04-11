import type { Request, Response } from "express";
import { tcpService } from "../../tcpService.js";
import { PacketBuilder } from "../../../utils/pkgBuilder.js";
import { BufferReader } from "../../../utils/reader.js";
import { badRequest, fail, notFound, success } from "../../../utils/reply.js";
import type { ReplyPayload } from "../../../utils/reply.js";

type RankItem = {
  userid: number;
  score: number;
  nick: string;
};

function parseRankList(rankResult: Buffer): RankItem[] {
  const reader = new BufferReader(rankResult);
  const rankListLen = reader.readUInt32();
  const rankList: RankItem[] = [];

  for (let i = 0; i < rankListLen; i++) {
    rankList.push({
      userid: reader.readUInt32(),
      score: reader.readUInt32(),
      nick: reader.readString(16),
    });
  }

  return rankList;
}

async function getNormalRankInfo({
  key,
  subkey,
  startIdx = 0,
  endIdx = 99,
}: {
  key: number;
  subkey: number;
  startIdx?: number;
  endIdx?: number;
}): Promise<ReplyPayload> {
  if (
    !Number.isFinite(startIdx) ||
    !Number.isFinite(endIdx) ||
    startIdx < 0 ||
    endIdx < startIdx
  ) {
    return badRequest("数据返回失败", { error: "请输入有效的分页参数" });
  }

  try {
    const pkt = new PacketBuilder()
      .setCmdId(4481)
      .addU32(key)
      .addU32(subkey)
      .addU32(startIdx)
      .addU32(endIdx)
      .build();

    const result = await tcpService.sendAndReceive(4481, pkt);

    if (result && result.length > 0) {
      const rankList = parseRankList(result);
      return success(
        {
          key,
          subkey,
          startIdx,
          endIdx,
          rankList,
        },
        "获取成功",
      );
    }

    return notFound("数据返回失败", { error: "该排行信息不存在" });
  } catch (error) {
    return fail("数据返回失败", { error: (error as Error).message });
  }
}

export const getBookAndAchieveRankInfo = async (
  req: Request,
  res: Response,
) => {
  const { type, startIdx = 0, endIdx = 99 } = req.query;
  const typeNum = Number(type);

  if (!Number.isFinite(typeNum) || typeNum < 0) {
    res.json(badRequest("数据返回失败", { error: "请输入有效的排行榜类型" }));
    return;
  }
  let key: number;
  let subkey: number;

  if (typeNum === 0) {
    // 图鉴
    key = 156;
    subkey = 1;
  } else if (typeNum === 1) {
    // 成就
    key = 17;
    subkey = 0;
  } else {
    res.json(badRequest("数据返回失败", { error: "排行榜类型不存在" }));
    return;
  }

  const replyPayload = await getNormalRankInfo({
    key,
    subkey,
    startIdx: Number(startIdx),
    endIdx: Number(endIdx),
  });
  res.json(replyPayload);
};
