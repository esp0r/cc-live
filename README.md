# cc-live

Live streaming and remote control for Claude Code terminal sessions.

Transparently wraps the `claude` CLI with a PTY proxy that streams terminal I/O to a central server in real-time. A web dashboard lets you watch and control all active sessions from any browser.

```
Developer Machine(s)                    Public Server
┌──────────────┐                      ┌──────────────────┐
│ Terminal      │                      │  cc-live-server   │
│  ↕            │                      │                   │
│ cc-live       │───── WebSocket ────→ │  /stream (clients) │
│  ↕            │                      │  /viewer (browsers)│
│ claude (CLI)  │                      │  Web Dashboard     │
└──────────────┘                      └──────────────────┘
                                             ↕
Developer Machine B                    Browser (xterm.js)
└── cc-live ──── WebSocket ────→       - view all sessions
                                       - type to control
```

## How It Works

- **`cc-live`** (client) spawns `claude` inside a PTY via `node-pty`. All stdin/stdout passes through to your local terminal as normal. Simultaneously, terminal output is streamed to the server over WebSocket. Remote input from the browser is written back into the PTY.

- **`cc-live-server`** (server) runs on a machine with a public IP. It accepts streaming connections from clients (`/stream` namespace) and browser viewers (`/viewer` namespace). Each session maintains a 100KB scrollback buffer so new viewers get immediate context.

- **Passthrough mode**: when `CC_LIVE_SERVER` is not set, `cc-live` directly executes `claude` with zero overhead — no PTY, no WebSocket, no extra dependencies loaded.

## Install

```bash
git clone https://github.com/esp0r/cc-live.git
cd cc-live
npm install
npm run build
npm link
```

This installs two global commands: `cc-live` and `cc-live-server`.

## Setup

### Server (public IP machine)

```bash
CC_LIVE_TOKEN=your-secret-token CC_LIVE_PORT=3000 cc-live-server
```

For production, put behind nginx/caddy for TLS and use pm2 or systemd:

```bash
# systemd example
CC_LIVE_TOKEN=your-secret-token CC_LIVE_PORT=3000 pm2 start cc-live-server --name cc-live
```

### Client (development machines)

Add to `~/.bashrc` or `~/.zshrc`:

```bash
export CC_LIVE_SERVER="ws://your-server-ip:3000"   # or wss:// with TLS
export CC_LIVE_TOKEN="your-secret-token"
alias claude='cc-live'
```

Then use `claude` as normal. The streaming happens transparently in the background.

### Dashboard

Open `http://your-server-ip:3000` in a browser. Enter your token to connect.

- Left sidebar shows all active sessions (hostname, working directory, duration)
- Click a session to open a live terminal view
- Type in the terminal to send input to the remote session
- Multiple sessions can be opened in tabs

## Architecture

```
src/
├── shared/
│   └── types.ts              # Shared interfaces
├── client/
│   ├── index.ts              # CLI entry point (passthrough or proxy)
│   ├── proxy.ts              # PTY proxy core
│   └── connection.ts         # WebSocket connection management
└── server/
    ├── index.ts              # Server entry point
    ├── app.ts                # Express + Socket.io setup
    ├── registry.ts           # Session registry + scrollback buffer
    ├── streamHandler.ts      # /stream namespace handlers
    └── viewerHandler.ts      # /viewer namespace handlers
public/
    └── index.html            # Web dashboard (xterm.js)
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Slow network handling | `volatile.emit` (drop frames) | Never block the local terminal |
| Viewer catch-up | 100KB scrollback buffer replay | Simple and reliable |
| Passthrough mode | `spawnSync` (no deps loaded) | Zero overhead when not streaming |
| Namespaces | `/stream` + `/viewer` | Separate concerns, independent auth |
| Auth | Shared token (`CC_LIVE_TOKEN`) | Simple for v1, upgradable to JWT |

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `CC_LIVE_SERVER` | Client | WebSocket URL of the server (`ws://` or `wss://`) |
| `CC_LIVE_TOKEN` | Both | Shared authentication token |
| `CC_LIVE_PORT` / `PORT` | Server | Server listen port (default: 3000) |

## License

MIT
