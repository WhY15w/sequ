import { tcpService } from "./services/tcpService";
import { app } from "./services/httpServer/app";

async function bootstrap() {
  try {
    await tcpService.init();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`HTTP 服务器已启动: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("系统启动失败:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}
