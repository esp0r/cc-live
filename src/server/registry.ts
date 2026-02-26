import { SessionInfo, SessionListItem } from '../shared/types';

const SCROLLBACK_MAX = 100 * 1024; // 100KB

export interface SessionRegistry {
  sessions: Map<string, SessionInfo>;
  socketToSession: Map<string, string>; // streamSocketId -> sessionId
}

export function createRegistry(): SessionRegistry {
  return {
    sessions: new Map(),
    socketToSession: new Map(),
  };
}

export function registerSession(
  registry: SessionRegistry,
  sessionId: string,
  hostname: string,
  cwd: string,
  cols: number,
  rows: number,
  streamSocketId: string
): SessionInfo {
  const session: SessionInfo = {
    sessionId,
    hostname,
    cwd,
    cols,
    rows,
    connectedAt: Date.now(),
    streamSocketId,
    viewers: new Set(),
    scrollbackBuffer: '',
  };
  registry.sessions.set(sessionId, session);
  registry.socketToSession.set(streamSocketId, sessionId);
  return session;
}

export function removeSession(
  registry: SessionRegistry,
  sessionId: string
): SessionInfo | null {
  const session = registry.sessions.get(sessionId);
  if (!session) return null;
  registry.sessions.delete(sessionId);
  if (session.streamSocketId) {
    registry.socketToSession.delete(session.streamSocketId);
  }
  return session;
}

export function removeSessionBySocketId(
  registry: SessionRegistry,
  streamSocketId: string
): SessionInfo | null {
  const sessionId = registry.socketToSession.get(streamSocketId);
  if (!sessionId) return null;
  return removeSession(registry, sessionId);
}

export function markDisconnected(
  registry: SessionRegistry,
  sessionId: string
): boolean {
  const session = registry.sessions.get(sessionId);
  if (!session) return false;
  if (session.streamSocketId) {
    registry.socketToSession.delete(session.streamSocketId);
  }
  session.streamSocketId = '';
  session.disconnectedAt = Date.now();
  return true;
}

export function reconnectSession(
  registry: SessionRegistry,
  sessionId: string,
  newSocketId: string
): SessionInfo | null {
  const session = registry.sessions.get(sessionId);
  if (!session || !session.disconnectedAt) return null;
  session.streamSocketId = newSocketId;
  session.disconnectedAt = undefined;
  registry.socketToSession.set(newSocketId, sessionId);
  return session;
}

export function getExpiredSessions(
  registry: SessionRegistry,
  graceMs: number
): string[] {
  const now = Date.now();
  const expired: string[] = [];
  for (const session of registry.sessions.values()) {
    if (session.disconnectedAt && now - session.disconnectedAt > graceMs) {
      expired.push(session.sessionId);
    }
  }
  return expired;
}

export function getSession(
  registry: SessionRegistry,
  sessionId: string
): SessionInfo | undefined {
  return registry.sessions.get(sessionId);
}

export function getSessionBySocketId(
  registry: SessionRegistry,
  streamSocketId: string
): SessionInfo | undefined {
  const sessionId = registry.socketToSession.get(streamSocketId);
  if (!sessionId) return undefined;
  return registry.sessions.get(sessionId);
}

export function appendOutput(
  registry: SessionRegistry,
  sessionId: string,
  data: string
): void {
  const session = registry.sessions.get(sessionId);
  if (!session) return;
  session.scrollbackBuffer += data;
  if (session.scrollbackBuffer.length > SCROLLBACK_MAX) {
    session.scrollbackBuffer = session.scrollbackBuffer.slice(
      session.scrollbackBuffer.length - SCROLLBACK_MAX
    );
  }
}

export function updateSize(
  registry: SessionRegistry,
  sessionId: string,
  cols: number,
  rows: number
): void {
  const session = registry.sessions.get(sessionId);
  if (!session) return;
  session.cols = cols;
  session.rows = rows;
}

export function addViewer(
  registry: SessionRegistry,
  sessionId: string,
  viewerSocketId: string
): boolean {
  const session = registry.sessions.get(sessionId);
  if (!session) return false;
  session.viewers.add(viewerSocketId);
  return true;
}

export function removeViewer(
  registry: SessionRegistry,
  sessionId: string,
  viewerSocketId: string
): boolean {
  const session = registry.sessions.get(sessionId);
  if (!session) return false;
  return session.viewers.delete(viewerSocketId);
}

export function removeViewerFromAll(
  registry: SessionRegistry,
  viewerSocketId: string
): void {
  for (const session of registry.sessions.values()) {
    session.viewers.delete(viewerSocketId);
  }
}

export function listSessions(registry: SessionRegistry): SessionListItem[] {
  return Array.from(registry.sessions.values()).map((s) => ({
    sessionId: s.sessionId,
    hostname: s.hostname,
    cwd: s.cwd,
    cols: s.cols,
    rows: s.rows,
    connectedAt: s.connectedAt,
    viewerCount: s.viewers.size,
  }));
}
