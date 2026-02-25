import { Socket, Namespace } from 'socket.io';
import {
  SessionRegistry,
  getSession,
  addViewer,
  removeViewer,
  removeViewerFromAll,
  listSessions,
} from './registry';
import { SessionListItem } from '../shared/types';

export function setupViewerHandlers(
  viewerNs: Namespace,
  streamNs: Namespace,
  registry: SessionRegistry
): void {
  viewerNs.on('connection', (socket: Socket) => {
    console.log(`[viewer] browser connected: ${socket.id}`);

    socket.on(
      'list-sessions',
      (callback: (sessions: SessionListItem[]) => void) => {
        if (typeof callback === 'function') {
          callback(listSessions(registry));
        }
      }
    );

    socket.on('watch', (data: { sessionId: string }) => {
      const session = getSession(registry, data.sessionId);
      if (!session) {
        socket.emit('error', { message: 'Session not found' });
        return;
      }
      addViewer(registry, data.sessionId, socket.id);
      // Send scrollback buffer for catch-up
      if (session.scrollbackBuffer.length > 0) {
        socket.emit('scrollback', {
          sessionId: data.sessionId,
          data: session.scrollbackBuffer,
        });
      }
      // Send current terminal size
      socket.emit('session-resize', {
        sessionId: data.sessionId,
        cols: session.cols,
        rows: session.rows,
      });
      console.log(
        `[viewer] ${socket.id} watching session ${data.sessionId} (${session.viewers.size} viewers)`
      );
    });

    socket.on('unwatch', (data: { sessionId: string }) => {
      removeViewer(registry, data.sessionId, socket.id);
    });

    socket.on('input', (data: { sessionId: string; data: string }) => {
      const session = getSession(registry, data.sessionId);
      if (!session) return;
      // Relay input to the cc-live client via the stream namespace
      const streamSocket = streamNs.sockets.get(session.streamSocketId);
      if (streamSocket) {
        streamSocket.emit('remote-input', { data: data.data });
      }
    });

    socket.on('disconnect', () => {
      removeViewerFromAll(registry, socket.id);
      console.log(`[viewer] browser disconnected: ${socket.id}`);
    });
  });
}
