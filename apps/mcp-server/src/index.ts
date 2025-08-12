// MUST be first: load env before anything reads process.env
import "./env";

import http from "node:http";
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { jwtVerify } from "jose";

// Extend IncomingMessage to allow adding body property
declare module "node:http" {
  interface IncomingMessage {
    body?: string;
  }
}

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
const ENABLE_SET_RH = process.env.MCP_ENABLE_SET_RH === "true"; // opt-in to setRequestHandler registration

// Session tracking - map sessionId to authentication status
const validSessions = new Map<string, { valid: boolean, lastAccess: number }>();

function resolveAllowedOrigin(reqOrigin?: string | null): string | null {
  if (!reqOrigin) return null;
  // If '*' is configured, reflect the request origin to support credentials safely
  if (ALLOW_ORIGINS.includes("*")) return reqOrigin;
  return ALLOW_ORIGINS.includes(reqOrigin) ? reqOrigin : null;
}

const mcp = new McpServer(
  { name: "mcp-server", version: "0.1.0" },
  { capabilities: { tools: { listChanged: true } } }
);

// Track active SSE transports by sessionId to route POST messages
const activeTransports = new Map<string, SSEServerTransport>();

// --- Tool registration and handlers -------------------------------------------------

// Tool input/output types
interface ProfileInput {
  name?: string;
  email?: string;
  bio?: string;
  avatar?: string; // Base64 data URL
  sessionId?: string;
}

interface ProfileResult {
  kind: "requiresAction" | "validationError" | "success";
  message?: string;
  received?: any;
  elicitation?: {
    title: string;
    description?: string;
    fields: Array<{
      name: string;
      label: string;
      type: "text" | "email" | "textarea" | "file";
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      errors?: string[];
    }>;
  };
  thumbnailDataUrl?: string;
  persistedFile?: {
    path: string;
    size: number;
  };
}

async function handleCollectProfile(input: ProfileInput): Promise<ProfileResult> {
  console.log("[MCP] collect_profile called with:", {
    name: input?.name,
    email: input?.email,
    bio: Boolean(input?.bio),
    avatar: input?.avatar ? `${input.avatar.substring(0, 30)}... (${input.avatar.length} chars)` : undefined,
    sessionId: input?.sessionId
  });

  const safe = (v: any) => (v === null || v === undefined ? undefined : v);
  const inName = safe(input?.name);
  const inEmail = safe(input?.email);
  const inBio = safe(input?.bio);
  const inAvatar = safe(input?.avatar);

  // If this is the first call with no input, return the form definition
  if (!inName && !inEmail && !inBio && !inAvatar) {
    return {
      kind: "requiresAction",
      elicitation: {
        title: "Profile Information",
        description: "Please provide your profile information to continue.",
        fields: [
          { name: "name", label: "Full Name", type: "text", required: true, minLength: 2 },
          { name: "email", label: "Email Address", type: "email", required: true },
          { name: "bio", label: "Short Bio", type: "textarea", required: false, maxLength: 500 },
          { name: "avatar", label: "Profile Picture", type: "file", required: false },
        ],
      },
    };
  }

  // Validate input
  const errors: Record<string, string[]> = {};
  if (!inName || String(inName).length < 2) errors.name = ["Name is required and must be at least 2 characters"];
  if (!inEmail || !String(inEmail).includes("@")) errors.email = ["A valid email address is required"];
  if (inBio && String(inBio).length > 500) errors.bio = ["Bio cannot exceed 500 characters"];

  if (Object.keys(errors).length > 0) {
    return {
      kind: "validationError",
      message: "Please correct the errors in your submission",
      elicitation: {
        title: "Profile Information",
        description: "Please correct the errors below.",
        fields: [
          { name: "name", label: "Full Name", type: "text", required: true, minLength: 2, errors: errors.name },
          { name: "email", label: "Email Address", type: "email", required: true, errors: errors.email },
          { name: "bio", label: "Short Bio", type: "textarea", required: false, maxLength: 500, errors: errors.bio },
          { name: "avatar", label: "Profile Picture", type: "file", required: false, errors: errors.avatar },
        ],
      },
    };
  }

  // All validation passed, return success
  let thumbnailDataUrl: string | undefined;
  let persistedFile: { path: string; size: number } | undefined;
  if (inAvatar && String(inAvatar).startsWith("data:")) {
    try {
      thumbnailDataUrl = String(inAvatar);
      const size = String(inAvatar).length;
      persistedFile = { path: `/uploads/avatars/${Date.now()}_profile.jpg`, size };
    } catch (e) {
      console.error("[MCP] Error processing avatar:", e);
    }
  }

  return {
    kind: "success",
    message: `Thank you, ${inName}! Your profile has been saved.`,
    received: { name: inName, email: inEmail, bio: inBio, avatarProvided: !!inAvatar },
    thumbnailDataUrl,
    persistedFile,
  };
}

