import { NextRequest, NextResponse } from "next/server";
import { callTool, listTools } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refuse to proxy anything that is not an http(s) endpoint. */
function validUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: {
    action?: string;
    url?: string;
    headers?: Record<string, string>;
    tool?: string;
    args?: unknown;
  };
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
    const { action, url, headers, tool, args } = body;
    if (!url) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }
    if (!validUrl(url)) {
      return NextResponse.json(
        { error: "url must be an http(s) MCP endpoint" },
        { status: 400 }
      );
    }

    if (action === "list") {
      const started = Date.now();
      const tools = await listTools(url, headers || {}, req.signal);
      return NextResponse.json({ tools, ms: Date.now() - started });
    }

    if (action === "call") {
      if (!tool) {
        return NextResponse.json({ error: "tool is required" }, { status: 400 });
      }
      const started = Date.now();
      const result = await callTool(url, tool, args, headers || {}, req.signal);
      return NextResponse.json({ result, ms: Date.now() - started });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e) },
      { status: 502 }
    );
  }
}
