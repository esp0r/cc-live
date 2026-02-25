import { Socket, Namespace } from 'socket.io';
import {
  SessionRegistry,
  registerSession,
  removeSessionBySocketId,
  getSessionBySocketId,
  appendOutput,
  updateSize,
  listSessions,
} from './registry';
import { SessionRegistration } from '../shared/types';

export function setupStreamHandlers(
  streamNs: Namespace,
  viewerNs: Namespace,
  registry: SessionRegistry
): void {
  streamNs.on('connection', (socket: Socket) => {
    console.log(`[stream] client connected: ${socket.id}`);

    socket.on('register', (data: SessionRegistration) => {
      const session = registerSession(
        registry,
        data.sessionId,
        data.hostname,
        data.cwd,
        data.cols,
        data.rows,
        socket.id
      );
      console.log(
        `[stream] session registered: ${data.sessionId} from ${data.hostname} (${data.cwd})`
      );
      viewerNs.emit('session-added', {
        sessionId: session.sessionId,
        hostname: session.hostname,
        cwd: session.cwd,
        cols: session.cols,
        rows: session.rows,
        connectedAt: session.connectedAt,
        viewerCount: 0,
      });
    });

    socket.on('output', (data: { data: string }) => {
      const session = getSessionBySocketId(registry, socket.id);
      if (!session) return;
      appendOutput(registry, session.sessionId, data.data);
      for (const viewerId of session.viewers) {
        viewerNs.to(viewerId).emit('session-output', {
          sessionId: session.sessionId,
          data: data.data,
        });
      }
    });

    socket.on('resize', (data: { cols: number; rows: number }) => {
      const session = getSessionBySocketId(registry, socket.id);
      if (!session) return;
      updateSize(registry, session.sessionId, data.cols, data.rows);
      for (const viewerId of session.viewers) {
        viewerNs.to(viewerId).emit('session-resize', {
          sessionId: session.sessionId,
          cols: data.cols,
          rows: data.rows,
        });
      }
    });

    socket.on('disconnect', () => {
      const session = removeSessionBySocketId(registry, socket.id);
      if (session) {
        console.log(`[stream] session disconnected: ${session.sessionId}`);
        viewerNs.emit('session-removed', { sessionId: session.sessionId });
      }
    });
  });
}
