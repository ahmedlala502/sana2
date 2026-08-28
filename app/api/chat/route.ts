import { NextRequest } from "next/server";
import { PROVIDERS, resolveBaseUrl } from "@/lib/providers";
import { callTool } from "@/lib/mcp";
import { explainNetwork, explainStatus, fetchWithTimeout } from "@/lib/http";
import type { McpServer, ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Enough rounds for long agentic workflows while retaining a final safeguard
// against a model that emits the same tool call forever.
const MAX_TOOL_ROUNDS = 32;
// Long model/tool work has no app deadline. Client disconnect and Stop still
// propagate through req.signal and abort the upstream request immediately.
const TOOL_ROUND_TIMEOUT = 0;
const STREAM_TIMEOUT = 0;

/*
  How many times we will transparently ask the model to carry on after it hits
  its own per-response output ceiling. Eight passes covers a very long document
  at any provider's cap while still terminating.
*/
const MAX_CONTINUATIONS = 8;

const CONTINUE_PROMPT =
  "You stopped mid-answer because you reached your maximum output length. " +
  "Continue from exactly where you left off. Do not repeat any text you have " +
  "already written, do not summarise it, and do not add a preamble like " +
  '"continuing" - resume mid-sentence if that is where you stopped.';

/*
  Comment frames sent while nothing else is on the wire. A tool round can take
  minutes with no bytes flowing, and proxies (Cloudflare, nginx, corporate
  middleboxes) drop an idle connection long before that - which is what a reply
  that "disconnects before continuing" actually looks like. A comment frame is
  ignored by every SSE parser, so it costs nothing and keeps the socket alive.
*/
const HEARTBEAT_MS = 10_000;

interface Body {
  provider: ProviderId;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  messages: any[];
  system?: string;
  params: {
    temperature: number;
    topP: number;
    maxTokens: number;
    seed?: string;
    thinking?: boolean;
  };
  mcpServers?: McpServer[];
}

function sse(obj: unknown) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

/**
 * Length of the longest suffix of `tail` that is also a prefix of `head`.
 *
 * A continuation is a fresh completion, so a model often re-emits its last
 * sentence or two despite being told not to. Splicing on the overlap removes
 * the duplicate without guessing at sentence boundaries.
 */
function overlapLength(tail: string, head: string, max = 400): number {
  const a = tail.slice(-max);
  const limit = Math.min(a.length, head.length);
  for (let n = limit; n > 12; n--) {
    if (a.endsWith(head.slice(0, n))) return n;
  }
  return 0;
}

/** Flattens MCP tools from every enabled server into OpenAI tool specs. */
function buildTools(servers: McpServer[]) {
  const specs: any[] = [];
  const routing = new Map<string, { server: McpServer; tool: string }>();
  servers
    .filter((s) => s.enabled && s.url && s.tools?.length)
    .forEach((s) => {
      s.tools!.forEach((t) => {
        // namespace so two servers can expose the same tool name
        const safe = `${s.name}__${t.name}`
          .replace(/[^a-zA-Z0-9_-]/g, "_")
          .slice(0, 64);
        routing.set(safe, { server: s, tool: t.name });
        specs.push({
          type: "function",
          function: {
            name: safe,
            description: t.description || `${t.name} (via ${s.name})`,
            parameters:
              t.inputSchema && Object.keys(t.inputSchema).length
                ? t.inputSchema
                : { type: "object", properties: {} },
          },
        });
      });
    });
  return { specs, routing };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Response("bad request", { status: 400 });
    }
    body = parsed as Body;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  const spec = PROVIDERS[body.provider];
  if (!spec) return new Response("unknown provider", { status: 400 });
  if (!body.model || !Array.isArray(body.messages) || !body.params) {
    return new Response("model, messages and params are required", { status: 400 });
  }

  const baseUrl = resolveBaseUrl(body.provider, body.baseUrl);
  const key = body.apiKey || (spec.envKey ? process.env[spec.envKey] || "" : "");

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;

      const raw = (s: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          closed = true; // the browser hung up mid-write
        }
      };
      const push = (o: unknown) => raw(sse(o));
      const close = () => {
        if (heartbeat) clearInterval(heartbeat);
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const fail = (msg: string) => {
        push({ type: "error", message: msg });
        push({ type: "done" });
        close();
      };

      heartbeat = setInterval(() => raw(": keep-alive\n\n"), HEARTBEAT_MS);

      if (!baseUrl) return fail("No base URL configured for this provider.");
      if (spec.needsKey && !key)
        return fail(
          `${spec.label} needs an API key. Add it in Settings, or set ${spec.envKey} in .env.local and restart the server.`
        );

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (key) headers.Authorization = `Bearer ${key}`;

      const messages: any[] = [];
      if (body.system?.trim())
        messages.push({ role: "system", content: body.system });
      messages.push(...body.messages);

      const { specs: toolSpecs, routing } = buildTools(body.mcpServers || []);

      const base: any = {
        model: body.model,
        temperature: body.params.temperature,
        top_p: body.params.topP,
      };
      // Omit max_tokens at zero so the provider/model can use its own maximum.
      // Explicit user-selected limits are still passed through unchanged.
      if (body.params.maxTokens > 0) base.max_tokens = body.params.maxTokens;
      if (body.params.seed && body.params.seed.trim() !== "") {
        const n = parseInt(body.params.seed, 10);
        if (Number.isFinite(n)) base.seed = n;
      }
      if (body.params.thinking !== undefined)
        base.chat_template_kwargs = { thinking: !!body.params.thinking };

      // ---- tool rounds (non-streaming, so tool_calls arrive whole) ----
      try {
        for (let round = 0; toolSpecs.length && round < MAX_TOOL_ROUNDS; round++) {
          push({ type: "status", phase: "tools", round: round + 1 });
          const r = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            timeoutMs: TOOL_ROUND_TIMEOUT,
            parentSignal: req.signal,
            body: JSON.stringify({
              ...base,
              messages,
              tools: toolSpecs,
              tool_choice: "auto",
              stream: false,
            }),
          });
          const text = await r.text();
          if (!r.ok) {
            // provider does not support tools - drop them and fall through.
            // Only legal on the first round: later rounds already pushed
            // assistant tool_calls and role:"tool" entries into `messages`,
            // which providers validate against a present tools array - asking
            // without one would 400 the final answer and misdescribe why.
            if (/tool|function/i.test(text) && r.status === 400 && round === 0) {
              push({
                type: "notice",
                message:
                  "This model rejected the tool definitions, so it answered without them.",
              });
              break;
            }
            return fail(explainStatus(r.status, text, spec.label));
          }
          const json = JSON.parse(text);
          const msg = json.choices?.[0]?.message;
          if (!msg?.tool_calls?.length) break;

          messages.push(msg);
          for (const tc of msg.tool_calls) {
            const route = routing.get(tc.function?.name);
            const started = Date.now();
            let result = "";
            let ok = true;
            let args: any = {};
            try {
              args = tc.function?.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              args = {};
            }
            if (!route) {
              ok = false;
              result = `No MCP server owns the tool "${tc.function?.name}".`;
            } else {
              try {
                result = await callTool(
                  route.server.url,
                  route.tool,
                  args,
                  route.server.headers || {},
                  req.signal
                );
              } catch (e: any) {
                ok = false;
                result = `Tool failed: ${String(e?.message || e)}`;
              }
            }
            push({
              type: "tool",
              server: route?.server.name || "unknown",
              tool: route?.tool || tc.function?.name,
              args,
              result: result.slice(0, 4000),
              ms: Date.now() - started,
              ok,
            });
            messages.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
        }
      } catch (e: any) {
        if (req.signal.aborted) return close();
        return fail(`Tool round failed: ${explainNetwork(String(e?.message || e))}`);
      }

      /*
        ---- final answer ----

        One pass per completion. If a pass ends with finish_reason "length" the
        model ran out of room rather than out of things to say, so we hand its
        own partial answer back and ask it to carry on. The client sees one
        continuous stream of deltas and never learns the reply arrived in
        several pieces.
      */
      let full = "";
      let usage: any = null;
      let finish: string | null = null;
      let pass = 0;

      const runPass = async (isContinuation: boolean): Promise<boolean> => {
        /*
          Free tiers return a transient 502/503 fairly regularly - the upstream
          pool is briefly out of capacity, and the identical request succeeds a
          second later. Retrying here is safe because nothing has been streamed
          to the client yet, so there is no partial reply to duplicate.
        */
        let r: Response | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (closed || req.signal.aborted) return false;
          r = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { ...headers, Accept: "text/event-stream" },
            timeoutMs: STREAM_TIMEOUT,
            parentSignal: req.signal,
            body: JSON.stringify({
              ...base,
              messages,
              stream: true,
              stream_options: { include_usage: true },
            }),
          });
          if (r.ok || ![502, 503, 504].includes(r.status)) break;
          if (attempt === 0) push({ type: "status", phase: "retrying" });
          await new Promise((done) => setTimeout(done, 600 * (attempt + 1)));
        }
        if (!r) return false;

        if (!r.ok || !r.body) {
          const text = await r.text().catch(() => "");
          // A failed continuation is not worth losing the answer over - keep
          // what already streamed and stop cleanly.
          if (isContinuation) {
            push({
              type: "notice",
              message:
                "The reply reached the model's output limit and the automatic continuation failed. Ask it to continue.",
            });
            return false;
          }
          let msg = explainStatus(r.status, text, spec.label);
          if (r.status === 400 && /system/i.test(text))
            msg +=
              " This model looks like it rejects a system prompt - turn off the always-on skills in the Skills tab.";
          fail(msg);
          return false;
        }

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        finish = null;

        /*
          On a continuation, hold the opening characters back until there are
          enough of them to detect (and cut) text the model repeated from the
          end of the previous pass.
        */
        let head: string | null = isContinuation ? "" : null;

        const release = (force: boolean) => {
          if (head === null) return;
          if (!force && head.length < 400) return;
          const cut = overlapLength(full, head);
          const rest = head.slice(cut);
          head = null;
          if (!rest) return;
          full += rest;
          push({ type: "delta", text: rest });
        };

        const emit = (text: string) => {
          if (head !== null) {
            head += text;
            release(false);
            return;
          }
          full += text;
          push({ type: "delta", text });
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (closed) {
            // client is gone - stop pulling from the provider
            await reader.cancel().catch(() => {});
            break;
          }
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith("data:")) continue;
            const payload = l.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              if (j.usage) usage = j.usage;
              const choice = j.choices?.[0];
              if (choice?.finish_reason) finish = choice.finish_reason;
              const d = choice?.delta;
              if (!d) continue;
              if (d.reasoning_content)
                push({ type: "reasoning", text: d.reasoning_content });
              if (d.content) emit(d.content);
            } catch {
              /* skip malformed frame */
            }
          }
        }
        release(true);
        return true;
      };

      try {
        push({ type: "status", phase: "answer" });
        if (!(await runPass(false))) return;

        while (
          finish === "length" &&
          !closed &&
          !req.signal.aborted &&
          pass < MAX_CONTINUATIONS
        ) {
          pass++;
          push({ type: "status", phase: "continuing", part: pass + 1 });
          messages.push({ role: "assistant", content: full });
          messages.push({ role: "user", content: CONTINUE_PROMPT });
          const before = full.length;
          if (!(await runPass(true))) break;
          // A continuation that produced nothing new means the model is done,
          // whatever finish_reason claims. Stop rather than loop.
          if (full.length === before) break;
        }

        if (finish === "length" && pass >= MAX_CONTINUATIONS)
          push({
            type: "notice",
            message: `Still going after ${MAX_CONTINUATIONS} automatic continuations. Ask it to continue if you want the rest.`,
          });
        else if (pass > 0)
          push({
            type: "notice",
            message: `The model hit its output limit, so the reply was completed over ${
              pass + 1
            } passes.`,
          });

        push({ type: "done", usage, finish });
        close();
      } catch (e: any) {
        if (req.signal.aborted) return close();
        // Never throw away text that already streamed - report and close.
        if (full) {
          push({
            type: "notice",
            message: `The connection to ${spec.label} dropped mid-reply: ${explainNetwork(
              String(e?.message || e)
            )}`,
          });
          push({ type: "done", usage, finish: "interrupted" });
          return close();
        }
        return fail(explainNetwork(String(e?.message || e)));
      }
    },

    cancel() {
      /* the browser aborted; the read loop above notices via `closed` */
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
