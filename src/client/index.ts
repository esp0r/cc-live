#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { startProxy } from './proxy';

function main(): void {
  const serverUrl = process.env.CC_LIVE_SERVER;
  const token = process.env.CC_LIVE_TOKEN || '';
  const args = process.argv.slice(2);

  // Passthrough mode: no server configured -> exec claude directly, zero overhead
  if (!serverUrl) {
    const result = spawnSync('claude', args, {
      stdio: 'inherit',
      env: process.env,
    });
    process.exit(result.status ?? 1);
    return;
  }

  // Live mode: PTY proxy with streaming
  startProxy({ serverUrl, token }, args).catch((err) => {
    process.stderr.write(`[cc-live] fatal: ${err.message}\n`);
    process.exit(1);
  });
}

main();
