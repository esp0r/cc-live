import os from 'os';
import { randomUUID } from 'crypto';
import {
  createConnection,
  sendRegister,
  sendOutput,
  sendResize,
  onRemoteInput,
  disconnect,
} from './connection';
import { ClientConfig } from '../shared/types';

export async function startProxy(config: ClientConfig, args: string[]): Promise<void> {
  const pty = await import('node-pty');
  const sessionId = randomUUID();
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // Spawn claude in a PTY
  const ptyProcess = pty.spawn('claude', args, {
    name: 'xterm-256color',
    cols,
    rows,
    cwd: process.cwd(),
    env: process.env as { [key: string]: string },
  });

  // Enter raw mode (save original state for restore)
  let wasRaw = false;
  if (process.stdin.isTTY) {
    wasRaw = process.stdin.isRaw ?? false;
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  // Connect to streaming server
  if (process.env.CC_LIVE_DEBUG) {
    process.stderr.write(`\x1b[90m[cc-live] server=${config.serverUrl} token=${config.token ? '***' : '(empty)'}\x1b[0m\n`);
  }
  const conn = createConnection(config.serverUrl, config.token, sessionId);

  conn.socket.on('connect', () => {
    sendRegister(conn, {
      hostname: os.hostname(),
      cwd: process.cwd(),
      cols: process.stdout.columns || cols,
      rows: process.stdout.rows || rows,
    });
  });

  // Local I/O forwarding
  process.stdin.on('data', (data: Buffer) => {
    ptyProcess.write(data.toString());
  });

  ptyProcess.onData((data: string) => {
    process.stdout.write(data);
    sendOutput(conn, data);
  });

  // Remote input from browser viewers
  onRemoteInput(conn, (data: string) => {
    ptyProcess.write(data);
  });

  // Terminal resize
  process.on('SIGWINCH', () => {
    const newCols = process.stdout.columns || 80;
    const newRows = process.stdout.rows || 24;
    ptyProcess.resize(newCols, newRows);
    sendResize(conn, newCols, newRows);
  });

  // Cleanup: restore terminal and disconnect
  let cleaned = false;
  function cleanup(exitCode: number) {
    if (cleaned) return;
    cleaned = true;
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(wasRaw);
    }
    process.stdin.pause();
    disconnect(conn);
    process.exit(exitCode);
  }

  // When claude exits, cleanup with its exit code
  ptyProcess.onExit(({ exitCode }) => {
    cleanup(exitCode);
  });

  // Forward signals to the PTY process
  for (const sig of ['SIGTERM', 'SIGHUP'] as NodeJS.Signals[]) {
    process.on(sig, () => {
      ptyProcess.kill(sig);
    });
  }

  // Safety net: restore terminal on uncaught errors
  process.on('uncaughtException', (err) => {
    process.stderr.write(`\n[cc-live] fatal: ${err.message}\n`);
    cleanup(1);
  });
}
