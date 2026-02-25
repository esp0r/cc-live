import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import cors from 'cors';
import { createRegistry, listSessions } from './registry';
import { setupStreamHandlers } from './streamHandler';
import { setupViewerHandlers } from './viewerHandler';
import { ServerConfig } from '../shared/types';

export function createApp(config: ServerConfig) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e6,
  });

  const registry = createRegistry();

  app.use(cors());
  app.use(express.static(path.join(__dirname, '../../public')));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', sessions: registry.sessions.size });
  });

  app.get('/api/sessions', (req, res) => {
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');
    if (config.token && token !== config.token) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.json(listSessions(registry));
  });

  // Auth middleware for /stream namespace
  const streamNs = io.of('/stream');
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
  const viewerNs = io.of('/viewer');
  viewerNs.use((socket, next) => {
    if (!config.token) return next();
    const token =
      socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token === config.token) {
      next();
    } else {
      next(new Error('Authentication failed'));
    }
  });

  // Wire up handlers
  setupStreamHandlers(streamNs, viewerNs, registry);
  setupViewerHandlers(viewerNs, streamNs, registry);

  return { app, server, io, registry };
}
