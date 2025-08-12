import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

// CONNECTION STATE MANAGEMENT
// We implement a connection lock to prevent concurrent connection attempts

// Keep track of the current client and transport for cleanup
let client: Client | null = null;
let transport: SSEClientTransport | null = null;
let sessionId: string | null = null;
let isConnected = false;

// Connection lock with a promise to prevent concurrent connection attempts
let connectingInProgress = false;
let closingInProgress = false;

// Event handlers
type ConnectionHandler = (connected: boolean) => void;
const connectionHandlers: Set<ConnectionHandler> = new Set();

// Minimal permissive schema for SDK .request result parsing
// The SDK expects an object with a .parse(value) method; we just pass-through.
const AnySchema = { parse: (x: any) => x } as const;

/**
 * Add a connection state change handler
 */
export function onConnectionChange(handler: ConnectionHandler) {
  // Add the handler to our set
  connectionHandlers.add(handler);
  
  // Immediately notify with current state - but schedule it so it runs after the current
  // execution context and doesn't interfere with React renders in progress
  setTimeout(() => handler(isConnected), 0);
  
  // Return a cleanup function
  return () => {
    console.log("[MCP] Removing connection handler");
    connectionHandlers.delete(handler);
  };
}

/**
 * Notify all connection handlers of a state change
 */
function notifyConnectionChange(connected: boolean) {
  if (isConnected === connected) {
  // no-op if unchanged
    return; // Only notify if state actually changed
  }
  
  // update state
  isConnected = connected;
  
  // Use setTimeout to ensure notification doesn't happen during React rendering
  setTimeout(() => {
    connectionHandlers.forEach(handler => {
      try {
        handler(connected);
      } catch (error) {
        console.error("[MCP] Error in connection handler:", error);
      }
    });
  }, 0);
}

/**
 * Get or create a connection lock to prevent concurrent connection attempts
 */
function getConnectionLock(): void {
  // If a connection is already in progress, don't throw; allow caller to wait.
  if (connectingInProgress) return;
  connectingInProgress = true;
}

/**
 * Release the connection lock
 */
function releaseConnectionLock() {
  connectingInProgress = false;
}

/**
 * Connect to an MCP server using SSE transport.
 */
export async function connectMcp(sseUrl: string | URL, token?: string): Promise<Client> {
  // Get the connection lock to prevent concurrent connections
  getConnectionLock();
  
  try {
    // If another call is currently connecting, wait briefly until it's done
    if (connectingInProgress && client) {
      // Small wait loop to allow in-flight connect to complete
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 50));
        if (!connectingInProgress || (isConnected && client)) break;
      }
      if (isConnected && client) return client;
    }
    
    // If already connected with a valid client, just return it
    if (isConnected && client) {
      
      return client;
    }
    
    
    
    // Generate a session ID
    sessionId = crypto.randomUUID ? crypto.randomUUID() : 
      Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    // Normalize URL
    const url = new URL(sseUrl.toString());
    if (url.protocol === "ws:") url.protocol = "http:";
    if (url.protocol === "wss:") url.protocol = "https:";
    if (!url.pathname || url.pathname === "/") url.pathname = "/mcp/sse";
    
    // Add token and session ID to URL
    if (token) url.searchParams.set("access_token", token);
    url.searchParams.set("sessionId", sessionId);
    
    
    
    // Create transport
  transport = new SSEClientTransport(url);
    
    // Add event handlers to the underlying EventSource with proper cleanup
    const transportAny = transport as any;
    if (transportAny.eventSource) {
      
      
      // Handle errors
      transportAny.eventSource.onerror = (event: any) => {
        // Only mark disconnected if we aren't intentionally closing
        
        if (!closingInProgress) notifyConnectionChange(false);
      };
      
      // Handle successful connection
      transportAny.eventSource.onopen = () => {
        
        notifyConnectionChange(true);
      };
      
      // Handle message reception to maintain the connection state
      transportAny.eventSource.onmessage = (_event: any) => {
        // Heartbeat: keep-alive indication, do not flip to false here
        if (!isConnected && !closingInProgress) {
          
          notifyConnectionChange(true);
        }
      };
    }
    
    // Create client
    client = new Client(
      { name: "web", version: "0.1.0" }, 
      { capabilities: {} }
    );
    
    
    
    // Connect client to transport
    
    try {
      await client.connect(transport);
      
    } catch (error) {
      console.error("[MCP] Error connecting client to transport:", error);
      throw error;
    }
    
  // Ensure connection state is accurate
  if (!isConnected) notifyConnectionChange(true);
    
    return client;
  } catch (error) {
    // Clean up on error (avoid recursive close during connect)
    notifyConnectionChange(false);
    console.error("[MCP] Connection failed:", error);
    throw error;
  } finally {
    // Always release the connection lock when done
    releaseConnectionLock();
  }
}

/**
 * Close the MCP connection and clean up resources.
 */
export function closeMcp() {
  try {
  
    closingInProgress = true;
    
    if (transport) {
      
      transport.close();
      transport = null;
    }
    
    // Clear client and notify connection state change, but only if we're currently connected
    client = null;
    
    if (isConnected) {
      
      notifyConnectionChange(false);
    } else {
      
    }
  } catch (error) {
    console.error("[MCP] Error closing transport:", error);
  } finally {
    closingInProgress = false;
  }
}

/**
 * Check if connected to MCP server.
 */
export function isMcpConnected(): boolean {
  // Direct check for both connection state and client existence
  return isConnected && client !== null;
}

/**
 * Alias for isMcpConnected() for backward compatibility
 */
export const isClientConnected = isMcpConnected;

/**
 * Get the MCP client if connected.
 */
export function getMcpClient(): Client | null {
  return isConnected && client ? client : null;
}

/**
 * Call the profile collection method on the MCP server.
 * This function handles the communication with the server for profile data.
 */
export async function callCollectProfile(values?: any): Promise<any> {
  
  
  if (!isConnected || !client) {
    throw new Error("No MCP client available. Please connect first.");
  }
  
  try {
    // Attach current sessionId (if available) for server-side correlation/logging
    const payload = {
      ...(values || {}),
      ...(sessionId ? { sessionId } : {}),
    };
    // Using request method with the correct structure - accessing as "any" to bypass type issues
    const anyClient = client as any;
    try {
      const result = await anyClient.request(
        { method: "tools/call", params: { name: "collectProfile", arguments: payload } },
        AnySchema
      );
      
      return result;
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (msg.includes("-32601") || msg.toLowerCase().includes("method not found")) {
        
        const result = await anyClient.request(
          { method: "collectProfile", params: payload },
          AnySchema
        );
        
        return result;
      }
      throw e;
    }
  } catch (error) {
    console.error("[MCP] Error calling collectProfile:", error);
    throw error;
  }
}
