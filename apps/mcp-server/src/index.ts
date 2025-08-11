// MUST be first: load env before anything reads process.env
import "./env";

import http from "node:http";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { jwtVerify } from "jose";

const PORT = Number(process.env.PORT || 4000);
const SSE_PATH = process.env.MCP_SSE_PATH || "/mcp/sse";
const ALLOW_ORIGINS = (process.env.CORS_ALLOW_ORIGINS || "http://localhost:3000")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// Auth configuration
const REQUIRED_TOKEN = process.env.MCP_SERVER_TOKEN?.trim();
const SHARED_AUTH_SECRET = process.env.SHARED_AUTH_SECRET?.trim();
const AUTH_REQUIRED = process.env.MCP_AUTH_REQUIRED !== "false"; // set MCP_AUTH_REQUIRED=false to bypass in local dev

function resolveAllowedOrigin(reqOrigin?: string | null): string | null {
  if (!reqOrigin) return null;
  if (ALLOW_ORIGINS.includes("*")) return "*";
  return ALLOW_ORIGINS.includes(reqOrigin) ? reqOrigin : null;
}

const mcp = new McpServer(
  { name: "mcp-server", version: "0.1.0" },
  { capabilities: {} }
);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const origin = req.headers.origin as string | undefined;
  const allowedOrigin = resolveAllowedOrigin(origin || null);

  const setCors = () => {
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    if (!allowedOrigin && ALLOW_ORIGINS.includes("*")) res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Accept,Cache-Control,Content-Type");
  };

  // Always respond to preflight with CORS
  if (req.method === "OPTIONS") {
    setCors();
    res.statusCode = 204;
    res.setHeader("Access-Control-Max-Age", "600");
    res.end();
    return;
  }

  // Helpful: log when client disconnects/aborts
  req.on("aborted", () => console.warn("[MCP] Request aborted by client"));
  req.on("close", () => console.warn("[MCP] Request connection closed"));

  // Shared auth check
  const checkAuth = async () => {
    // Accept token via Bearer header OR access_token/token query params
    const auth = req.headers["authorization"];
    let providedToken: string | undefined;
    if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
      providedToken = auth.slice("Bearer ".length).trim();
    }
    if (!providedToken) {
      providedToken = url.searchParams.get("access_token") || url.searchParams.get("token") || undefined;
    }
    
    const bypass = AUTH_REQUIRED === false;
    if (bypass) {
      return { valid: true, bypass: true };
    }
    
    if (!providedToken) {
      return { valid: false, bypass: false };
    }
    
    // If we have a SHARED_AUTH_SECRET, validate as JWT
    if (SHARED_AUTH_SECRET) {
      try {
        const secret = new TextEncoder().encode(SHARED_AUTH_SECRET);
        const { payload } = await jwtVerify(providedToken, secret);
        return { valid: true, bypass: false, payload };
      } catch (error) {
        console.warn("[MCP] JWT validation failed:", error instanceof Error ? error.message : String(error));
        return { valid: false, bypass: false };
      }
    }
    
    // Fallback: simple string comparison with REQUIRED_TOKEN
    const valid = REQUIRED_TOKEN ? providedToken === REQUIRED_TOKEN : Boolean(providedToken);
    return { valid, bypass: false };
  };

  // SSE stream (GET)
  if (req.method === "GET" && url.pathname === SSE_PATH) {
    setCors();
    const { valid, bypass } = await checkAuth();
    if (!valid) {
      console.warn("[MCP] 401 Unauthorized: token missing or invalid (GET)");
      res.statusCode = 401;
      res.end("Unauthorized");
      return;
    }

    console.log("[MCP] SSE connect", {
      origin: origin ?? "(no origin)",
      authBypass: bypass,
      tokenConfigured: Boolean(REQUIRED_TOKEN),
      sharedSecretConfigured: Boolean(SHARED_AUTH_SECRET)
    });

    try {
      const transport = new SSEServerTransport(SSE_PATH, res);
      await mcp.connect(transport); // resolves when the client disconnects
      console.log("[MCP] SSE session ended");
    } catch (e) {
      console.error("[MCP] SSE error:", e);
      try { res.end(); } catch {}
    }
    return;
  }

  // Outbound messages from client (POST)
  if (req.method === "POST" && url.pathname === SSE_PATH) {
    setCors();
    const { valid } = await checkAuth();
    if (!valid) {
      console.warn("[MCP] 401 Unauthorized: token missing or invalid (POST)");
      res.statusCode = 401;
      res.end("Unauthorized");
      return;
    }

    try {
      // Different SDK versions expose different static handlers for POST
      const AnySSE = SSEServerTransport as any;
      if (typeof AnySSE.handlePost === "function") {
        await AnySSE.handlePost(req, res);
      } else if (typeof AnySSE.post === "function") {
        await AnySSE.post(req, res);
      } else {
        // If your SDK lacks a static POST handler, upgrade SDK or implement your own router per its docs
        res.statusCode = 501;
        res.end("Server transport POST handler not available");
      }
    } catch (e) {
      console.error("[MCP] SSE POST error:", e);
      res.statusCode = 500;
      res.end("Error handling POST");
    }
    return;
  }

  // Not found: include CORS so the browser shows a 404 instead of a CORS error
  setCors();
  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`MCP SSE listening at http://localhost:${PORT}${SSE_PATH}`);
  console.log(`Allowed CORS origins: ${ALLOW_ORIGINS.join(", ")}`);
  console.log(`Auth: required=${AUTH_REQUIRED}, tokenConfigured=${Boolean(REQUIRED_TOKEN)}, sharedSecretConfigured=${Boolean(SHARED_AUTH_SECRET)}`);
});
