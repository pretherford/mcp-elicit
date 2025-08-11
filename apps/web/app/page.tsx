"use client";

import { signIn, useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ElicitationResponse, ElicitationSubmission } from "../shared/types";
import { connectMcp, callCollectProfile } from "./lib/mcpClient";
import ElicitationForm from "./components/ElicitationForm";

export default function Page() {
  const { data: session } = useSession();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [response, setResponse] = useState<ElicitationResponse | null>(null);
  const mcpRef = useRef<Awaited<ReturnType<typeof connectMcp>> | null>(null);

  const isAuthed = !!session?.user?.email;

  const doConnect = useCallback(async () => {
    setConnecting(true);
    try {
      const conn = await connectMcp(process.env.NEXT_PUBLIC_MCP_SERVER_URL || "ws://localhost:4000");
      mcpRef.current = conn;
      setConnected(true);
    } catch (e) {
      console.error(e);
      alert("Failed to connect to MCP server");
    } finally {
      setConnecting(false);
    }
  }, []);

  const startDemo = useCallback(async () => {
    if (!mcpRef.current) return;
    const r = await callCollectProfile(mcpRef.current);
    setResponse(r);
  }, []);

  const handleSubmit = useCallback(async (values: ElicitationSubmission) => {
    if (!mcpRef.current) return;
    const r = await callCollectProfile(mcpRef.current, values);
    setResponse(r);
  }, []);

  useEffect(() => {
    if (isAuthed && !connected && !connecting) void doConnect();
  }, [isAuthed, connected, connecting, doConnect]);

  return (
    <div className="space-y-4">
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
          <div className="text-sm text-gray-700">
            Status:{" "}
            <span className={connected ? "text-green-600" : connecting ? "text-yellow-600" : "text-red-600"}>
              {connected ? "Connected to MCP" : connecting ? "Connecting..." : "Not connected"}
            </span>
          </div>
          {!response && (
            <button
              disabled={!connected}
              onClick={startDemo}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-800 disabled:opacity-50"
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
            <div className="rounded-lg border border-gray-200 bg-white p-4">
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
                className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-800"
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
