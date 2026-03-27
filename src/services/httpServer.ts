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

app.get("/api/getUserInfo", async (req, res) => {
  const cmdId = 2052;
  const account = Number(req.query.account) || 744152911;

  try {
    const queryPacketHex = new PacketBuilder()
      .setCmdId(cmdId)
      .addU32(account)
      .build();

    const responseBuffer = await tcpService.sendAndReceive(
      cmdId,
      queryPacketHex
    );

    if (responseBuffer) {
      res.json({
        success: true,
        message: "获取成功",
        data: responseBuffer.toString("hex").toUpperCase(),
      });
    } else {
      res.status(504).json({ success: false, error: "等待响应超时" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export { app };
