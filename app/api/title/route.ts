import { NextRequest, NextResponse } from "next/server";
import { PROVIDERS, resolveBaseUrl } from "@/lib/providers";
import { fetchWithTimeout } from "@/lib/http";
import type { ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Names a conversation from its first exchange.
 *
 * Deliberately cheap and deliberately failure-tolerant: it caps the input,
 * asks for a handful of tokens, and on any error falls back to the truncated
 * first message the UI was using anyway. Naming a chat is never worth blocking
 * or surfacing an error for.
 */
const FALLBACK_LEN = 46;

function fallback(text: string) {
  const one = (text || "").replace(/\s+/g, " ").trim();
  if (!one) return "New chat";
  return one.length > FALLBACK_LEN ? `${one.slice(0, FALLBACK_LEN)}...` : one;
}

function clean(raw: string, source: string) {
  const t = (raw || "")
    .replace(/^["'`\s]+|["'`\s.]+$/g, "")
    .replace(/^(title|chat)\s*:\s*/i, "")
    .split("\n")[0]
    .trim();
  // a model that ignores the instruction tends to answer the question instead;
  // anything long enough to be an answer is not a title.
  if (!t || t.length > 60) return fallback(source);
  return t;
}

export async function POST(req: NextRequest) {
  let body: {
    provider?: ProviderId;
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    user?: string;
    assistant?: string;
  };
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    body = parsed;
  } catch {
    return NextResponse.json({ title: "New chat" });
  }

  const source = body.user || "";
  const provider = (body.provider || "nvidia") as ProviderId;
  const spec = PROVIDERS[provider];
  const baseUrl = spec ? resolveBaseUrl(provider, body.baseUrl) : "";
  const key = body.apiKey || (spec?.envKey ? process.env[spec.envKey] || "" : "");

  if (!spec || !baseUrl || !body.model || (spec.needsKey && !key)) {
    return NextResponse.json({ title: fallback(source), generated: false });
  }

  const excerpt = [
    `User: ${source.slice(0, 700)}`,
    body.assistant ? `Assistant: ${body.assistant.slice(0, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const r = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      timeoutMs: 12_000,
      parentSignal: req.signal,
      body: JSON.stringify({
        model: body.model,
        temperature: 0.2,
        max_tokens: 24,
        stream: false,
        messages: [
          {
            role: "user",
            content:
              "Give this conversation a title. Three to six words, no quotes, " +
              "no trailing period, no preamble - reply with the title alone.\n\n" +
              excerpt,
          },
        ],
      }),
    });

    if (!r.ok) return NextResponse.json({ title: fallback(source), generated: false });

    const json = await r.json();
    const raw = json.choices?.[0]?.message?.content || "";
    return NextResponse.json({ title: clean(raw, source), generated: true });
  } catch {
    return NextResponse.json({ title: fallback(source), generated: false });
  }
}
