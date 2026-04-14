import { settings } from './config/config.js';
import { app } from './services/httpServer/app.js';
import { tcpService } from './services/tcpService.js';
import type { Server } from 'http';

process.title = 'seer-query';

let httpServer: Server | null = null;
// pkill -f "seer-api"

async function bootstrap() {
  try {
    await tcpService.init();

    httpServer = app.listen(settings.http_port, () => {
      console.log(`HTTP 服务器已启动: http://localhost:${settings.http_port}`);
    });
  } catch (error) {
    console.error('系统启动失败:', error);
    process.exit(1);
  }
}

function gracefulShutdown(signal: string) {
  console.log(`\n收到 ${signal} 信号，正在关闭...`);

  tcpService.shutdown();

  if (httpServer) {
    httpServer.close(() => {
      console.log('HTTP 服务器已关闭');
      process.exit(0);
    });

    // 强制退出超时保护 (5秒)
    setTimeout(() => {
      console.warn('关闭超时，强制退出');
      process.exit(1);
    }, 5000);
  } else {
    process.exit(0);
  }
}

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise rejection:', reason);
});

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

bootstrap();
