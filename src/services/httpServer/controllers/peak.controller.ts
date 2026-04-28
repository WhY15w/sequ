import { PacketBuilder } from '../../../utils/pkgBuilder.js';
import { BufferReader } from '../../../utils/reader.js';
import { badRequest, fail, notFound, success } from '../../../utils/reply.js';
import { tcpService } from '../../tcpService.js';
import type { Context } from 'hono';

type RankItem = {
  userid: number;
  score: number;
  nick: string;
};

type VoteItem = {
  voteMonsterId: number;
  voteCount: number;
};

function parseVoteList(voteResult: Buffer): VoteItem[] {
  const reader = new BufferReader(voteResult);
  const voteListLen = reader.readUInt32();
  const voteList: VoteItem[] = [];

  for (let i = 0; i < voteListLen; i++) {
    voteList.push({
      voteMonsterId: reader.readUInt32(),
      voteCount: reader.readUInt32(),
    });
    reader.skip(16);
  }

  return voteList;
}

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

/**
 * 获取巅峰圣战排行榜的 rank_key
 *
 * @param page - 页面类型
 *   1: 玩家排行
 *   2: 精灵排行
 *   3: 套装排行
 *   4: 称号排行
 *
 * @param mode - 模式
 *   0: 竞技模式
 *   1: 狂野模式
 *   2: 专家模式
 *
 * @param tab - 子分类索引（从 0 开始）
 *
 *   page=2（精灵排行）:
 *     0: 胜场
 *     1: 出场次数
 *     2: 禁止次数
 *
 *   page=3（套装排行）:
 *     0: 胜场
 *     1: 出场次数
 *
 *   page=4（称号排行）:
 *     0: 胜场
 *     1: 出场次数
 *
 * @returns 对应的 rank_key
 *   - 有效组合返回 number（用于接口请求）
 *   - 非法组合返回 NaN（如越界的 mode / tab / page）
 *
 * @example
 * getPeakRankKey(1, 0, 0) // 120（玩家排行）
 * getPeakRankKey(2, 0, 1) // 93（精灵出场次数）
 * getPeakRankKey(3, 1, 0) // 187（套装胜场）
 * getPeakRankKey(4, 2, 1) // 205（称号出场次数）
 */
function getPeakRankKey(page: number, mode: number, tab: number): number {
  switch (page) {
    case 1: // 玩家排行
      return [120, 182, 199][mode] ?? NaN;
    case 2: // 精灵排行
      return (
        [
          [177, 93, 94],
          [185, 184, 183],
          [202, 201, 200],
        ][mode]?.[tab] ?? NaN
      );
    case 3: // 套装排行
      return (
        [
          [174, 173],
          [187, 186],
          [204, 203],
        ][mode]?.[tab] ?? NaN
      );
    case 4: // 称号排行
      return (
        [
          [176, 175],
          [189, 188],
          [206, 205],
        ][mode]?.[tab] ?? NaN
      );
    default:
      return NaN;
  }
}

// 获取投票信息 voteType: 0 限制级；1 准限制级
export async function getVoteInfo(c: Context): Promise<Response> {
  const voteDate = Number(c.req.query('voteDate'));
  const voteType = Number(c.req.query('voteType')) === 1 ? 1 : 0;
  const startIdx = Number(c.req.query('startIdx') ?? 0);
  const endIdx = Number(c.req.query('endIdx') ?? 25);

  if (!Number.isFinite(voteDate) || voteDate <= 0) {
    return c.json(
      badRequest('数据返回失败', { error: '请输入有效的投票日期' }),
    );
  }

  if (
    !Number.isFinite(startIdx) ||
    !Number.isFinite(endIdx) ||
    startIdx < 0 ||
    endIdx < startIdx
  ) {
    return c.json(
      badRequest('数据返回失败', { error: '请输入有效的分页参数' }),
    );
  }

  try {
    const pkt = new PacketBuilder()
      .setCmdId(4481)
      .addU32(191 + voteType)
      .addU32(voteDate)
      .addU32(startIdx)
      .addU32(endIdx)
      .build();
    const voteResult = await tcpService.sendAndReceive(pkt);

    if (voteResult && voteResult.length > 0) {
      const voteList = parseVoteList(voteResult);
      return c.json(success({ voteList }, '获取成功'));
    }

    return c.json(
      notFound('数据返回失败', { error: '该投票日期的信息不存在' }),
    );
  } catch (error) {
    return c.json(
      fail('数据返回失败', { error: (error as Error).message }, 500),
    );
  }
}

// 获取巅峰排行信息
export async function getPeakRankInfo(c: Context): Promise<Response> {
  const keyParam = Number(c.req.query('key'));
  const page = Number(c.req.query('page'));
  const mode = Number(c.req.query('mode') ?? 0);
  const tab = Number(c.req.query('tab') ?? 0);
  const subkey = Number(c.req.query('subkey'));
  const startIdx = Number(c.req.query('startIdx') ?? 0);
  const endIdx = Number(c.req.query('endIdx') ?? 99);

  let key = keyParam;

  if (!Number.isFinite(key) || key <= 0) {
    key = getPeakRankKey(page, mode, tab);
  }

  if (!Number.isFinite(key)) {
    return c.json(badRequest('数据返回失败', { error: '无效的排行榜类型' }));
  }

  if (
    !Number.isFinite(key) ||
    !Number.isFinite(subkey) ||
    key < 0 ||
    subkey < 0
  ) {
    return c.json(
      badRequest('数据返回失败', { error: '请输入有效的排行参数' }),
    );
  }

  if (
    !Number.isFinite(startIdx) ||
    !Number.isFinite(endIdx) ||
    startIdx < 0 ||
    endIdx < startIdx
  ) {
    return c.json(
      badRequest('数据返回失败', { error: '请输入有效的分页参数' }),
    );
  }

  try {
    const pkt = new PacketBuilder()
      .setCmdId(4481)
      .addU32(key)
      .addU32(subkey)
      .addU32(startIdx)
      .addU32(endIdx)
      .build();

    const result = await tcpService.sendAndReceive(pkt);

    if (result && result.length > 0) {
      const rankList = parseRankList(result);
      return c.json(
        success(
          {
            key,
            subkey,
            startIdx,
            endIdx,
            rankList,
          },
          '获取成功',
        ),
      );
    }

    return c.json(notFound('数据返回失败', { error: '该排行信息不存在' }));
  } catch (error) {
    return c.json(fail('数据返回失败', { error: (error as Error).message }));
  }
}
