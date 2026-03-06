import { ClientConfig } from '../shared/types';

export type ClientEntrypoint = 'cc-live' | 'codex-live';

interface ClientProfile {
  defaultCommand: string;
  displayName: string;
  commandEnvVars: string[];
  debugEnvVars: string[];
}

export interface ClientRuntime extends ClientConfig {
  entrypoint: ClientEntrypoint;
  command: string;
  displayName: string;
  logPrefix: string;
  debug: boolean;
  commandEnvVars: string[];
}

const CLIENT_PROFILES: Record<ClientEntrypoint, ClientProfile> = {
  'cc-live': {
    defaultCommand: 'claude',
    displayName: 'Claude',
    commandEnvVars: ['CC_LIVE_COMMAND'],
    debugEnvVars: ['CC_LIVE_DEBUG'],
  },
  'codex-live': {
    defaultCommand: 'codex',
    displayName: 'Codex',
    commandEnvVars: ['CODEX_LIVE_COMMAND', 'CC_LIVE_COMMAND'],
    debugEnvVars: ['CODEX_LIVE_DEBUG', 'CC_LIVE_DEBUG'],
  },
};

export function resolveClientRuntime(entrypoint: ClientEntrypoint): ClientRuntime {
  const profile = CLIENT_PROFILES[entrypoint];

  return {
    entrypoint,
    command: readFirstEnv(profile.commandEnvVars) ?? profile.defaultCommand,
    displayName: profile.displayName,
    logPrefix: entrypoint,
    debug: readBooleanEnv(profile.debugEnvVars),
    commandEnvVars: profile.commandEnvVars,
    serverUrl: process.env.CC_LIVE_SERVER?.trim() || '',
    token: process.env.CC_LIVE_TOKEN || '',
  };
}

export function shouldStartProxy(runtime: ClientRuntime): boolean {
  return runtime.serverUrl !== '';
}

export function formatLog(
  runtime: Pick<ClientRuntime, 'logPrefix'>,
  message: string
): string {
  return `[${runtime.logPrefix}] ${message}`;
}

export function createLaunchError(
  runtime: Pick<ClientRuntime, 'command' | 'commandEnvVars' | 'displayName'>,
  error: unknown
): Error {
  if (isErrnoException(error) && error.code === 'ENOENT') {
    const overrideEnv = runtime.commandEnvVars[0];
    return new Error(
      `${runtime.displayName} CLI not found: expected \`${runtime.command}\` on PATH. Install it or set \`${overrideEnv}\` to another executable.`
    );
  }

  if (error instanceof Error) {
    return new Error(
      `failed to launch ${runtime.displayName} CLI (\`${runtime.command}\`): ${error.message}`
    );
  }

  return new Error(
    `failed to launch ${runtime.displayName} CLI (\`${runtime.command}\`).`
  );
}

function readFirstEnv(envNames: string[]): string | undefined {
  for (const envName of envNames) {
    const value = process.env[envName]?.trim();
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readBooleanEnv(envNames: string[]): boolean {
  for (const envName of envNames) {
    const value = process.env[envName];
    if (!value) {
      continue;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === '0' || normalized === 'false' || normalized === 'no') {
      continue;
    }

    return true;
  }

  return false;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
