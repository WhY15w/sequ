import { SendPacketProcessing } from "./pkg/send";
import { ReceivePacketAnalysis } from "./pkg/receive";
import { PacketBuilder } from "./utils/pkgBuilder";
import { Algorithms } from "./core/encrypt";
import { Login } from "./core/login";
import { settings } from "./config/config";

async function completeExample() {
  const algorithms = new Algorithms();
  const login = new Login();

  console.log("正在登录...");

  try {
    const { reader, writer } = await login.login(
      settings.service_account_id,
      settings.service_account_password
    );

    const sender = new SendPacketProcessing(
      algorithms,
      writer,
      settings.service_account_id,
      (msg) => console.log(msg)
    );

    const receiver = new ReceivePacketAnalysis(
      algorithms,
      reader,
      settings.service_account_id,
      (msg) => console.log(msg),
      () => {
        console.log("【系统提示】网络连接已断开，准备退出或重连...");
        process.exit(0);
      }
    );

    // 等待 1001 密钥初始化封包处理完毕
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const queryPacketHex = new PacketBuilder()
      .setCmdId(2052)
      .addU32(776916786)
      .build();

    await sender.sendPacket(queryPacketHex);
  } catch (error) {
    console.error("运行期间发生严重错误:", error);
  }
}

if (require.main === module) {
  completeExample();
}
