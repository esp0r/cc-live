import { randomUUID } from 'crypto';
import { IncomingHttpHeaders } from 'http';

export const BROWSER_SESSION_COOKIE = 'cc-live-session';
export const BROWSER_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const BROWSER_SESSION_CLEANUP_MS = 60 * 1000;

export interface BrowserAuthSession {
  id: string;
  createdAt: number;
  expiresAt: number;
}

export interface BrowserAuthStore {
  sessions: Map<string, BrowserAuthSession>;
}

export function createBrowserAuthStore(): BrowserAuthStore {
  return {
    sessions: new Map(),
  };
}

export function createBrowserSession(
  store: BrowserAuthStore,
  ttlMs: number = BROWSER_SESSION_TTL_MS
): BrowserAuthSession {
  const now = Date.now();
  const session: BrowserAuthSession = {
    id: randomUUID(),
    createdAt: now,
    expiresAt: now + ttlMs,
  };
  store.sessions.set(session.id, session);
  return session;
}

export function getBrowserSession(
  store: BrowserAuthStore,
  sessionId: string
): BrowserAuthSession | null {
  const session = store.sessions.get(sessionId);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    store.sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function removeBrowserSession(
  store: BrowserAuthStore,
  sessionId: string
): BrowserAuthSession | null {
  const session = store.sessions.get(sessionId);
  if (!session) {
    return null;
  }
  store.sessions.delete(sessionId);
  return session;
}

export function purgeExpiredBrowserSessions(
  store: BrowserAuthStore
): string[] {
  const now = Date.now();
  const expired: string[] = [];
  for (const [sessionId, session] of store.sessions.entries()) {
    if (session.expiresAt <= now) {
      expired.push(sessionId);
      store.sessions.delete(sessionId);
    }
  }
  return expired;
}

export function getBrowserSessionIdFromHeaders(
  headers: IncomingHttpHeaders
): string | null {
  const cookies = parseCookieHeader(headers.cookie);
  return cookies[BROWSER_SESSION_COOKIE] || null;
}

function parseCookieHeader(
  cookieHeader: string | string[] | undefined
): Record<string, string> {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join(';') : cookieHeader;
  if (!raw) {
    return {};
  }

  return raw.split(';').reduce<Record<string, string>>((acc, pair) => {
    const trimmed = pair.trim();
    if (!trimmed) {
      return acc;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return acc;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) {
      return acc;
    }

    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
}
