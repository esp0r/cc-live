import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { createRegistry, listSessions } from './registry';
import { setupStreamHandlers } from './streamHandler';
import { setupViewerHandlers } from './viewerHandler';
import { ServerConfig } from '../shared/types';
import {
  BROWSER_SESSION_CLEANUP_MS,
  BROWSER_SESSION_COOKIE,
  BROWSER_SESSION_TTL_MS,
  createBrowserAuthStore,
  createBrowserSession,
  getBrowserSession,
  getBrowserSessionIdFromHeaders,
  purgeExpiredBrowserSessions,
  removeBrowserSession,
} from './auth';

function extractRequestToken(req: Request): string {
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string'
      ? authHeader.replace(/^Bearer\s+/i, '')
      : '';
  return queryToken || bearerToken;
}

function isRequestSecure(req: Request): boolean {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(forwardedProto)
    ? forwardedProto[0]
    : forwardedProto;
  return req.secure || proto === 'https';
}

function setBrowserSessionCookie(
  res: Response,
  sessionId: string,
  secure: boolean
): void {
  res.cookie(BROWSER_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: BROWSER_SESSION_TTL_MS,
  });
}

function clearBrowserSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(BROWSER_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
  });
}

export function createApp(config: ServerConfig) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e6,
  });

  const registry = createRegistry();
  const browserAuth = createBrowserAuthStore();
  const streamNs = io.of('/stream');
  const viewerNs = io.of('/viewer');

  app.set('trust proxy', true);

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  function getBrowserRequestSession(req: Request) {
    const sessionId = getBrowserSessionIdFromHeaders(req.headers);
    if (!sessionId) {
      return null;
    }
    return getBrowserSession(browserAuth, sessionId);
  }

  function disconnectViewerSocketsForAuthSession(sessionId: string): void {
    for (const socket of viewerNs.sockets.values()) {
      if (socket.data.authSessionId === sessionId) {
        socket.emit('auth-expired');
        socket.disconnect(true);
      }
    }
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', sessions: registry.sessions.size });
  });

  app.post('/api/auth/login', (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (config.token && token !== config.token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const existingSessionId = getBrowserSessionIdFromHeaders(req.headers);
    if (existingSessionId) {
      removeBrowserSession(browserAuth, existingSessionId);
      disconnectViewerSocketsForAuthSession(existingSessionId);
    }

    const session = createBrowserSession(browserAuth);
    setBrowserSessionCookie(res, session.id, isRequestSecure(req));
    res.json({ ok: true, expiresAt: session.expiresAt });
  });

  app.post('/api/auth/logout', (req, res) => {
    const sessionId = getBrowserSessionIdFromHeaders(req.headers);
    if (sessionId) {
      removeBrowserSession(browserAuth, sessionId);
      disconnectViewerSocketsForAuthSession(sessionId);
    }
    clearBrowserSessionCookie(res, isRequestSecure(req));
    res.json({ ok: true });
  });

  app.get('/api/sessions', (req, res) => {
    const browserSession = getBrowserRequestSession(req);
    const token = extractRequestToken(req);
    if (config.token && !browserSession && token !== config.token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json(listSessions(registry));
  });

  // Auth middleware for /stream namespace
  streamNs.use((socket, next) => {
    if (!config.token) return next();
    const token = socket.handshake.auth?.token;
    if (token === config.token) {
      next();
    } else {
      next(new Error('Authentication failed'));
    }
  });

  // Auth middleware for /viewer namespace
  viewerNs.use((socket, next) => {
    if (!config.token) return next();
    const sessionId = getBrowserSessionIdFromHeaders(socket.handshake.headers);
    if (!sessionId) {
      next(new Error('Authentication failed'));
      return;
    }

    const session = getBrowserSession(browserAuth, sessionId);
    if (session) {
      socket.data.authSessionId = session.id;
      next();
    } else {
      next(new Error('Authentication failed'));
    }
  });

  setInterval(() => {
    const expiredSessionIds = purgeExpiredBrowserSessions(browserAuth);
    if (expiredSessionIds.length === 0) {
      return;
    }

    const expiredSessionIdSet = new Set(expiredSessionIds);
    for (const socket of viewerNs.sockets.values()) {
      const authSessionId = socket.data.authSessionId;
      if (
        typeof authSessionId === 'string' &&
        expiredSessionIdSet.has(authSessionId)
      ) {
        socket.emit('auth-expired');
        socket.disconnect(true);
      }
    }
  }, BROWSER_SESSION_CLEANUP_MS);

  // Wire up handlers
  setupStreamHandlers(streamNs, viewerNs, registry);
  setupViewerHandlers(viewerNs, streamNs, registry);

  return { app, server, io, registry };
}
