# seer-query

seer-query 是一个关于赛尔号的数据查询服务项目。直接通过 TCP 连接与游戏服务器通信，并通过 Hono 暴露 HTTP API，用于查询米米号信息、在线状态、战队信息、巅峰排行和投票排行等数据。

## 目录

- [功能特性](#功能特性)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [运行命令](#运行命令)
- [HTTP API](#http-api)
- [项目结构](#项目结构)
- [核心实现](#核心实现)

## 功能特性

- 真实账号登录，保持与游戏服的 TCP 长连接
- 自动心跳保活（5 分钟）
- 自动重连（指数退避，2 秒到 30 秒）
- 重连前检测维护公告，避免维护期无效重试
- 重连失败可通过飞书 Webhook 告警
- 统一 JSON 响应结构，便于上游调用

## 环境要求

- Node.js 18+
- pnpm 10+

## 快速开始

1. 安装依赖

```bash
pnpm install
```

2. 准备环境变量

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. 填写服务账号配置后启动

```bash
pnpm dev
```

## 配置说明

项目会优先加载以下环境文件：

- Windows 本地开发：若存在 `.env.development`，会先加载它
- 其后统一加载 `.env`

常用环境变量如下：

| 变量名                   | 说明                                 | 默认值              | 必填 |
| ------------------------ | ------------------------------------ | ------------------- | ---- |
| GAME_SERVER_HOST         | 游戏服务器地址                       | 175.24.235.221      | 否   |
| GAME_SERVER_PORT         | 游戏服务器端口                       | 1225                | 否   |
| SERVICE_ACCOUNT_ID       | 登录米米号                           | 0                   | 是   |
| SERVICE_ACCOUNT_PASSWORD | 登录密码                             | 空字符串            | 是   |
| PORT                     | HTTP 服务端口                        | 3000                | 否   |
| LOG_CALLBACKS            | 是否打印封包回调日志（true/false/1） | true                | 否   |
| LOG_FULL_PACKET          | 是否打印完整封包十六进制日志         | false               | 否   |
| IGNORED_CMD_IDS          | 日志忽略命令 ID，使用竖线分隔        | 8002\|3452\|2004... | 否   |
| FEISHU_WEBHOOK_URL       | 飞书机器人地址（重连告警）           | 空字符串            | 否   |
| FEISHU_WEBHOOK_SECRET    | 飞书机器人密钥（重连告警）           | 空字符串            | 否   |

说明：

- 未配置 SERVICE_ACCOUNT_ID 或 SERVICE_ACCOUNT_PASSWORD 时，程序会打印警告。
- 请勿将真实账号密码提交到仓库。

## 运行命令

开发模式（tsx 直接运行 TS）：

```bash
pnpm dev
```

构建：

```bash
pnpm build
```

生产启动（先编译再启动）：

```bash
pnpm start
```

代码质量：

```bash
pnpm lint
pnpm lint:fix
pnpm format
```

## HTTP API

基础路径：`/api`

统一响应体：

```json
{
  "success": true,
  "message": "获取成功",
  "code": 200,
  "data": {}
}
```

部分接口会额外返回 `status` 字段。

### 1) GET /api/getUserOnlineStatus

用途：查询米米号昵称和在线状态。

请求参数：

| 参数    | 类型   | 必填 | 说明                             |
| ------- | ------ | ---- | -------------------------------- |
| account | number | 是   | 米米号，范围 50000 到 2000000000 |

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

用途：查询用户详细信息（包含多段原始十六进制数据）。

请求参数：

| 参数    | 类型   | 必填 | 说明                             |
| ------- | ------ | ---- | -------------------------------- |
| account | number | 是   | 米米号，范围 50000 到 2000000000 |

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

字段说明：

- hexDataMore：cmd 2052 返回的用户基础信息
- hexDataSimple：cmd 2051 返回的简版信息
- hexDatapart1：cmd 41298 param=1
- hexDatapart2：cmd 41298 param=5
- hexDataPeak：循环请求 cmd 40002 的拼接结果

### 3) GET /api/getTeamInfo

用途：查询战队信息。

请求参数：

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

用途：查询巅峰投票排行。

请求参数：

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
    "voteList": [
      {
        "voteMonsterId": 3001,
        "voteCount": 12345
      }
    ]
  }
}
```

### 5) GET /api/getPeakRankInfo

用途：查询巅峰排行榜。

请求参数：

| 参数     | 类型   | 必填 | 说明                                       |
| -------- | ------ | ---- | ------------------------------------------ |
| key      | number | 否   | 直接指定排行 key                           |
| page     | number | 否   | 页面类型（1 玩家，2 精灵，3 套装，4 称号） |
| mode     | number | 否   | 模式（0 竞技，1 狂野，2 专家），默认 0     |
| tab      | number | 否   | 子分类索引，默认 0                         |
| subkey   | number | 是   | 子 key                                     |
| startIdx | number | 否   | 起始下标，默认 0                           |
| endIdx   | number | 否   | 结束下标，默认 99                          |

当 key 未传或非法时，服务会根据 page、mode、tab 自动计算 key。

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
    "rankList": [
      {
        "userid": 12345678,
        "score": 999999,
        "nick": "玩家昵称"
      }
    ]
  }
}
```

### 6) GET /api/getBookAndAchieveRankInfo

用途：查询图鉴或成就排行。

请求参数：

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
    "rankList": [
      {
        "userid": 12345678,
        "score": 321,
        "nick": "玩家昵称"
      }
    ]
  }
}
```

## 项目结构

```text
src/
  index.ts
  config/
    config.ts
    Command.json
  core/
    encrypt.ts
    login.ts
  pkg/
    receive.ts
    send.ts
  services/
    tcpService.ts
    httpServer/
      app.ts
      routes/
        user.route.ts
      controllers/
        user.controller.ts
        peak.controller.ts
        rank.controller.ts
  utils/
    commandDict.ts
    http/
      fetchData.ts
      httpUtil.ts
      reply.ts
    pkg/
      builder.ts
      format.ts
      parser.ts
      protocol.ts
      reader.ts
    webHook/
      feishu.ts
```

## 核心实现

### 启动流程

1. 启动入口执行 `tcpService.init()`。
2. 调用账号系统获取 session，并建立 TCP 连接。
3. 等待登录后密钥初始化完成。
4. 标记连接就绪，启动心跳。
5. 启动 HTTP 服务（默认 3000 端口）。

### 认证流程

1. 对密码做单次 MD5。
2. 请求 `https://account-co.61.com/index.php` 获取 session。
3. 拼装登录封包（cmd 1001）并写入 socket。

### 连接管理

- 心跳：每 5 分钟发送一次 cmd 2157。
- 自动重连：连接断开后进入重连循环。
- 退避策略：2s、4s、8s...最大 30s。
- 最大次数：连续失败 10 次后停止自动重连。
- 维护检测：重连前请求 `http://unity-notice.61.com/unity_notice/`，维护时 60 秒后重试。
- 告警：每次重连失败和最终终止可推送飞书消息。

### TCP 封包与响应

- sendAndReceive 默认超时 5000ms。
- 发送失败或检测到 socket 断开时，会触发重连并自动重试一次。
- 业务层拿到的是去掉 17 字节头部后的 body。

## 注意事项

- 本项目返回的十六进制数据多为游戏协议原始字节，未做完整字段反序列化。
- 对外错误信息以 message + code + data.error 为准。
