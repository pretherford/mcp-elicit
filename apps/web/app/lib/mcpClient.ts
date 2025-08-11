import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

function isUrlLike(v: unknown): v is URL {
  return typeof v === "object" && v !== null && (v as any).href && (v as any).origin;
}

function normalizeSseUrl(input: string | URL): URL {
  const baseUrl = isUrlLike(input) ? new URL((input as URL).toString()) : new URL(String(input));
  if (baseUrl.protocol === "ws:") baseUrl.protocol = "http:";
  if (baseUrl.protocol === "wss:") baseUrl.protocol = "https:";
  if (!baseUrl.pathname || baseUrl.pathname === "/") baseUrl.pathname = "/mcp/sse";
  return baseUrl;
}

let clientPromise: Promise<Client> | null = null;
let currentTransport: SSEClientTransport | null = null;

async function connectMcpInternal(sseUrl: string | URL, token?: string): Promise<Client> {
  // Validate input early to prevent "[object Object]" URLs
  if (!(typeof sseUrl === "string" || isUrlLike(sseUrl))) {
    const got = Object.prototype.toString.call(sseUrl);
    throw new Error(`getMcpClient: sseUrl must be a string or URL. Got ${got}`);
  }

  const base = normalizeSseUrl(sseUrl);
  const useToken = token || process.env.NEXT_PUBLIC_MCP_TOKEN || undefined;

  // Preserve existing query (e.g., sessionId)
  const url = new URL(base.toString());
  if (useToken) url.searchParams.set("access_token", useToken);

  // Log without leaking query
  console.log("[MCP] Connecting via SSE:", url.origin + url.pathname, "token?", Boolean(useToken));

  // IMPORTANT: pass auth token as query parameter since EventSourceInit doesn't support headers
  const transport = new SSEClientTransport(new URL(url.toString()));
  currentTransport = transport;

  const client = new Client({ name: "web", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  console.log("[MCP] Connected");
  return client;
}

/**
 * Preferred API: returns a singleton MCP client (avoids duplicate connects in React StrictMode).
 */
export async function getMcpClient(sseUrl?: string | URL, token?: string): Promise<Client> {
  const url = sseUrl || process.env.NEXT_PUBLIC_MCP_SSE_URL!;
  if (!url) throw new Error("NEXT_PUBLIC_MCP_SSE_URL is not set");
  if (!clientPromise) {
    clientPromise = connectMcpInternal(url, token).catch(err => {
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

/**
 * Backwards-compatible alias for code that imports { connectMcp }.
 */
export async function connectMcp(sseUrl?: string | URL, token?: string): Promise<Client> {
  return getMcpClient(sseUrl, token);
}

/**
 * Close the singleton connection (use on route changes or teardown).
 */
export function closeMcp() {
  try {
    currentTransport?.close?.();
  } catch {}
  currentTransport = null;
  clientPromise = null;
}

/**
 * Compatibility layer for calling tools across SDK versions.
 */
export async function callTool<TInput = any, TResult = any>(
  name: string,
  input?: TInput,
  opts?: { sseUrl?: string | URL; token?: string }
): Promise<TResult> {
  const client = await getMcpClient(opts?.sseUrl, opts?.token);
  const anyClient: any = client as any;

  if (typeof anyClient.callTool === "function") {
    return await anyClient.callTool(name, input ?? {});
  }
  if (anyClient.tools?.call && typeof anyClient.tools.call === "function") {
    return await anyClient.tools.call(name, input ?? {});
  }
  if (typeof anyClient.request === "function") {
    return await anyClient.request({
      method: "tools/call",
      params: { name, arguments: input ?? {} },
    });
  }
  throw new Error("This MCP client SDK does not support tool calls via callTool/tools.call/request");
}

/**
 * Convenience helper to call the 'collect profile' tool.
 * Tries both snake_case and camelCase tool names.
 */
export async function callCollectProfile<TInput = any, TResult = any>(
  input?: TInput,
  opts?: { sseUrl?: string | URL; token?: string }
): Promise<TResult> {
  try {
    return await callTool<TInput, TResult>("collect_profile", input, opts);
  } catch {
    return await callTool<TInput, TResult>("collectProfile", input, opts);
  }
}

// Also export default for convenience: import connectMcp from "./lib/mcpClient"
export default getMcpClient;
