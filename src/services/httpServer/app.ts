import userRoutes from './routes/user.route.js';
import cors from 'cors';
import dayjs from 'dayjs';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';

const app: express.Application = express();

app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(
    `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] ${req.method} ${
      req.originalUrl
    }`,
  );
  next();
});

app.use('/api', userRoutes);

// 404 处理
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// 全局错误处理中间件
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(
    `[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 未捕获错误:`,
    err.message,
  );
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    data: { error: err.message },
  });
});

export { app };