function registerTools() {
  try {
    const anyMcp = mcp as any;

    // 1) methods.register (if supported)
    if (anyMcp.methods && typeof anyMcp.methods.register === "function") {
      anyMcp.methods.register("tools/call", async (params: any) => {
        const { name, arguments: args } = params || {};
        if (name === "collect_profile" || name === "collectProfile") {
          return handleCollectProfile(args || {});
        }
        throw new Error(`Unknown tool: ${name}`);
      });
      anyMcp.methods.register("collectProfile", async (params: any) => handleCollectProfile(params || {}));
      anyMcp.methods.register("collect_profile", async (params: any) => handleCollectProfile(params || {}));
      console.log("[MCP] Registered methods via methods.register");
      return;
    }

    // 2) setRequestHandler (object signature) - gated
    if (ENABLE_SET_RH && typeof anyMcp.setRequestHandler === "function") {
      try {
        const toParams = (arg: any) => (arg && typeof arg === "object" && "params" in arg ? (arg as any).params : arg);
        anyMcp.setRequestHandler({ method: "tools/call" }, async (reqOrParams: any) => {
          const { name, arguments: args } = toParams(reqOrParams) || {};
          if (name === "collect_profile" || name === "collectProfile") {
            return handleCollectProfile(args || {});
          }
          throw new Error(`Unknown tool: ${name}`);
        });
        anyMcp.setRequestHandler({ method: "collectProfile" }, async (reqOrParams: any) => handleCollectProfile(toParams(reqOrParams) || {}));
        anyMcp.setRequestHandler({ method: "collect_profile" }, async (reqOrParams: any) => handleCollectProfile(toParams(reqOrParams) || {}));
        console.log("[MCP] Registered handlers via setRequestHandler (object signature)");
        return;
      } catch (e) {
        console.warn("[MCP] setRequestHandler registration failed, falling back:", e);
      }
    }
    if (!ENABLE_SET_RH && typeof anyMcp.setRequestHandler === "function") {
      console.log("[MCP] Skipping setRequestHandler registration (MCP_ENABLE_SET_RH not set)");
    }

    // 3) requestHandlers map/object
    if (anyMcp.requestHandlers) {
      try {
        const makeHandlers = () => ({
          toolsCall: async (params: any) => {
            const { name, arguments: args } = params || {};
            if (name === "collect_profile" || name === "collectProfile") {
              return handleCollectProfile(args || {});
            }
            throw new Error(`Unknown tool: ${name}`);
          },
          collectProfile: async (params: any) => handleCollectProfile(params || {}),
          collect_profile: async (params: any) => handleCollectProfile(params || {}),
        });
        const h = makeHandlers();
        if (typeof anyMcp.requestHandlers.set === "function") {
          anyMcp.requestHandlers.set("tools/call", h.toolsCall);
          anyMcp.requestHandlers.set("collectProfile", h.collectProfile);
          anyMcp.requestHandlers.set("collect_profile", h.collect_profile);
          console.log("[MCP] Registered via requestHandlers Map");
          return;
        }
        if (typeof anyMcp.requestHandlers === "object") {
          anyMcp.requestHandlers["tools/call"] = h.toolsCall;
          anyMcp.requestHandlers["collectProfile"] = h.collectProfile;
          anyMcp.requestHandlers["collect_profile"] = h.collect_profile;
          console.log("[MCP] Registered via requestHandlers object");
          return;
        }
      } catch (e) {
        console.warn("[MCP] requestHandlers registration failed:", e);
      }
    }

    // 4) addTool / registerTool / tools.register
    if (typeof anyMcp.addTool === "function") {
      const inputSchema = {
        type: "object",
        properties: { name: { type: "string" }, email: { type: "string" }, bio: { type: "string" }, avatar: { type: "string" }, sessionId: { type: "string" } },
        additionalProperties: true,
      };
      anyMcp.addTool({ name: "collectProfile", description: "Collect a user profile", inputSchema }, async (args: any) => handleCollectProfile(args || {}));
      anyMcp.addTool({ name: "collect_profile", description: "Collect a user profile", inputSchema }, async (args: any) => handleCollectProfile(args || {}));
      console.log("[MCP] Registered tools via addTool");
      return;
    }
    if (typeof anyMcp.registerTool === "function") {
      anyMcp.registerTool("collect_profile", handleCollectProfile);
      anyMcp.registerTool("collectProfile", handleCollectProfile);
      console.log("[MCP] Registered tools via registerTool");
      return;
    }
    if (anyMcp.tools && typeof anyMcp.tools.register === "function") {
      anyMcp.tools.register("collect_profile", handleCollectProfile);
      anyMcp.tools.register("collectProfile", handleCollectProfile);
      console.log("[MCP] Registered tools via tools.register");
      return;
    }

    // 5) Fallback: handleRequest override
    const originalHandle = anyMcp.handleRequest?.bind(anyMcp);
    anyMcp.handleRequest = async (request: any) => {
      try {
        if (request?.method === "collectProfile" || request?.method === "collect_profile") {
          const params = request?.params || {};
          return handleCollectProfile(params);
        }
        if (request?.method === "tools/call") {
          const { name, arguments: args } = request?.params || {};
          if (name === "collect_profile" || name === "collectProfile") {
            return handleCollectProfile(args || {});
          }
        }
      } catch (e) {
        console.error("[MCP] handleRequest error:", e);
        throw e;
      }
      if (originalHandle) return await originalHandle(request);
      throw new Error(`Unknown method: ${request?.method}`);
    };
    console.log("[MCP] Registered tools via handleRequest fallback");
  } catch (e) {
    console.error("[MCP] Error registering tools:", e);
  }
}

