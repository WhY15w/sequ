# Sequ

Sequ (seer-query | 赛蛆）是一个赛尔号数据查询服务。通过 TCP 长连接与游戏服务器通信，对外暴露基于 [Hono](https://hono.dev) 的 HTTP API，支持查询米米号信息、在线状态、战队信息、巅峰排行、投票排行等数据。

<img src="./img//logo.png" />

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [运行命令](#运行命令)
- [HTTP API](#http-api)
- [项目结构](#项目结构)
- [核心实现](#核心实现)
- [开发说明](#开发说明)

## 功能特性

- 纯协议层实现，直接构建和解析游戏服务器的原始封包
- 自动心跳保活
- 自动重连
- 重连前检测维护公告（`unity-notice.61.com`），维护期间暂停重试
- 重连失败 / 重连终止支持飞书 Webhook 告警

## 技术栈

| 类别      | 选型                                      |
| --------- | ----------------------------------------- |
| 运行时    | Node.js 22+                               |
| 语言      | TypeScript 6.x（ESM, `module: NodeNext`） |
| 包管理器  | pnpm 10+                                  |
| HTTP 框架 | Hono 4.x                                  |

## 环境要求

- Node.js 22+
- pnpm 10+

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 准备环境变量

macOS / Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. 编辑 `.env`，填写你的米米号和密码（`SERVICE_ACCOUNT_ID`、`SERVICE_ACCOUNT_PASSWORD`）

4. 启动开发服务器

```bash
pnpm dev
```

服务启动后 HTTP 服务器默认监听 `http://localhost:3000`。

## 配置说明

项目加载环境文件的优先级：

- **Windows 本地开发**：若工作目录下存在 `.env.development`，会**先**加载它
- 随后统一加载 `.env`（后加载的 `.env` 会覆盖 `.env.development` 中同名变量）

⚠ 所有 `.env*` 文件均已加入 `.gitignore`，切勿将真实账号密码提交到仓库。

### 环境变量一览

| 变量名                     | 说明                           | 默认值                                      | 必填 |
| -------------------------- | ------------------------------ | ------------------------------------------- | ---- |
| `GAME_SERVER_HOST`         | 游戏服务器地址                 | `175.24.235.221`                            | 否   |
| `GAME_SERVER_PORT`         | 游戏服务器端口                 | `1225`                                      | 否   |
| `SERVICE_ACCOUNT_ID`       | 登录米米号                     | `0`                                         | 是   |
| `SERVICE_ACCOUNT_PASSWORD` | 登录密码                       | `""`                                        | 是   |
| `PORT`                     | HTTP 服务端口                  | `3000`                                      | 否   |
| `LOG_CALLBACKS`            | 是否打印封包回调日志           | `true`                                      | 否   |
| `LOG_FULL_PACKET`          | 是否打印完整封包十六进制       | `false`                                     | 否   |
| `IGNORED_CMD_IDS`          | 日志屏蔽的命令 ID（`\|` 分隔） | `8002\|3452\|2004\|2001\|41228\|1002\|2002` | 否   |
| `FEISHU_WEBHOOK_URL`       | 飞书机器人 Webhook 地址        | `""`                                        | 否   |
| `FEISHU_WEBHOOK_SECRET`    | 飞书机器人签名密钥             | `""`                                        | 否   |

未配置 `SERVICE_ACCOUNT_ID` 或 `SERVICE_ACCOUNT_PASSWORD` 时，程序会打印警告但仍会启动。

## 运行命令

```bash
pnpm dev          # 开发模式（tsx 直接运行 TS，无需编译）
pnpm build        # TypeScript 编译到 dist/
pnpm start        # 编译后启动（等价于 pnpm build && node dist/index.js）
pnpm lint         # oxlint 检查
pnpm lint:fix     # oxlint 自动修复
pnpm format       # Prettier 格式化（含 import 排序）
```

## HTTP API

所有接口挂载在 `/api` 路径下。统一响应格式：

```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {}
}
```

### 1) GET /api/getUserOnlineStatus

查询米米号昵称和在线状态。

| 参数    | 类型   | 必填 | 说明                            |
| ------- | ------ | ---- | ------------------------------- |
| account | number | 是   | 米米号，范围 50000 ~ 2000000000 |

成功示例：

```json
{
  "success": true,
  "message": "数据返回成功",
  "code": 200,
  "data": {
    "account": "12345678",
    "nickName": "玩家昵称",
    "online": true,
    "server": "3"
  }
}
```

### 2) GET /api/getUserInfo

查询用户详细信息（含多段原始十六进制数据）。

| 参数    | 类型   | 必填 | 说明                            |
| ------- | ------ | ---- | ------------------------------- |
| account | number | 是   | 米米号，范围 50000 ~ 2000000000 |

成功示例：

```json
{
  "success": true,
  "message": "数据返回成功",
  "code": 200,
  "status": 1,
  "data": {
    "account": "12345678",
    "nickName": "玩家昵称",
    "online": false,
    "hexDataMore": "...",
    "hexDataSimple": "...",
    "hexDatapart1": "...",
    "hexDatapart2": "...",
    "hexDataPeak": "..."
  }
}
```

hex 字段说明：

| 字段          | 来源                        |
| ------------- | --------------------------- |
| hexDataMore   | cmd 2052 用户基础信息       |
| hexDataSimple | cmd 2051 简版信息           |
| hexDatapart1  | cmd 41298 param=1           |
| hexDatapart2  | cmd 41298 param=5           |
| hexDataPeak   | 循环请求 cmd 40002 拼接结果 |

### 3) GET /api/getTeamInfo

查询战队信息。

| 参数   | 类型   | 必填 | 说明              |
| ------ | ------ | ---- | ----------------- |
| teamId | number | 是   | 战队 ID（大于 0） |

成功示例：

```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {
    "teamId": "1001",
    "hexDataTeam": "..."
  }
}
```

### 4) GET /api/getVoteInfo

查询巅峰投票排行。

| 参数     | 类型   | 必填 | 说明                         |
| -------- | ------ | ---- | ---------------------------- |
| voteDate | number | 是   | 投票日期（例如 20210526）    |
| voteType | number | 否   | 0 限制级，1 准限制级，默认 0 |
| startIdx | number | 否   | 起始下标，默认 0             |
| endIdx   | number | 否   | 结束下标，默认 25            |

成功示例：

```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {
    "voteList": [{ "voteMonsterId": 3001, "voteCount": 12345 }]
  }
}
```

### 5) GET /api/getPeakRankInfo

查询巅峰排行榜。

| 参数     | 类型   | 必填 | 说明                                     |
| -------- | ------ | ---- | ---------------------------------------- |
| key      | number | 否   | 直接指定排行 key                         |
| page     | number | 否   | 页面类型：1 玩家，2 精灵，3 套装，4 称号 |
| mode     | number | 否   | 模式：0 竞技，1 狂野，2 专家，默认 0     |
| tab      | number | 否   | 子分类索引，默认 0                       |
| subkey   | number | 是   | 子 key                                   |
| startIdx | number | 否   | 起始下标，默认 0                         |
| endIdx   | number | 否   | 结束下标，默认 99                        |

当 `key` 未传或非法时，服务会根据 `page`、`mode`、`tab` 自动计算。

成功示例：

```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {
    "key": 120,
    "subkey": 20210526,
    "startIdx": 0,
    "endIdx": 99,
    "rankList": [{ "userid": 12345678, "score": 999999, "nick": "玩家昵称" }]
  }
}
```

### 6) GET /api/getBookAndAchieveRankInfo

查询图鉴或成就排行。

| 参数     | 类型   | 必填 | 说明              |
| -------- | ------ | ---- | ----------------- |
| type     | number | 是   | 0 图鉴，1 成就    |
| startIdx | number | 否   | 起始下标，默认 0  |
| endIdx   | number | 否   | 结束下标，默认 99 |

成功示例：

```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {
    "key": 156,
    "subkey": 1,
    "startIdx": 0,
    "endIdx": 99,
    "rankList": [{ "userid": 12345678, "score": 321, "nick": "玩家昵称" }]
  }
}
```

## 项目结构

```text
src/
  index.ts                            # 入口：tcpService.init() → HTTP 服务
  config/
    config.ts                         # 环境变量加载 + Settings 配置导出
  core/
    encrypt.ts                        # 封包加解密（密钥初始化、result 计算）
    login.ts                          # 账号登录：获取 session、TCP 建连、拼装登录包
  pkg/
    receive.ts                        # 接收封包解析
    send.ts                           # 封包发送处理
  services/
    tcpService.ts                     # TCP 生命周期管理（连接、心跳、重连）
    httpServer/
      app.ts                          # Hono 应用实例（CORS、日志、路由挂载）
      routes/
        user.route.ts                 # /api/* 路由定义
      controllers/
        user.controller.ts            # 用户 / 在线状态接口
        peak.controller.ts            # 巅峰排行 / 投票接口
        rank.controller.ts            # 图鉴 / 成就排行接口
  utils/
    commandDict.ts                    # 命令 ID ↔ 名称映射
    http/
      fetchData.ts                    # 维护公告抓取
      httpUtil.ts                     # HTTP 工具
      reply.ts                        # 统一响应构建
    pkg/
      builder.ts                      # 封包构建
      format.ts                       # 封包格式化
      parser.ts                       # 封包解析
      protocol.ts                     # 协议常量（HEADER_SIZE 等）
      reader.ts                       # 封包读取
    webHook/
      feishu.ts                       # 飞书 Webhook 推送
```

## 开发说明

- **ESM**：项目使用 `"type": "module"`，源码 import 路径必须带 `.js` 后缀（`moduleResolution: NodeNext`）
- **verbatimModuleSyntax**：`import type` 用于纯类型导入，不可用 `import { type Foo }`
- **isolatedModules**：禁止 enum 合并和 namespace 导出
- **strict** + **noUncheckedIndexedAccess**：严格类型检查
- **格式化**：单引号、分号、80 字符行宽，import 自动排序
- **测试**：当前仓库不含测试框架和测试文件

## 注意事项

- 返回的十六进制数据多为游戏协议原始字节，未做字段反序列化
- 对外错误信息以 `message` + `code` + `data.error` 为准
- 请勿将 `.env*` 文件或含真实账号密码的配置提交到版本控制
