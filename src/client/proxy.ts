import os from 'os';
import { randomUUID } from 'crypto';
import {
  createConnection,
  sendRegister,
  sendOutput,
  sendResize,
  onRemoteInput,
  disconnect,
  flushPendingOutput,
} from './connection';
import { ClientConfig } from '../shared/types';
import { ClientRuntime, createLaunchError, formatLog } from './runtime';

export async function startProxy(
  config: ClientConfig,
  args: string[],
  runtime: ClientRuntime
): Promise<void> {
  let pty: typeof import('node-pty');
  try {
    pty = await import('node-pty');
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : '';
    throw new Error(
      `proxy mode requires the optional dependency \`node-pty\`${reason}`
    );
  }
  const sessionId = randomUUID();
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  const ptyProcess = (() => {
    try {
      return pty.spawn(runtime.command, args, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: process.cwd(),
        env: process.env as { [key: string]: string },
      });
    } catch (error) {
      throw createLaunchError(runtime, error);
    }
  })();

  let wasRaw = false;
  if (process.stdin.isTTY) {
    wasRaw = process.stdin.isRaw ?? false;
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();

  if (runtime.debug) {
    process.stderr.write(
      `\x1b[90m${formatLog(runtime, `server=${config.serverUrl} token=${config.token ? '***' : '(empty)'}`)}\x1b[0m\n`
    );
  }
  const conn = createConnection(config.serverUrl, config.token, sessionId, runtime);

  conn.socket.on('connect', () => {
    sendRegister(conn, {
      hostname: os.hostname(),
      cwd: process.cwd(),
      cols: process.stdout.columns || cols,
      rows: process.stdout.rows || rows,
    });
    flushPendingOutput(conn);
  });

  process.stdin.on('data', (data: Buffer) => {
    ptyProcess.write(data.toString());
  });

  ptyProcess.onData((data: string) => {
    process.stdout.write(data);
    sendOutput(conn, data);
  });

  onRemoteInput(conn, (data: string) => {
    ptyProcess.write(data);
  });

  process.on('SIGWINCH', () => {
    const newCols = process.stdout.columns || 80;
    const newRows = process.stdout.rows || 24;
    ptyProcess.resize(newCols, newRows);
    sendResize(conn, newCols, newRows);
  });

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

  ptyProcess.onExit(({ exitCode }) => {
    cleanup(exitCode);
  });

  for (const sig of ['SIGTERM', 'SIGHUP'] as NodeJS.Signals[]) {
    process.on(sig, () => {
      ptyProcess.kill(sig);
    });
  }

  process.on('uncaughtException', (err) => {
    process.stderr.write(`\n${formatLog(runtime, `fatal: ${err.message}`)}\n`);
    cleanup(1);
  });
}
