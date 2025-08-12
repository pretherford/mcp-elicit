"use client";

import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ElicitationResponse, ElicitationSubmission } from "../shared/types";
import { connectMcp, callCollectProfile, closeMcp, onConnectionChange, getMcpClient, isClientConnected } from "./lib/mcpClient";
import ElicitationForm from "./components/ElicitationForm";

export default function Page() {
  const { data: session } = useSession();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [response, setResponse] = useState<ElicitationResponse | null>(null);
  // Add a direct state for the client itself
  const [client, setClient] = useState<any>(null);
  const reconnectAttemptsRef = useRef(0);
  const isAuthed = Boolean(session?.user?.email);
  
  const fetchAndConnect = useCallback(async (): Promise<any | null> => {
    // If already connected, don't try to connect again
    if (connected && client) {
      console.log("[MCP] Already connected, skipping reconnect");
      return;
    }
    
    try {
      setConnecting(true);
      
      // Get token (optional in local dev). If it fails, proceed without token.
      let token: string | undefined = undefined;
      try {
        const tokenResponse = await fetch("/api/mcp-token");
        if (tokenResponse.ok) {
          const body = await tokenResponse.json();
          token = body?.token;
        } else {
          console.warn("[MCP] /api/mcp-token returned", tokenResponse.status, "- proceeding without token (auth likely disabled)");
        }
      } catch (e) {
        console.warn("[MCP] Failed to fetch token, proceeding without it:", e);
      }
      
      // Connect to MCP server
      const url = process.env.NEXT_PUBLIC_MCP_SERVER_URL || "http://localhost:4000/mcp/sse";
  // Minimal connect log
  console.log(`[MCP] Connecting to ${url}`);
      
      // Establish connection - will automatically handle concurrent connection attempts
  const newClient = await connectMcp(url, token);
      
      // Set the client directly in our state
  // Save client state
  setClient(newClient);
  setConnected(true);
  return newClient;
      
      // Connected state will be set by the onConnectionChange handler
    } catch (error) {
      console.error("[MCP] Connection error:", error);
      
      // Show user-friendly error
      const message = error instanceof Error ? error.message : String(error);
  alert(`Failed to connect: ${message}`);
      
      // Reset connection state
      setConnected(false);
      setClient(null);
    } finally {
      setConnecting(false);
    }
    return null;
  }, [connected, client]);

  const startDemo = useCallback(async () => {
    try {
      const t0 = performance.now();
  // Start demo
      
      let activeClient = client;
      if (!activeClient) {
  // Reconnect if needed
        activeClient = await fetchAndConnect();
        if (!activeClient) {
          // Try grabbing whatever the module has
          activeClient = getMcpClient();
        }
        if (!activeClient) {
          throw new Error("Could not establish MCP connection. Please try again.");
        }
      }
      
      // Use helper which calls tools/call under the hood
  // First step: ask server for elicitation
      const result = await callCollectProfile({});
      const t1 = performance.now();
  console.log("[MCP] Demo result:", result?.kind, `${Math.round(t1 - t0)}ms`);
      
      
      setResponse(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[MCP] [StartDemo] Error:", msg, error);
      alert(`Error starting demo: ${msg}`);
    }
  }, [client, connected, fetchAndConnect]);

  const handleSubmit = useCallback(async (values: ElicitationSubmission) => {
    try {
      
      
      if (!client) {
        throw new Error("No MCP client available. Please reconnect.");
      }
      
  // Use helper which calls tools/call under the hood
  const result = await callCollectProfile(values);
      
  
      setResponse(result);
    } catch (error) {
      console.error("[MCP] Error submitting form:", error);
      alert(`Error submitting form: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [client]);

  // Subscribe to connection state changes
  useEffect(() => {
    const unsubscribe = onConnectionChange((isConnected) => {
      setConnected(isConnected);
      
      // If disconnected, clear the client
      if (!isConnected) {
        setClient(null);
      }
    });
    
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Connect on component mount if authenticated, but only once
  if (isAuthed && !connected && !connecting) {
      // Limit reconnect attempts to prevent infinite loops
      if (reconnectAttemptsRef.current < 3) {
        reconnectAttemptsRef.current += 1;
        void fetchAndConnect();
      } else {
    // stop after a few attempts
      }
  }
    
    // Reset reconnect counter when connected
    if (connected) {
      reconnectAttemptsRef.current = 0;
    }
  }, [isAuthed, connected, connecting, fetchAndConnect]);

  // Unmount-only cleanup: do not tie this to connection state changes
  useEffect(() => {
    return () => {
      try { closeMcp(); } catch {}
      setClient(null);
    };
  }, []);

  return (
  <div className="space-y-6">
  {!isAuthed ? (
        <div className="grid gap-3">
          <p className="text-gray-700">This demo requires Google Sign-In.</p>
          <button
            className="w-fit rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-500"
            onClick={() => signIn("google")}
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                connected
                  ? 'bg-green-50 text-green-700 ring-green-600/20'
                  : connecting
                  ? 'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                  : 'bg-red-50 text-red-700 ring-red-600/20'
              }`}
            >
              {connected ? 'Connected to MCP' : connecting ? 'Connecting…' : 'Not connected'}
            </span>
            <button
              onClick={fetchAndConnect}
              disabled={connecting}
              className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-600 ${
                connecting ? 'cursor-not-allowed bg-gray-200 text-gray-500' : 'bg-gray-900 text-white hover:bg-gray-800'
              }`}
            >
              {connecting ? 'Connecting…' : 'Reconnect'}
            </button>
            <span className="text-xs text-gray-500">Client initialized: {client ? 'Yes' : 'No'}</span>
          </div>
      {!response && (
            <button
              disabled={!client}
              onClick={startDemo}
              className="rounded-md bg-blue-600 px-4 py-2 text-white shadow-sm transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Elicitation Demo
            </button>
          )}
          {response?.kind === "requiresAction" && (
            <ElicitationForm elicitation={response.elicitation} onSubmit={handleSubmit} />
          )}
          {response?.kind === "validationError" && (
            <div className="space-y-2">
              <p className="text-red-700">Please correct the errors below.</p>
              <ElicitationForm elicitation={response.elicitation} onSubmit={handleSubmit} />
            </div>
          )}
          {response?.kind === "success" && (
            <div className="rounded-xl border border-gray-200 bg-white/80 p-6 shadow-sm ring-1 ring-gray-100">
              <h3 className="text-lg font-semibold">Success</h3>
              <p className="mt-1 text-gray-700">{response.message}</p>
              {response.thumbnailDataUrl && (
                <div className="mt-3">
                  <img
                    src={response.thumbnailDataUrl}
                    alt="avatar"
                    className="max-w-[120px] rounded-md ring-1 ring-gray-200"
                  />
                </div>
              )}
              {response.persistedFile && (
                <div className="mt-2 text-sm text-gray-600">
                  Stored avatar on server: <code>{response.persistedFile.path}</code>
                </div>
              )}
              <pre className="mt-3 overflow-auto rounded bg-gray-50 p-3 text-xs">
                {JSON.stringify(response.received, null, 2)}
              </pre>
              <button
                className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-white shadow-sm transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                onClick={() => setResponse(null)}
              >
                Run Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
