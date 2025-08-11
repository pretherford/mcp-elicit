# MCP Elicitation Demo (TypeScript)

This project demonstrates:
- An MCP server that elicits multi-step input (wizard) with validation and file upload
- A Next.js web client with Google OAuth (NextAuth) that connects to the MCP server via WebSocket
- Server-enforced WebSocket auth using a short-lived signed token
- Server-side file persistence
- Tailwind CSS styling

## Prerequisites
- Node 18+
- Google OAuth credentials (Client ID & Secret)
- A shared secret for MCP auth (`SHARED_AUTH_SECRET`)

## Setup

1) Install deps
```bash
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
```

2) Configure environment

Create `apps/web/.env.local`:
```
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-random-string
GOOGLE_ID=your-google-client-id
GOOGLE_SECRET=your-google-client-secret
NEXT_PUBLIC_MCP_SERVER_URL=ws://localhost:4000
SHARED_AUTH_SECRET=replace-with-strong-shared-secret
```

Create `apps/mcp-server/.env` (or export env vars):
```
PORT=4000
UPLOAD_DIR=./uploads
SHARED_AUTH_SECRET=replace-with-strong-shared-secret
```

The `SHARED_AUTH_SECRET` must match in both apps.

3) Run dev
```bash
pnpm dev
```
- MCP server: ws://localhost:4000
- Web app: http://localhost:3000

4) In the browser
- Sign in with Google
- Click "Start Elicitation Demo"
- Complete steps (Basic info → Preferences → Age & Avatar)
- Upload an image (PNG/JPEG <= 1MB)
- See validation feedback and server-persisted file path

# MCP SSE setup

This repo is configured to use SSE for the MCP client/server connection.

Why SSE?
- Works in browsers with Authorization headers (WebSockets don’t reliably carry auth headers in the handshake).
- Matches the SDK exports available in current versions.

## Requirements

- @modelcontextprotocol/sdk latest across the monorepo.

Upgrade:
```bash
pnpm -w up @modelcontextprotocol/sdk@latest
pnpm install
```

Verify the SSE entrypoints resolve:
```bash
node -p "require.resolve('@modelcontextprotocol/sdk/client/sse', { paths: [require('path').resolve('apps/web')] })"
node -p "require.resolve('@modelcontextprotocol/sdk/server/sse', { paths: [require('path').resolve('apps/mcp-server')] })"
```

## Server

The MCP server exposes an SSE endpoint (default /mcp/sse) and expects a Bearer token:

- File: apps/mcp-server/src/index.ts
- Env:
  - PORT (default 8787)
  - MCP_SSE_PATH (default /mcp/sse)
  - CORS_ALLOW_ORIGIN (default *)

Run:
```bash
pnpm -C apps/mcp-server dev
```

## Web client

Use SseClientTransport and pass the token in the Authorization header.

- File: apps/web/app/lib/mcpClient.ts

Example:
```ts
import { connectMcp } from "./lib/mcpClient";

const sseUrl = process.env.NEXT_PUBLIC_MCP_SSE_URL || "http://localhost:8787/mcp/sse";
const token = (await fetch("/api/mcp-token")).ok ? (await (await fetch("/api/mcp-token")).json()).token : undefined;

const client = await connectMcp(sseUrl, token);
```

## Troubleshooting

- “Cannot find module .../client/sse”: you’re on an SDK version without SSE client export. Upgrade with:
  - `pnpm -w up @modelcontextprotocol/sdk@latest && pnpm install`
- Browser Network: SSE request should be 200 and remain “Pending”. Response `Content-Type: text/event-stream`.
- CORS: If your web origin is different, set `CORS_ALLOW_ORIGIN` to that exact origin (e.g., `http://localhost:3000`).
