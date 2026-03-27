import express from "express";
import { tcpService } from "./tcpService";
import { PacketBuilder } from "../utils/pkgBuilder";
import { BufferReader } from "../utils/reader";

const app: express.Application = express();
app.use(express.json());

// 查询用户在线状态
app.get("/api/getUserOnlineStatus", async (req, res) => {
  const account = Number(req.query.account);

  if (!account || account < 50000 || account > 2000000000) {
    return res.status(400).json({
      success: false,
      message: "数据返回失败",
      data: {
        account: String(account || ""),
        error: "请输入正确的米米号, 从50000开始，2000000000封顶",
      },
    });
  }

  try {
    const queryPacket2052 = new PacketBuilder()
      .setCmdId(2052)
      .addU32(account)
      .build();

    const response2052 = await tcpService.sendAndReceive(2052, queryPacket2052);

    if (!response2052 || response2052.length <= 39) {
      return res.status(404).json({
        success: false,
        message: "数据返回失败",
        data: {
          account: String(account),
          error: "该米米号的信息不存在",
        },
      });
    }

    // 解析昵称
    const reader = new BufferReader(response2052);
    reader.skip(4);
    const nickName = reader.readString(16);

    const queryPacket2157 = new PacketBuilder()
      .setCmdId(2157)
      .addU32(1)
      .addU32(account)
      .build();

    const response2157 = await tcpService.sendAndReceive(2157, queryPacket2157);

    let isOnline = false;
    let server = "";

    if (response2157 && response2157.length >= 12) {
      const reader = new BufferReader(response2157);
      isOnline = reader.readUInt32() === 1;
      reader.skip(4);
      server = String(reader.readUInt32());
    }

    const responseData: any = {
      account: String(account),
      nickName: nickName,
      online: isOnline,
    };

    if (isOnline) {
      responseData.server = server;
    }

    return res.json({
      success: true,
      message: "数据返回成功",
      data: responseData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "数据返回失败",
      data: {
        account: String(account),
        error: (error as Error).message,
      },
    });
  }
});

// 获取米米号信息
app.get("/api/getUserInfo", async (req, res) => {
  const account = Number(req.query.account);

  if (!account || account < 50000 || account > 2000000000) {
    return res.status(400).json({
      success: false,
      message: "数据返回失败",
      status: 1,
      data: {
        account: String(account || ""),
        error: "请输入正确的米米号, 从50000开始，2000000000封顶",
      },
    });
  }

  try {
    const responseData: any = { account: String(account) };

    const pkt2052 = new PacketBuilder().setCmdId(2052).addU32(account).build();
    const res2052 = await tcpService.sendAndReceive(2052, pkt2052);

    if (!res2052 || res2052.length <= 39) {
      return res.status(404).json({
        success: false,
        message: "数据返回失败",
        status: 1,
        data: {
          account: String(account),
          error: "该米米号的信息不存在",
        },
      });
    }

    // 提取昵称并记录 hexDataMore
    const reader2052 = new BufferReader(res2052);
    reader2052.skip(4);
    responseData.nickName = reader2052.readString(16);
    responseData.hexDataMore = res2052.toString("hex").toUpperCase();

    // 2. 发送 2157 获取在线状态与区服
    const pkt2157 = new PacketBuilder()
      .setCmdId(2157)
      .addU32(1)
      .addU32(account)
      .build();
    const res2157 = await tcpService.sendAndReceive(2157, pkt2157);

    let isOnline = false;
    if (res2157 && res2157.length >= 12) {
      const reader2157 = new BufferReader(res2157);
      isOnline = reader2157.readUInt32() === 1;
      reader2157.skip(4);
      const serverId = reader2157.readUInt32();

      responseData.online = isOnline;
      if (isOnline) {
        responseData.server = String(serverId);
      }
    } else {
      responseData.online = false;
    }

    // 3. 发送 2051 获取简单信息
    const pkt2051 = new PacketBuilder().setCmdId(2051).addU32(account).build();
    const res2051 = await tcpService.sendAndReceive(2051, pkt2051);
    responseData.hexDataSimple = res2051
      ? res2051.toString("hex").toUpperCase()
      : "";

    // 4. 发送 41298 (1) 获取成就 精灵种类 皮肤 称号
    const pkt41298_1 = new PacketBuilder()
      .setCmdId(41298)
      .addU32(1)
      .addU32(account)
      .addU32(0)
      .addU32(0)
      .build();
    const res41298_1 = await tcpService.sendAndReceive(41298, pkt41298_1);
    responseData.hexDataPrat1 = res41298_1
      ? res41298_1.toString("hex").toUpperCase()
      : "";

    // 5. 发送 41298 (5) 获取展示的精灵
    const pkt41298_5 = new PacketBuilder()
      .setCmdId(41298)
      .addU32(5)
      .addU32(account)
      .addU32(0)
      .addU32(0)
      .build();
    const res41298_5 = await tcpService.sendAndReceive(41298, pkt41298_5);
    responseData.hexDataPrat2 = res41298_5
      ? res41298_5.toString("hex").toUpperCase()
      : "";

    // 6. 获取巅峰数据 40002
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
    // 为了防止并发导致 TCP 串包，这里使用 for 循环顺序请求
    for (const param of peakParams) {
      const pkt40002 = new PacketBuilder()
        .setCmdId(40002)
        .addU32(account)
        .addU32(param)
        .build();
      const res40002 = await tcpService.sendAndReceive(40002, pkt40002);
      if (res40002) {
        hexDataPeak += res40002.toString("hex").toUpperCase();
      }
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
      data: {
        account: String(account),
        error: (error as Error).message,
      },
    });
  }
});

app.get("/api/getTeamInfo", async (req, res) => {
  const cmdId = 2917;
  const teamId = Number(req.query.teamId);

  try {
    const queryPacketHex = new PacketBuilder()
      .setCmdId(cmdId)
      .addU32(teamId)
      .build();

    const responseBuffer = await tcpService.sendAndReceive(
      cmdId,
      queryPacketHex
    );

    if (responseBuffer && responseBuffer.length > 0) {
      res.json({
        success: true,
        message: "获取成功",
        data: {
          teamId: String(teamId),
          hexDataTeam: responseBuffer.toString("hex").toUpperCase(),
        },
      });
    } else {
      res.json({
        success: true,
        message: "数据返回失败",
        data: {
          error: "该战队号的信息不存在",
        },
      });
    }
  } catch (error) {
    res.json({
      success: true,
      message: "数据返回失败",
      data: {
        error: (error as Error).message,
      },
    });
  }
});

export { app };
