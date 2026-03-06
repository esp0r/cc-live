# Repository Instructions

## Commands

- Install dependencies: `npm install`
- Build the project: `npm run build`
- Run the `cc-live` entry in development: `npm run dev:client`
- Run the `codex-live` entry in development: `npm run dev:codex`
- Run the server in development: `npm run dev:server`
- Run the built server: `npm run start:server`

## Architecture

- `src/client/index.ts` is the `cc-live` entry and defaults to `claude`.
- `src/client/codex.ts` is the `codex-live` entry and defaults to `codex`.
- `src/client/main.ts` and `src/client/runtime.ts` contain the shared client flow.
- `src/client/proxy.ts` is the PTY path used when `CC_LIVE_SERVER` is set.
- `src/server/` contains the Express and Socket.IO server.

## Environment

- Keep `CC_LIVE_SERVER`, `CC_LIVE_TOKEN`, `CC_LIVE_PORT`, and `CC_LIVE_DEBUG` as the shared connection environment variables.
- `CC_LIVE_COMMAND` overrides the executable used by `cc-live`.
- `CODEX_LIVE_COMMAND` overrides the executable used by `codex-live`.
- `cc-live-server` remains the only server binary unless the user explicitly asks for a rename.

## Validation

- After client or server changes, run `npm run build`.
- If `claude` is installed, smoke test the built `cc-live` entry with `node dist/client/index.js --version`.
- If `codex` is installed, smoke test the built `codex-live` entry with `node dist/client/codex.js --version`.
- To exercise proxy mode locally, run `CC_LIVE_TOKEN=test npm run dev:server` and point a client at `CC_LIVE_SERVER=ws://127.0.0.1:3000`.

## Constraints

- Prefer shared implementation changes over duplicating logic between `cc-live` and `codex-live`.
- Do not rename the package or `CC_LIVE_*` connection variables unless the user explicitly asks for it.
- There is no dedicated lint or test script today, so validation is build-first plus smoke tests.
