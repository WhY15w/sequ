import { BufferReader } from './reader.js';

export type RankItem = {
  userid: number;
  score: number;
  nick: string;
};

export function parseRankList(rankResult: Buffer): RankItem[] {
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
