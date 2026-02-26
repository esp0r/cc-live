import { Socket, Namespace } from 'socket.io';
import {
  SessionRegistry,
  registerSession,
  removeSession,
  getSessionBySocketId,
  appendOutput,
  updateSize,
  markDisconnected,
  reconnectSession,
  getExpiredSessions,
} from './registry';
import { SessionRegistration } from '../shared/types';

const GRACE_PERIOD_MS = 30_000; // 30 seconds

export function setupStreamHandlers(
  streamNs: Namespace,
  viewerNs: Namespace,
  registry: SessionRegistry
): void {
  // Periodically clean up sessions that exceeded the grace period
  setInterval(() => {
    const expired = getExpiredSessions(registry, GRACE_PERIOD_MS);
    for (const sessionId of expired) {
      const session = removeSession(registry, sessionId);
      if (session) {
        console.log(`[stream] session expired after grace period: ${sessionId}`);
        viewerNs.emit('session-removed', { sessionId });
      }
    }
  }, 5_000);

  streamNs.on('connection', (socket: Socket) => {
    console.log(`[stream] client connected: ${socket.id}`);

    socket.on('register', (data: SessionRegistration) => {
      // Check if this is a reconnection (same sessionId with a disconnected session)
      const existing = reconnectSession(registry, data.sessionId, socket.id);
      if (existing) {
        console.log(`[stream] session reconnected: ${data.sessionId}`);
        updateSize(registry, data.sessionId, data.cols, data.rows);
        viewerNs.emit('session-reconnected', {
          sessionId: existing.sessionId,
          cols: data.cols,
          rows: data.rows,
        });
        return;
      }

      // New session registration
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
      const session = getSessionBySocketId(registry, socket.id);
      if (session) {
        console.log(`[stream] session disconnected (grace period): ${session.sessionId}`);
        markDisconnected(registry, session.sessionId);
        viewerNs.emit('session-disconnected', { sessionId: session.sessionId });
      }
    });
  });
}
