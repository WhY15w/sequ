# seer-query

`seer-query` 是一个面向赛尔号游戏的数据查询服务，通过维持一条持久的加密 TCP 连接，向外暴露 HTTP API，可查询玩家米米号信息、在线状态、巅峰排名、精灵展示卡以及战队信息等数据。

## 目录

- [特性](#特性)
- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [配置项说明](#配置项说明)
- [运行项目](#运行项目)
- [HTTP API 接口](#http-api-接口)
- [项目结构](#项目结构)
- [实现原理](#实现原理)

---

## 特性

- 使用真实游戏账号登录，通过 TCP 协议与游戏服务器通信
- 自动维持心跳（每 5 分钟）保活长连接
- 断线自动重连，支持指数退避策略（2 s → 30 s）
- 重连前检测服务器维护状态

---

## 环境要求

- Node.js v18+ 或 v20+
- pnpm（或 npm / yarn）

---

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 复制配置文件并填写账号信息
cp .env.example .env

# 3. 以开发模式启动
pnpm dev
```

---

## 配置项说明

在根目录创建 `.env` 文件（可参考 `.env.example`），各配置项含义如下：

| 环境变量 | 说明 | 默认值 | 是否必填 |
|---|---|---|---|
| `GAME_SERVER_HOST` | 游戏服务器地址 | `175.24.235.221` | 否 |
| `GAME_SERVER_PORT` | 游戏服务器端口 | `1225` | 否 |
| `SERVICE_ACCOUNT_ID` | 登录用米米号 | — | **必填** |
| `SERVICE_ACCOUNT_PASSWORD` | 登录密码 | — | **必填** |
| `LOG_FULL_PACKET` | 是否记录完整封包十六进制数据 | `false` | 否 |
| `IGNORED_CMD_IDS` | 不打印日志的命令 ID 列表，以 `\|` 分隔 | `8002\|3452\|...` | 否 |

> ⚠️ 请勿将包含真实账号密码的 `.env` 文件提交至版本控制系统。

---

## 运行项目

**开发模式**（使用 `ts-node` 直接运行 TypeScript，无需编译）：

```bash
pnpm dev
```

**生产模式**（先编译，再运行）：

```bash
pnpm build   # TypeScript 编译输出至 dist/
pnpm start   # 等价于 tsc && node dist/index.js
```

服务默认监听 **3000** 端口（可通过环境变量 `PORT` 修改）。

---

## HTTP API 接口

所有接口均返回统一 JSON 结构：

```json
{
  "success": true,
  "message": "ok",
  "data": { ... }
}
```

---

### `GET /api/getUserOnlineStatus`

查询玩家昵称与在线状态。

**请求参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `account` | number | 玩家米米号（范围：50,000 ~ 2,000,000,000）|

**响应示例**

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "account": 12345678,
    "nickName": "玩家昵称",
    "online": true,
    "server": 3
  }
}
```

**data 字段说明**

| 字段 | 类型 | 说明 |
|---|---|---|
| `account` | number | 查询的米米号 |
| `nickName` | string | 玩家昵称 |
| `online` | boolean | 是否在线 |
| `server` | number | 当前所在服务器 ID（离线时不返回）|

---

### `GET /api/getUserInfo`

查询玩家的完整个人资料，包含简介、在线状态、巅峰排名、精灵卡片等原始十六进制数据。

**请求参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `account` | number | 玩家米米号（范围：50,000 ~ 2,000,000,000）|

**响应示例**

```json
{
  "success": true,
  "message": "ok",
  "status": "online",
  "data": {
    "account": 12345678,
    "nickName": "玩家昵称",
    "online": false,
    "hexDataMore": "...",
    "hexDataSimple": "...",
    "hexDataPrat1": "...",
    "hexDataPrat2": "...",
    "hexDataPeak": "..."
  }
}
```

**data 字段说明**

| 字段 | 说明 |
|---|---|
| `hexDataMore` | cmdId 2052 返回的完整信息（含昵称等基础数据）|
| `hexDataSimple` | cmdId 2051 返回的简版个人资料 |
| `hexDataPrat1` | cmdId 41298（param=1）返回的精英精灵/成就/皮肤数据 |
| `hexDataPrat2` | cmdId 41298（param=5）返回的名片展示精灵数据 |
| `hexDataPeak` | cmdId 40002 返回的巅峰赛各赛季排名数据（竞技/荒野/专家共 12 组）|

> 以上十六进制数据均为游戏协议原始字节，具体字段解析未在此项目实现。

---

### `GET /api/getTeamInfo`

查询战队信息。

**请求参数**

| 参数 | 类型 | 说明 |
|---|---|---|
| `teamId` | number | 战队 ID |

**响应示例**

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "teamId": 1001,
    "hexDataTeam": "..."
  }
}
```

**data 字段说明**

| 字段 | 说明 |
|---|---|
| `hexDataTeam` | cmdId 2917 返回的战队原始数据 |

---

## 项目结构

```
src/
├── index.ts              # 入口：初始化 TCP 服务后启动 HTTP 服务器
├── config/
│   ├── config.ts         # 环境变量加载与类型安全访问
│   └── Command.json      # 游戏命令 ID → 命令名映射表
├── core/
│   ├── login.ts          # 登录认证：获取 session token、发送登录封包
│   └── encrypt.ts        # 对称加密/解密（XOR + 位旋转 + 循环缓冲区旋转）
├── pkg/
│   ├── send.ts           # 封包构建、加密、发送及 sendAndReceive 封装
│   └── receive.ts        # TCP 流缓冲、封包解析、命令路由
├── services/
│   ├── httpServer.ts     # Express HTTP API 路由（3 个接口）
│   └── tcpService.ts     # TCP 连接管理：心跳、断线重连、请求超时
└── utils/
    ├── pkgBuilder.ts     # 链式封包构建器（setCmdId / addU32 / addU16 ...）
    ├── reader.ts         # 二进制缓冲区读取工具（BufferReader / BitUtil）
    ├── format.ts         # 十六进制格式化输出
    ├── fetchData.ts      # 查询游戏维护公告
    └── httpUtil.ts       # HTTP 工具函数
```

---

## 实现原理

### 1. 启动流程

```
bootstrap()
  └── tcpService.init()
        ├── Login.login()           # 获取 session token，建立 TCP 连接
        ├── 等待 cmdId 1001 封包    # 服务器下发加密密钥
        └── Algorithms.InitKey()   # 基于 MD5(lastUint ^ userId) 更新密钥
  └── httpServer.listen(3000)
```

### 2. 封包格式（二进制协议）

```
+----------+----------+------------+----------+----------+--------+
|  4 bytes |  1 byte  |   4 bytes  |  4 bytes |  4 bytes | N bytes|
|  Length  | Version  | Command ID |  User ID | Checksum |  Body  |
|          |  (0x31)  |            |          |  (CRC8)  |        |
+----------+----------+------------+----------+----------+--------+
```

### 3. 加密算法

1. 对每个字节进行 XOR 运算（使用密钥 `!crAckmE4nOthIng:-)`）
2. 对字节进行循环左移 5 位 / 右移 3 位的位旋转
3. 对密钥缓冲区进行循环旋转
4. 首次收到 cmdId 1001 时，使用 `MD5(lastUint ^ userId)` 的前 10 字节更新密钥

### 4. 认证流程

1. 对密码进行 MD5 哈希，POST 至 `https://account-co.61.com/index.php` 获取 session token
2. 使用 session token 构建登录封包，通过 TCP 发送至游戏服务器
3. 等待服务器返回 cmdId 1001 完成密钥交换，连接就绪

### 5. 连接保活与容错

- **心跳**：每 5 分钟发送一次 cmdId 2157 封包
- **断线重连**：指数退避（2 s → 4 s → 8 s … 最大 30 s）
- **维护检测**：重连前轮询 `http://unity-notice.61.com` 判断是否处于维护状态
- **请求超时**：每次 `sendAndReceive` 最多等待 5 秒
