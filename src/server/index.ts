#!/usr/bin/env node
import { createApp } from './app';

const config = {
  port: parseInt(process.env.CC_LIVE_PORT || process.env.PORT || '3000', 10),
  token: process.env.CC_LIVE_TOKEN || '',
};

if (!config.token) {
  console.warn(
    'WARNING: CC_LIVE_TOKEN not set. Server is running without authentication.'
  );
}

const { server } = createApp(config);

server.listen(config.port, () => {
  console.log(`cc-live-server running on port ${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}`);
});

const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received, shutting down...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
