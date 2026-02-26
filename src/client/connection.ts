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

  socket.on('connect', () => {
    conn.connected = true;
  });

  socket.on('disconnect', () => {
    conn.connected = false;
  });

  socket.on('connect_error', () => {
    conn.connected = false;
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
