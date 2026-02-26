import { io, Socket } from 'socket.io-client';
import { SessionRegistration } from '../shared/types';

export interface Connection {
  socket: Socket;
  sessionId: string;
  connected: boolean;
}

export function createConnection(
  serverUrl: string,
  token: string,
  sessionId: string
): Connection {
  const socket = io(`${serverUrl}/stream`, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity,
    transports: ['websocket'],
  });

  const conn: Connection = { socket, sessionId, connected: false };
  let errorCount = 0;

  process.stderr.write(`\x1b[90m[cc-live] connecting to ${serverUrl}...\x1b[0m\n`);

  socket.on('connect', () => {
    conn.connected = true;
    errorCount = 0;
    process.stderr.write(`\x1b[32m[cc-live] connected (session ${sessionId.slice(0, 8)})\x1b[0m\n`);
  });

  socket.on('disconnect', (reason: string) => {
    conn.connected = false;
    process.stderr.write(`\x1b[33m[cc-live] disconnected: ${reason}\x1b[0m\n`);
  });

  socket.on('connect_error', (err: Error) => {
    conn.connected = false;
    errorCount++;
    // Log first 3 errors, then every 10th to avoid spam
    if (errorCount <= 3 || errorCount % 10 === 0) {
      process.stderr.write(
        `\x1b[33m[cc-live] connection error (attempt ${errorCount}): ${err.message}\x1b[0m\n`
      );
    }
  });

  return conn;
}

export function sendRegister(
  conn: Connection,
  registration: Omit<SessionRegistration, 'sessionId'>
): void {
  conn.socket.emit('register', {
    ...registration,
    sessionId: conn.sessionId,
  });
}

export function sendOutput(conn: Connection, data: string): void {
  if (conn.connected) {
    conn.socket.volatile.emit('output', { data });
  }
}

export function sendResize(
  conn: Connection,
  cols: number,
  rows: number
): void {
  if (conn.connected) {
    conn.socket.emit('resize', { cols, rows });
  }
}

export function onRemoteInput(
  conn: Connection,
  handler: (data: string) => void
): void {
  conn.socket.on('remote-input', (payload: { data: string }) => {
    handler(payload.data);
  });
}

export function disconnect(conn: Connection): void {
  conn.socket.disconnect();
}
