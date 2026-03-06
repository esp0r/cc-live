# cc-live

Claude Code 终端会话的实时直播与远程控制。

透明地包装 `claude` CLI，通过 PTY 代理将终端 I/O 实时流式传输到中央服务器。Web 仪表盘可以在任何浏览器中查看和控制所有活跃会话。

```
开发者机器                                公网服务器
┌──────────────┐                      ┌──────────────────┐
│ Terminal      │                      │  cc-live-server   │
│  ↕            │                      │                   │
│ cc-live       │───── WebSocket ────→ │  /stream (客户端)  │
│  ↕            │                      │  /viewer (浏览器)  │
│ claude (CLI)  │                      │  Web 仪表盘        │
└──────────────┘                      └──────────────────┘
                                             ↕
开发者机器 B                            浏览器 (xterm.js)
└── cc-live ──── WebSocket ────→       - 查看所有会话
                                       - 输入以控制远程终端
```

## 工作原理

- **`cc-live`**（客户端）通过 `node-pty` 在 PTY 中启动 `claude`。所有 stdin/stdout 照常传输到你的本地终端，同时终端输出通过 WebSocket 流式传输到服务器。浏览器端的远程输入也会写回 PTY。

- **`cc-live-server`**（服务器）运行在公网可访问的机器上。它接受来自客户端的流式连接（`/stream` 命名空间）和浏览器查看器的连接（`/viewer` 命名空间）。每个会话维护 100KB 的回滚缓冲区，新查看者可以立即获取上下文。

- **直通模式**：当 `CC_LIVE_SERVER` 未设置时，`cc-live` 直接执行 `claude`，零开销 — 无 PTY、无 WebSocket、不加载额外依赖。

## 一键部署到 Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/Q1ekKo?referralCode=PS5zDA&utm_medium=integration&utm_source=template&utm_campaign=generic)

点击上方按钮即可将 `cc-live-server` 部署到 Railway。

### 部署后配置

1. **设置环境变量**：在 Railway 项目的 Variables 页面添加 `CC_LIVE_TOKEN`（认证令牌），`PORT` 由 Railway 自动注入，无需手动设置
2. **开启公网访问**：进入 Settings → Networking → Public Networking，点击生成域名（会得到一个 `xxx.railway.app` 地址）
3. **客户端连接**：
   ```bash
   export CC_LIVE_SERVER="wss://你的应用.railway.app"
   export CC_LIVE_TOKEN="你设置的令牌"
   cc-live
   ```
4. **打开仪表盘**：在浏览器中访问 `https://你的应用.railway.app`，输入一次令牌后会换成短期 `HttpOnly` Cookie 会话

## 安装

```bash
git clone https://github.com/esp0r/cc-live.git
cd cc-live
npm install
npm run build
npm link
```

这将安装两个全局命令：`cc-live` 和 `cc-live-server`。

## 配置

### 服务器（公网 IP 机器）

```bash
CC_LIVE_TOKEN=your-secret-token CC_LIVE_PORT=3000 cc-live-server
```

生产环境建议使用 nginx/caddy 做 TLS 反向代理，并用 pm2 或 systemd 管理进程：

```bash
CC_LIVE_TOKEN=your-secret-token CC_LIVE_PORT=3000 pm2 start cc-live-server --name cc-live
```

### 客户端（开发机器）

在 `~/.bashrc` 或 `~/.zshrc` 中添加：

```bash
export CC_LIVE_SERVER="ws://你的服务器IP:3000"   # 使用 TLS 则为 wss://
export CC_LIVE_TOKEN="your-secret-token"
alias claude='cc-live'
```

之后正常使用 `claude` 即可，流式传输在后台透明进行。

### 仪表盘

在浏览器中打开 `http://你的服务器IP:3000`，输入令牌后由服务端设置短期 `HttpOnly` Cookie 会话。

也可以用一次性链接自动登录：

```text
https://你的服务器域名?token=your-secret-token
```

页面会在完成登录后立即清掉 URL 中的 `token` 参数，不会写入 Web Storage。

- 左侧栏显示所有活跃会话（主机名、工作目录、持续时间）
- 点击会话打开实时终端视图
- 在终端中输入可向远程会话发送指令
- 可同时打开多个会话标签页
- 点击 `Logout` 可立即撤销当前浏览器会话

## 项目结构

```
src/
├── shared/
│   └── types.ts              # 共享接口定义
├── client/
│   ├── index.ts              # CLI 入口（直通或代理模式）
│   ├── proxy.ts              # PTY 代理核心
│   └── connection.ts         # WebSocket 连接管理
└── server/
    ├── index.ts              # 服务器入口
    ├── app.ts                # Express + Socket.io 初始化
    ├── auth.ts               # 浏览器 Cookie 会话鉴权
    ├── registry.ts           # 会话注册表 + 回滚缓冲区
    ├── streamHandler.ts      # /stream 命名空间处理
    └── viewerHandler.ts      # /viewer 命名空间处理
public/
    └── index.html            # Web 仪表盘 (xterm.js)
```

### 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 慢网络处理 | `volatile.emit`（丢帧） | 永不阻塞本地终端 |
| 查看者追赶 | 100KB 回滚缓冲区重放 | 简单可靠 |
| 直通模式 | `spawnSync`（不加载依赖） | 不流式传输时零开销 |
| 命名空间 | `/stream` + `/viewer` | 关注点分离，独立认证 |
| 认证方式 | CLI 共享令牌 + 浏览器 `HttpOnly` Cookie 会话 | 浏览器不再持有明文令牌，仍保持部署简单 |

## 环境变量

| 变量 | 使用位置 | 说明 |
|------|----------|------|
| `CC_LIVE_SERVER` | 客户端 | 服务器的 WebSocket 地址（`ws://` 或 `wss://`） |
| `CC_LIVE_TOKEN` | 两端 | 共享认证令牌 |
| `CC_LIVE_PORT` / `PORT` | 服务器 | 监听端口（默认：3000） |

## 许可证

MIT
