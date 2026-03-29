# seer-query

"seer-query" 用于查询赛尔号中的米米号信息，玩家在线状态，战队信息等相关数据

## 环境要求

- Node.js (推荐 v18+ 或 v20+)
- pnpm (或 npm/yarn)

## 安装依赖

```bash
pnpm install
```

## 配置文件

```bash
cp .env.example .env
```

在运行项目之前，您需要在根目录下创建一个 `.env` 文件，用于设置配置。您可以参考提供的 `.env.example` 文件。

```bash
cp .env.example .env
```

并根据您的实际情况修改 `.env` 文件中的配置项：

- `GAME_SERVER_HOST`: 目标服务器地址
- `GAME_SERVER_PORT`: 目标服务器端口
- `SERVICE_ACCOUNT_ID`: 用户米米号 (必填)
- `SERVICE_ACCOUNT_PASSWORD`: 账号密码 (必填)

## 运行项目

**开发模式**：

```bash
pnpm dev
```

使用 `ts-node` 直接运行。

**生产模式**：
先进行编译构建，然后运行：

```bash
pnpm build
pnpm start
```

或者直接使用 `pnpm start`（该命令包含了构建与运行步骤）。

## 项目结构

- `/src/config`: 项目和环境变量配置解析
- `/src/core`: 核心认证与加密逻辑
- `/src/pkg`: 封包的接收和发送处理
- `/src/services`: TCP/HTTP 等相关通信服务
- `/src/utils`: 公共工具库