// Register tools once on startup
registerTools();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
  const origin = req.headers.origin as string | undefined;
  const allowedOrigin = resolveAllowedOrigin(origin || null);

  // Log request details to help debug
  // Minimal request log for debugging
  // console.log(`[MCP] ${req.method} ${url.pathname}`);

  const setCors = () => {
    if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    // Reflect requested headers to satisfy preflight for custom headers used by the SDK (e.g., x-sse-session)
    const acrh = req.headers["access-control-request-headers"] as string | undefined;
    const defaultAllowed = "Authorization,Accept,Cache-Control,Content-Type,X-SSE-Session,X-MCP-Session,X-Requested-With";
    res.setHeader("Access-Control-Allow-Headers", acrh && acrh.length ? acrh : defaultAllowed);
    // Expose session header for clients if needed
    res.setHeader("Access-Control-Expose-Headers", "X-SSE-Session,Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  };

  // Always respond to preflight with CORS
  if (req.method === "OPTIONS") {
    setCors();
    res.statusCode = 204;
    res.setHeader("Access-Control-Max-Age", "600");
    res.end();
    return;
  }

  // Shared auth check
  const checkAuth = async (sessionIdFromBody?: string | null) => {
    // Accept token via Bearer header OR access_token/token query params
    const auth = req.headers["authorization"];
    let providedToken: string | undefined;
    if (auth && typeof auth === "string" && auth.startsWith("Bearer ")) {
      providedToken = auth.slice("Bearer ".length).trim();
    }
    if (!providedToken) {
      providedToken = url.searchParams.get("access_token") || url.searchParams.get("token") || undefined;
    }
    
    // Get session ID from URL or passed in from body
    const sessionId = url.searchParams.get("sessionId") || sessionIdFromBody || null;
    
    const bypass = AUTH_REQUIRED === false;
    if (bypass) {
      if (sessionId) {
        validSessions.set(sessionId, { valid: true, lastAccess: Date.now() });
      }
      return { valid: true, bypass: true };
    }
    
    // Check if this is a POST request with a valid session ID
    if (req.method === "POST" && sessionId && validSessions.has(sessionId)) {
      // Update last access time
      const session = validSessions.get(sessionId);
      if (session) {
        session.lastAccess = Date.now();
        validSessions.set(sessionId, session);
      }
      return { valid: true, bypass: false, sessionAuth: true };
    }
    
    if (!providedToken) {
      return { valid: false, bypass: false };
    }
    
    // If we have a SHARED_AUTH_SECRET, validate as JWT
    if (SHARED_AUTH_SECRET) {
      try {
        const secret = new TextEncoder().encode(SHARED_AUTH_SECRET);
        const { payload } = await jwtVerify(providedToken, secret);
        
        // Store session as authenticated if we have a sessionId
        if (sessionId) {
          validSessions.set(sessionId, { valid: true, lastAccess: Date.now() });
        }
        
        return { valid: true, bypass: false, payload };
      } catch (error) {
        console.warn("[MCP] JWT validation failed:", error instanceof Error ? error.message : String(error));
        return { valid: false, bypass: false };
      }
    }
    
    // Fallback: simple string comparison with REQUIRED_TOKEN
    const valid = REQUIRED_TOKEN ? providedToken === REQUIRED_TOKEN : Boolean(providedToken);
    
    // Store session as authenticated if we have a sessionId
    if (valid && sessionId) {
      validSessions.set(sessionId, { valid: true, lastAccess: Date.now() });
    }
    
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

    // Get sessionId to track authenticated connections
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      console.warn("[MCP] Missing sessionId in SSE request");
      res.statusCode = 400;
      res.end("Missing sessionId parameter");
      return;
    }
    
    // Add or update session
    validSessions.set(sessionId, { valid: true, lastAccess: Date.now() });

  console.log(`[MCP] SSE connected (session ${sessionId})`);
    
    // Monitor connection state
    req.on("close", () => {
      console.log("[MCP] SSE connection closed by client for session:", sessionId);
      
      // Clean up the session when client closes connection
      validSessions.delete(sessionId);
    });
    
    try {
      // Create transport with proper parameters and connect
      const transport = new SSEServerTransport(SSE_PATH, res);
      console.log("[MCP] Created SSE transport, connecting to MCP server");

      // Interceptors to guarantee tools handling across SDK versions
      const originalHandlePostMessage = transport.handlePostMessage.bind(transport) as any;
      (transport as any).handlePostMessage = async (req2: any, res2: any, parsed?: any) => {
        console.log(`[MCP] handlePostMessage for transport session ${transport.sessionId}`);
        return originalHandlePostMessage(req2, res2, parsed);
      };
      const attachInterceptors = () => {
        const previous = (transport as any).onmessage?.bind(transport) || null;
        (transport as any).onmessage = async (msg: any) => {
          try {
            const method = msg?.method;
            const id = msg?.id;
            if (!method) return previous ? previous(msg) : undefined;
            if (method === "tools/list") {
              const result = {
                tools: [
                  { name: "collectProfile", description: "Collect a user profile", inputSchema: { type: "object" } },
                  { name: "collect_profile", description: "Collect a user profile", inputSchema: { type: "object" } },
                ],
              };
              if (id !== undefined) await (transport as any).send({ jsonrpc: "2.0", id, result });
              return;
            }
            if (method === "tools/call") {
              const { name, arguments: args } = msg?.params || {};
              if (name === "collectProfile" || name === "collect_profile") {
                const result = await handleCollectProfile(args || {});
                if (id !== undefined) await (transport as any).send({ jsonrpc: "2.0", id, result });
                return;
              }
            }
            if (method === "collectProfile" || method === "collect_profile") {
              const result = await handleCollectProfile(msg?.params || {});
              if (id !== undefined) await (transport as any).send({ jsonrpc: "2.0", id, result });
              return;
            }
          } catch (e) {
            console.error("[MCP] onmessage handler error:", e);
          }
          if (previous) return previous(msg);
        };
      };
      attachInterceptors();

      // Register transport for this session so POSTs can be routed
      activeTransports.set(transport.sessionId, transport);
      transport.onclose = () => {
        activeTransports.delete(transport.sessionId);
      };
      
  // Connect then re-attach interceptors to ensure ours stays active
  await mcp.connect(transport);
  attachInterceptors();
  setTimeout(attachInterceptors, 0);
  console.log(`[MCP] SSE connect handler completed for session: ${sessionId}`);
    } catch (e) {
      console.error("[MCP] SSE error:", e);
      
      // Clean up the session on error
      validSessions.delete(sessionId);
    }
    return;
  }

  // Handle POST messages for SSE transport
  if (req.method === "POST" && url.pathname === SSE_PATH) {
    setCors();

    // Extract session ID from SDK header first, then from URL as fallback
    const headerSession = (req.headers["x-sse-session"] || req.headers["x-mcp-session"]) as string | undefined;
    const sessionId = (headerSession && headerSession.trim()) || url.searchParams.get("sessionId");
    if (!sessionId) {
      res.statusCode = 400;
      res.end("Missing session identifier");
      return;
    }

    // Check authentication for this session
    const { valid } = await checkAuth(sessionId);
    if (!valid) {
      res.statusCode = 401;
      res.end("Unauthorized");
      return;
    }

  const transport = activeTransports.get(sessionId);
    if (!transport) {
      res.statusCode = 404;
      res.end("Session not found");
      return;
    }

    // Delegate to SDK to handle the POST body/message
    try {
      await transport.handlePostMessage(req as any, res as any);
    } catch (error) {
      console.error("[MCP] Error handling POST message:", error);
      // If not already responded, send 500
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
    return;
  }

  // Handle other endpoints like POST or fallback 404
  if (req.method === "POST" && url.pathname === "/api/mcp-connect") {
    setCors();
    
    // Parse JSON body
    let body: any;
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const data = Buffer.concat(chunks).toString();
      req.body = data;
      body = JSON.parse(data);
    } catch (error) {
      console.error("[MCP] Failed to parse JSON body:", error);
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    
    // Extract session ID from body if present
    const sessionId = body.sessionId || null;
    
    // Check authentication
    const { valid, bypass } = await checkAuth(sessionId);
    if (!valid) {
      console.warn("[MCP] 401 Unauthorized: token missing or invalid (POST)");
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
    
    // Process the request based on body content
    // (specific implementation depends on your API needs)
    
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Fallback 404
  setCors();
  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`[MCP] Server listening on port ${PORT}`);
  console.log(`[MCP] SSE endpoint: ${SSE_PATH}`);
  console.log(`[MCP] CORS allowed origins: ${ALLOW_ORIGINS.join(", ")}`);
  console.log(`[MCP] Auth required: ${AUTH_REQUIRED}`);
});
