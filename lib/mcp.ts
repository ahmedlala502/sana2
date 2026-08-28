/**
 * Minimal MCP client for Streamable-HTTP servers.
 *
 * Runs server-side only (the API routes call it) so the browser never talks to
 * an MCP endpoint directly and never holds its credentials. Handles both plain
 * JSON responses and the SSE framing the spec allows.
 */
import { fetchWithTimeout } from "./http";
import type { McpTool } from "./types";

const PROTOCOL = "2025-06-18";
// Tool execution is allowed to run until it completes or the user stops the
// turn. This matters for browser, research, build and long-running MCP tools.
const RPC_TIMEOUT = 0;

interface RpcResult {
  result?: any;
  error?: { code: number; message: string };
}

/*
  Every tool call used to open a fresh session: initialize, notify, then the
  actual call - three round trips for one tool. In a four-round tool loop that
  is twelve avoidable requests. Sessions are keyed by url + credentials and
  expire, so a rotated header still forces a new handshake.
*/
const sessions = new Map<string, { id?: string; at: number }>();

/*
  Sessions are reused until the server expires them underneath us, but nothing
  here is forever: entries stale after TTL so a rotated credential forces a
  fresh handshake, and the map is capped so a long-lived server process cannot
  leak one entry per server/header combination it has ever seen.
*/
const SESSION_TTL = 20 * 60 * 1000;
const MAX_SESSIONS = 64;

function sessionKey(url: string, headers: Record<string, string>) {
  return `${url}::${JSON.stringify(headers)}`;
}

function parseBody(text: string, contentType: string): RpcResult {
  if (contentType.includes("text/event-stream")) {
    // take the last `data:` frame that parses as JSON-RPC
    const frames = text
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .filter(Boolean);
    for (let i = frames.length - 1; i >= 0; i--) {
      try {
        const j = JSON.parse(frames[i]);
        if (j && (j.result !== undefined || j.error !== undefined)) return j;
      } catch {
        /* keep looking */
      }
    }
    return { error: { code: -1, message: "no JSON-RPC frame in SSE response" } };
  }
  try {
    return JSON.parse(text);
  } catch {
    return {
      error: { code: -1, message: `unparseable response: ${text.slice(0, 160)}` },
    };
  }
}

async function rpc(
  url: string,
  method: string,
  params: unknown,
  headers: Record<string, string>,
  sessionId?: string,
  signal?: AbortSignal
): Promise<{ res: RpcResult; sessionId?: string }> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...headers,
  };
  if (sessionId) h["mcp-session-id"] = sessionId;

  const r = await fetchWithTimeout(url, {
    method: "POST",
    headers: h,
    timeoutMs: RPC_TIMEOUT,
    parentSignal: signal,
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  const text = await r.text();
  const ct = r.headers.get("content-type") || "";
  if (!r.ok) {
    return {
      res: {
        error: {
          code: r.status,
          message: `HTTP ${r.status} - ${text.slice(0, 200)}`,
        },
      },
    };
  }
  return {
    res: parseBody(text, ct),
    sessionId: r.headers.get("mcp-session-id") || sessionId,
  };
}

async function handshake(
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  force = false
) {
  const key = sessionKey(url, headers);
  const cached = sessions.get(key);
  // Reuse the session until the MCP server rejects it. withSession() already
  // detects expiration and performs one clean re-handshake.
  if (!force && cached && Date.now() - cached.at < SESSION_TTL) {
    return cached.id;
  }
  if (cached) sessions.delete(key);

  const { res, sessionId } = await rpc(
    url,
    "initialize",
    {
      protocolVersion: PROTOCOL,
      capabilities: {},
      clientInfo: { name: "sana2-advanced-assistant", version: "1.0.0" },
    },
    headers,
    undefined,
    signal
  );
  if (res.error) throw new Error(res.error.message);

  // notifications/initialized - fire and forget, some servers require it
  try {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    };
    if (sessionId) h["mcp-session-id"] = sessionId;
    await fetchWithTimeout(url, {
      method: "POST",
      headers: h,
      timeoutMs: 0,
      parentSignal: signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
  } catch {
    /* optional */
  }

  sessions.set(key, { id: sessionId, at: Date.now() });
  // Evict the least recently handshaken entries once past the cap.
  if (sessions.size > MAX_SESSIONS) {
    const excess = [...sessions.entries()]
      .sort((a, b) => a[1].at - b[1].at)
      .slice(0, sessions.size - MAX_SESSIONS);
    excess.forEach(([k]) => sessions.delete(k));
  }
  return sessionId;
}

/**
 * Runs an RPC against a cached session, re-handshaking once if the server has
 * expired it underneath us (404/session errors are the usual tell).
 */
async function withSession(
  url: string,
  headers: Record<string, string>,
  method: string,
  params: unknown,
  signal?: AbortSignal
) {
  let sessionId = await handshake(url, headers, signal);
  let { res } = await rpc(url, method, params, headers, sessionId, signal);
  if (res.error && /session|404|expired/i.test(res.error.message)) {
    sessionId = await handshake(url, headers, signal, true);
    ({ res } = await rpc(url, method, params, headers, sessionId, signal));
  }
  if (res.error) throw new Error(res.error.message);
  return res;
}

export async function listTools(
  url: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal
): Promise<McpTool[]> {
  const res = await withSession(url, headers, "tools/list", {}, signal);
  const tools = (res.result?.tools || []) as any[];
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function callTool(
  url: string,
  name: string,
  args: unknown,
  headers: Record<string, string> = {},
  signal?: AbortSignal
): Promise<string> {
  const res = await withSession(
    url,
    headers,
    "tools/call",
    { name, arguments: args ?? {} },
    signal
  );

  const content = res.result?.content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) =>
        c?.type === "text" ? c.text : `[${c?.type || "content"}]`
      )
      .join("\n");
  }
  return JSON.stringify(res.result ?? {});
}
