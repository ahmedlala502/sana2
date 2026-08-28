import { NextRequest, NextResponse } from "next/server";
import { PROVIDERS, isChatModel, modelRank, resolveBaseUrl } from "@/lib/providers";
import { explainNetwork, explainStatus, fetchWithTimeout } from "@/lib/http";
import type { ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lists the models a provider will actually serve for this key.
 * Runs server-side so the key never crosses an origin boundary in the browser
 * and CORS is a non-issue.
 */
export async function POST(req: NextRequest) {
  let body: { provider?: ProviderId; baseUrl?: string; apiKey?: string };
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const provider = body.provider as ProviderId;
    const spec = PROVIDERS[provider];
    if (!spec) {
      return NextResponse.json({ error: "unknown provider" }, { status: 400 });
    }

    const baseUrl = resolveBaseUrl(provider, body.baseUrl);
    if (!baseUrl) {
      return NextResponse.json(
        { error: "no base URL set for this provider" },
        { status: 400 }
      );
    }

    const key =
      (body.apiKey as string) ||
      (spec.envKey ? process.env[spec.envKey] || "" : "");
    if (spec.needsKey && !key) {
      return NextResponse.json(
        {
          error: `${spec.label} needs an API key. Paste one in Settings, or set ${spec.envKey} in .env.local and restart the server.`,
        },
        { status: 401 }
      );
    }

    const headers: Record<string, string> = {};
    if (key) headers.Authorization = `Bearer ${key}`;

    const started = Date.now();
    const r = await fetchWithTimeout(`${baseUrl}/models`, {
      headers,
      cache: "no-store",
      timeoutMs: 20_000,
      parentSignal: req.signal,
    });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json(
        { error: explainStatus(r.status, text, spec.label) },
        { status: r.status }
      );
    }

    const json = JSON.parse(text);
    const raw: any[] = json.data || json.models || [];

    /*
      Providers disagree on the shape here. NVIDIA returns {id}, Ollama returns
      {name, details:{parameter_size}}, OpenRouter adds {context_length}. Take
      the id and keep whatever extra each one happens to offer, so the picker
      can show more than a bare string when it has more than a bare string.
    */
    const all = raw
      .map((m: any) => ({
        id: String(m.id || m.name || ""),
        owned: m.owned_by || m.details?.family || m.details?.parameter_size || undefined,
        context: m.context_length || m.max_model_len || undefined,
        /*
          A catalogue entry is not a promise that the model answers chat
          completions - embedding, reranking, OCR and speech endpoints are
          listed alongside the chat models and 404 or shape-error if you pick
          one. Flag them here rather than letting the user find out by sending
          a message.
        */
        chat: isChatModel(String(m.id || m.name || "")),
      }))
      .filter((m) => !!m.id);

    // dedupe: some gateways list the same id under several namespaces
    const seen = new Set<string>();
    const detail = all
      .filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))
      .sort(
        (a, b) =>
          Number(b.chat) - Number(a.chat) ||
          modelRank(b.id) - modelRank(a.id) ||
          a.id.localeCompare(b.id)
      );

    const usable = detail.filter((m) => m.chat);

    return NextResponse.json({
      // the plain list is the chat-capable subset - it is what the picker binds
      // to, and what "N models reachable" counts
      models: usable.map((m) => m.id),
      // everything, flagged, so the UI can offer a "show all" escape hatch
      detail,
      total: detail.length,
      hidden: detail.length - usable.length,
      ms: Date.now() - started,
    });
  } catch (e: any) {
    const status = e?.status === 504 ? 504 : 502;
    return NextResponse.json(
      { error: explainNetwork(String(e?.message || e)) },
      { status }
    );
  }
}
