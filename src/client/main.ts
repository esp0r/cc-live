import { spawnSync } from 'child_process';
import { startProxy } from './proxy';
import {
  ClientEntrypoint,
  createLaunchError,
  formatLog,
  resolveClientRuntime,
  shouldStartProxy,
} from './runtime';

export function runClient(entrypoint: ClientEntrypoint): void {
  const runtime = resolveClientRuntime(entrypoint);
  const args = process.argv.slice(2);

  if (!shouldStartProxy(runtime)) {
    const result = spawnSync(runtime.command, args, {
      stdio: 'inherit',
      env: process.env,
    });

    if (result.error) {
      process.stderr.write(
        `${formatLog(runtime, `fatal: ${createLaunchError(runtime, result.error).message}`)}\n`
      );
      process.exit(1);
      return;
    }

    process.exit(result.status ?? 1);
    return;
  }

  startProxy(
    { serverUrl: runtime.serverUrl, token: runtime.token },
    args,
    runtime
  ).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${formatLog(runtime, `fatal: ${message}`)}\n`);
    process.exit(1);
  });
}
