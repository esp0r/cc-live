// --- Session registration payload (client -> server) ---
export interface SessionRegistration {
  sessionId: string;
  hostname: string;
  cwd: string;
  cols: number;
  rows: number;
}

// --- Session info stored in server registry ---
export interface SessionInfo {
  sessionId: string;
  hostname: string;
  cwd: string;
  cols: number;
  rows: number;
  connectedAt: number;
  streamSocketId: string;
  viewers: Set<string>;
  scrollbackBuffer: string;
  disconnectedAt?: number;
}

// --- Session info exposed to viewers ---
export interface SessionListItem {
  sessionId: string;
  hostname: string;
  cwd: string;
  cols: number;
  rows: number;
  connectedAt: number;
  viewerCount: number;
}

// --- Config ---
export interface ServerConfig {
  port: number;
  token: string;
}

export interface ClientConfig {
  serverUrl: string;
  token: string;
}
