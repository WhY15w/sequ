import express, { Request, Response } from "express";
import { tcpService } from "../../../services/tcpService";
import { PacketBuilder } from "../../../utils/pkgBuilder";
import { BufferReader } from "../../../utils/reader";
import {
  isValidAccount,
  getInvalidAccountRes,
  toHexStr,
} from "../../../utils/httpUtil";

const router: express.Router = express.Router();

// 查询用户在线状态
router.get("/getUserOnlineStatus", async (req: Request, res: Response) => {
  const account = Number(req.query.account);

  if (!isValidAccount(account)) {
    return res.status(400).json(getInvalidAccountRes(account));
  }

  try {
    // 获取昵称信息
    const pkt2052 = new PacketBuilder().setCmdId(2052).addU32(account).build();
    const res2052 = await tcpService.sendAndReceive(2052, pkt2052);

    if (!res2052 || res2052.length <= 39) {
      return res.json({
        success: false,
        message: "数据返回失败",
        data: { account: String(account), error: "该米米号的信息不存在" },
      });
    }

    const reader2052 = new BufferReader(res2052);
    reader2052.skip(4);
    const nickName = reader2052.readString(16);

    // 获取在线状态
    const pkt2157 = new PacketBuilder()
      .setCmdId(2157)
      .addU32(1)
      .addU32(account)
      .build();
    const res2157 = await tcpService.sendAndReceive(2157, pkt2157);

    let isOnline = false;
    let server = "";

    if (res2157 && res2157.length >= 12) {
      const reader2157 = new BufferReader(res2157);
      isOnline = reader2157.readUInt32() === 1;
      reader2157.skip(4);
      server = String(reader2157.readUInt32());
    }

    return res.json({
      success: true,
      message: "数据返回成功",
      data: {
        account: String(account),
        nickName,
        online: isOnline,
        ...(isOnline ? { server } : {}),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "数据返回失败",
      data: { account: String(account), error: (error as Error).message },
    });
  }
});

// 获取米米号详细信息
router.get("/getUserInfo", async (req: Request, res: Response) => {
  const account = Number(req.query.account);

  if (!isValidAccount(account)) {
    return res.status(400).json(getInvalidAccountRes(account, true));
  }

  try {
    const responseData: any = { account: String(account) };

    // 详细信息 昵称
    const pkt2052 = new PacketBuilder().setCmdId(2052).addU32(account).build();
    const res2052 = await tcpService.sendAndReceive(2052, pkt2052);

    if (!res2052 || res2052.length <= 39) {
      return res.json({
        success: false,
        message: "数据返回失败",
        status: 1,
        data: { account: String(account), error: "该米米号的信息不存在" },
      });
    }

    const reader2052 = new BufferReader(res2052);
    reader2052.skip(4);
    responseData.nickName = reader2052.readString(16);
    responseData.hexDataMore = toHexStr(res2052);

    // 在线状态
    const pkt2157 = new PacketBuilder()
      .setCmdId(2157)
      .addU32(1)
      .addU32(account)
      .build();
    const res2157 = await tcpService.sendAndReceive(2157, pkt2157);

    responseData.online = false;
    if (res2157 && res2157.length >= 12) {
      const reader2157 = new BufferReader(res2157);
      const isOnline = reader2157.readUInt32() === 1;
      reader2157.skip(4);
      const serverId = reader2157.readUInt32();

      responseData.online = isOnline;
      if (isOnline) responseData.server = String(serverId);
    }

    // 简单信息
    const pkt2051 = new PacketBuilder().setCmdId(2051).addU32(account).build();
    responseData.hexDataSimple = toHexStr(
      await tcpService.sendAndReceive(2051, pkt2051)
    );

    // 成就 精灵种类 皮肤 称号
    const pkt41298_1 = new PacketBuilder()
      .setCmdId(41298)
      .addU32(1)
      .addU32(account)
      .addU32(0)
      .addU32(0)
      .build();
    responseData.hexDataPrat1 = toHexStr(
      await tcpService.sendAndReceive(41298, pkt41298_1)
    );

    // U端卡片展示的精灵
    const pkt41298_5 = new PacketBuilder()
      .setCmdId(41298)
      .addU32(5)
      .addU32(account)
      .addU32(0)
      .addU32(0)
      .build();
    responseData.hexDataPrat2 = toHexStr(
      await tcpService.sendAndReceive(41298, pkt41298_5)
    );

    // 巅峰信息
    const peakParams = [
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

    let hexDataPeak = "";
    for (const param of peakParams) {
      const pkt40002 = new PacketBuilder()
        .setCmdId(40002)
        .addU32(account)
        .addU32(param)
        .build();
      const res40002 = await tcpService.sendAndReceive(40002, pkt40002);
      hexDataPeak += toHexStr(res40002);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    responseData.hexDataPeak = hexDataPeak;

    return res.json({
      success: true,
      message: "数据返回成功",
      status: 1,
      data: responseData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "数据返回失败",
      status: 1,
      data: { account: String(account), error: (error as Error).message },
    });
  }
});

// 获取战队信息
router.get("/getTeamInfo", async (req: Request, res: Response) => {
  const teamId = Number(req.query.teamId);

  try {
    const pkt2917 = new PacketBuilder().setCmdId(2917).addU32(teamId).build();
    const res2917 = await tcpService.sendAndReceive(2917, pkt2917);

    if (res2917 && res2917.length > 0) {
      return res.json({
        success: true,
        message: "获取成功",
        data: {
          teamId: String(teamId),
          hexDataTeam: toHexStr(res2917),
        },
      });
    }

    return res.json({
      success: true,
      message: "数据返回失败",
      data: { error: "该战队号的信息不存在" },
    });
  } catch (error) {
    return res.json({
      success: true,
      message: "数据返回失败",
      data: { error: (error as Error).message },
    });
  }
});

export default router;
