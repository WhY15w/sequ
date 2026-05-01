import {
  badRequest,
  fail,
  notFound,
  success,
} from '../../../utils/http/reply.js';
import type { ReplyPayload } from '../../../utils/http/reply.js';
import { buildPacket } from '../../../utils/pkg/builder.js';
import { parseRankList } from '../../../utils/pkg/parser.js';
import { tcpService } from '../../tcpService.js';
import type { Context } from 'hono';

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
    return badRequest('数据返回失败', { error: '请输入有效的分页参数' });
  }

  try {
    const pkt = buildPacket(4481, key, subkey, startIdx, endIdx);

    const result = await tcpService.sendAndReceive(pkt);

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
        '获取成功',
      );
    }

    return notFound('数据返回失败', { error: '该排行信息不存在' });
  } catch (error) {
    return fail('数据返回失败', { error: (error as Error).message });
  }
}

export const getBookAndAchieveRankInfo = async (c: Context) => {
  const type = c.req.query('type');
  const startIdx = c.req.query('startIdx') ?? 0;
  const endIdx = c.req.query('endIdx') ?? 99;
  const typeNum = Number(type);

  if (!Number.isFinite(typeNum) || typeNum < 0) {
    return c.json(
      badRequest('数据返回失败', { error: '请输入有效的排行榜类型' }),
    );
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
    return c.json(badRequest('数据返回失败', { error: '排行榜类型不存在' }));
  }

  const replyPayload = await getNormalRankInfo({
    key,
    subkey,
    startIdx: Number(startIdx),
    endIdx: Number(endIdx),
  });
  return c.json(replyPayload);
};
