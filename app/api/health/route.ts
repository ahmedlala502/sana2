import { NextRequest, NextResponse } from "next/server";
import { PROVIDERS, PROVIDER_ORDER, resolveBaseUrl } from "@/lib/providers";
import { explainNetwork, fetchWithTimeout } from "@/lib/http";
import type { HealthReport, ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  - which providers the *server* holds a key for. Cheap, no upstream
 *        calls, so the UI can tell you "the key is in .env.local, you do not
 *        need to paste one" before you go hunting in Settings.
 * POST - actually pings one provider's /models and times it.
 */
export async function GET() {
  const keys: Record<string, boolean> = {};
  for (const id of PROVIDER_ORDER) {
    const spec = PROVIDERS[id];
    keys[id] = !!(spec.envKey && process.env[spec.envKey]);
  }
  return NextResponse.json({ ok: true, serverKeys: keys, ts: Date.now() });
}

export async function POST(req: NextRequest) {
  let body: { provider?: ProviderId; baseUrl?: string; apiKey?: string };
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid body");
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const provider = (body.provider || "nvidia") as ProviderId;
  const spec = PROVIDERS[provider];
  if (!spec) return NextResponse.json({ error: "unknown provider" }, { status: 400 });

  const baseUrl = resolveBaseUrl(provider, body.baseUrl);
  const serverKey = !!(spec.envKey && process.env[spec.envKey]);
  const key = body.apiKey || (spec.envKey ? process.env[spec.envKey] || "" : "");

  const report: HealthReport = {
    provider,
    baseUrl,
    serverKey,
    reachable: false,
    ms: 0,
  };

  if (!baseUrl) {
    report.error = "No base URL set for this provider.";
    return NextResponse.json(report, { status: 400 });
  }
  if (spec.needsKey && !key) {
    report.error = `${spec.label} needs a key. Paste one in Settings, or set ${spec.envKey} in .env.local and restart.`;
    return NextResponse.json(report, { status: 401 });
  }

  const started = Date.now();
  try {
    const r = await fetchWithTimeout(`${baseUrl}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      cache: "no-store",
      timeoutMs: 12_000,
      parentSignal: req.signal,
    });
    report.ms = Date.now() - started;
    if (!r.ok) {
      report.error = `HTTP ${r.status} - ${(await r.text()).slice(0, 200)}`;
      return NextResponse.json(report, { status: 200 });
    }
    const json = await r.json();
    report.reachable = true;
    report.models = (json.data || json.models || []).length;
  } catch (e: any) {
    report.ms = Date.now() - started;
    report.error = explainNetwork(String(e?.message || e));
  }

  return NextResponse.json(report);
}
