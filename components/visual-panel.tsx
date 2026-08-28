"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  LayoutDashboard,
  Maximize2,
  Minimize2,
  PanelRightClose,
  RefreshCw,
  Table2,
  Workflow,
} from "lucide-react";
import { cn, copyText, downloadBlob, estimateTokens, fmtMs } from "@/lib/utils";
import { artifactDocument, highlightCode } from "@/lib/markdown";
import type { Artifact, Message } from "@/lib/types";

const KIND_ICON = {
  html: LayoutDashboard,
  svg: Workflow,
  mermaid: Workflow,
  table: Table2,
  code: Code2,
} as const;

const MIN_W = 340;
const MAX_W_RATIO = 0.72;

export function VisualPanel({
  artifacts,
  messages,
  onClose,
  dark = true,
  busy = false,
  autoPreview = true,
  accent = "#8b5cf6",
  width,
  onWidthChange,
  /** below lg the panel is a full-screen sheet, not a resizable rail */
  sheet = false,
}: {
  artifacts: Artifact[];
  messages: Message[];
  onClose: () => void;
  dark?: boolean;
  busy?: boolean;
  autoPreview?: boolean;
  accent?: string;
  width: number;
  onWidthChange: (w: number) => void;
  sheet?: boolean;
}) {
  const [tab, setTab] = useState<"canvas" | "metrics">("canvas");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<"code" | "preview">("code");
  const [expanded, setExpanded] = useState(false);
  /** bumped to force the iframe to remount, i.e. re-run the artifact */
  const [runKey, setRunKey] = useState(0);

  const current =
    artifacts.find((a) => a.id === selected) ||
    artifacts[artifacts.length - 1] ||
    null;

  // Auto-switch: show code while generating, flip to Preview when it finishes.
  const prevBusy = useRef(busy);
  useEffect(() => {
    if (!prevBusy.current && busy) {
      setView("code");
    } else if (prevBusy.current && !busy && current && autoPreview) {
      setView("preview");
    }
    prevBusy.current = busy;
  }, [busy, current, autoPreview]);

  const metrics = useMemo(() => {
    const assistant = messages.filter((m) => m.role === "assistant" && m.content);
    const times = assistant.map((m) => m.ms || 0).filter(Boolean);
    const totalTokens = messages.reduce(
      (n, m) => n + estimateTokens(m.content) + estimateTokens(m.reasoning || ""),
      0
    );
    const tools = messages.flatMap((m) => m.toolCalls || []);
    const errors = messages.filter((m) => m.error).length;
    return {
      turns: assistant.length,
      avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      fastest: times.length ? Math.min(...times) : 0,
      slowest: times.length ? Math.max(...times) : 0,
      totalTokens,
      times,
      errors,
      toolCount: tools.length,
      toolFails: tools.filter((t) => !t.ok).length,
      toolMs: tools.reduce((n, t) => n + (t.ms || 0), 0),
    };
  }, [messages]);

  const save = () => {
    if (!current) return;
    if (view === "preview") {
      downloadBlob(
        artifactDocument(current, dark, accent),
        `${current.title || "artifact"}-${current.id}.html`,
        "text/html"
      );
    } else {
      const ext =
        current.kind === "svg" ? "svg" : current.kind === "mermaid" ? "mmd" : "html";
      downloadBlob(current.source, `artifact-${current.id}.${ext}`, "text/plain");
    }
  };

  /* drag handlers live on `document`; if the panel unmounts mid-drag they
     would keep firing forever without this cleanup */
  const endResizeRef = useRef<(() => void) | null>(null);
  useEffect(() => () => endResizeRef.current?.(), []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    endResizeRef.current?.(); // safety: a previous drag never released
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev: MouseEvent) => {
      onWidthChange(
        Math.min(
          Math.max(startW + (startX - ev.clientX), MIN_W),
          typeof window !== "undefined" ? window.innerWidth * MAX_W_RATIO : 1200
        )
      );
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      endResizeRef.current = null;
    };
    endResizeRef.current = onUp;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  };

  /* Escape closes the expanded overlay. preventDefault so the page-level
     handler does not also abort an in-flight generation. */
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  /* the rail can also be sized from the keyboard, which a drag handle alone
     leaves impossible */
  const resizeKeys = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 80 : 24;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onWidthChange(Math.min(width + step, window.innerWidth * MAX_W_RATIO));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onWidthChange(Math.max(width - step, MIN_W));
    }
  };

  const frameClass = expanded
    ? "scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6"
    : sheet
    ? "fixed inset-0 z-[55] flex flex-col bg-canvas"
    : "relative flex h-full flex-none flex-col border-l surface";

  return (
    <motion.aside
      key="vp"
      initial={expanded || sheet ? { opacity: 0 } : { x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={expanded || sheet ? { opacity: 0 } : { x: 40, opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={expanded || sheet ? undefined : { width }}
      className={frameClass}
      aria-label="Visual canvas"
      onClick={expanded ? () => setExpanded(false) : undefined}
    >
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          expanded
            ? "h-[92vh] w-[min(1180px,96vw)] rounded-2xl border border-white/10 bg-black/60 shadow-lift backdrop-blur-xl"
            : "h-full w-full"
        )}
        onClick={expanded ? (e) => e.stopPropagation() : undefined}
      >
        {!expanded && !sheet ? (
          <div
            onMouseDown={startResize}
            onKeyDown={resizeKeys}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize canvas (arrow keys)"
            aria-valuenow={Math.round(width)}
            className="group absolute left-0 top-0 z-20 flex h-full w-1.5 cursor-col-resize items-center justify-center hover:bg-accentc/20"
          >
            <div className="h-10 w-0.5 rounded bg-white/15 transition-colors group-hover:bg-accentc/70" />
          </div>
        ) : null}

        {/* ---------------- header ---------------- */}
        <div
          className="flex flex-none items-center justify-between gap-2 border-b border-white/[0.06] px-2.5 safe-t"
          style={{ minHeight: "var(--h-bar)" }}
        >
          {/*
            Canvas / Metrics used to be state with no switch attached, so the
            whole metrics view was unreachable. These are that switch.
          */}
          <div
            className="flex flex-none items-center rounded-lg border border-white/[0.07] p-0.5"
            role="tablist"
            aria-label="Panel view"
          >
            <TabButton
              on={tab === "canvas"}
              onClick={() => setTab("canvas")}
              icon={<LayoutDashboard className="h-3.5 w-3.5" />}
              label="Canvas"
              badge={artifacts.length || undefined}
            />
            <TabButton
              on={tab === "metrics"}
              onClick={() => setTab("metrics")}
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              label="Metrics"
            />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            {tab === "canvas" && current ? (
              <>
                <div className="mr-1 hidden items-center rounded-lg border border-white/[0.07] p-0.5 sm:flex">
                  <TabButton
                    on={view === "code"}
                    onClick={() => setView("code")}
                    icon={<Code2 className="h-3.5 w-3.5" />}
                    label="Code"
                  />
                  <TabButton
                    on={view === "preview"}
                    onClick={() => setView("preview")}
                    icon={<Eye className="h-3.5 w-3.5" />}
                    label="Preview"
                  />
                </div>
                {view === "preview" ? (
                  <button
                    onClick={() => setRunKey((k) => k + 1)}
                    className="icon-btn"
                    title="Re-run this artifact"
                    aria-label="Re-run artifact"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                ) : null}
                <button
                  onClick={save}
                  className="icon-btn"
                  title={view === "preview" ? "Download rendered page" : "Download source"}
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
              </>
            ) : null}

            <button
              onClick={() => setExpanded((v) => !v)}
              className="icon-btn hidden sm:inline-flex"
              title={expanded ? "Minimize" : "Expand"}
              aria-label={expanded ? "Minimize panel" : "Expand panel"}
            >
              {expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
            <button onClick={onClose} className="icon-btn" aria-label="Close panel">
              <PanelRightClose className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* mobile: the Code/Preview switch has no room in the header row */}
        {tab === "canvas" && current ? (
          <div className="flex flex-none gap-1 border-b border-white/[0.06] p-1.5 sm:hidden">
            <TabButton
              on={view === "code"}
              onClick={() => setView("code")}
              icon={<Code2 className="h-3.5 w-3.5" />}
              label="Code"
              grow
            />
            <TabButton
              on={view === "preview"}
              onClick={() => setView("preview")}
              icon={<Eye className="h-3.5 w-3.5" />}
              label="Preview"
              grow
            />
          </div>
        ) : null}

        {/* ---------------- body ---------------- */}
        {tab === "canvas" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {artifacts.length > 1 ? (
              <div className="flex flex-none gap-1.5 overflow-x-auto border-b border-white/[0.06] px-2.5 py-2">
                {artifacts.map((a) => {
                  const Icon = KIND_ICON[a.kind] || Code2;
                  const on = current?.id === a.id;
                  return (
                    <button
                      key={a.id}
                      onClick={() => {
                        setSelected(a.id);
                        setView(autoPreview ? "preview" : "code");
                      }}
                      title={a.title || a.kind}
                      className={cn(
                        "flex max-w-[11rem] flex-none items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
                        on
                          ? "chip-on"
                          : "border-white/[0.06] text-white/45 hover:text-white/85"
                      )}
                    >
                      <Icon className="h-3 w-3 flex-none" />
                      <span className="truncate">{a.title || a.kind}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {current ? (
              <AnimatePresence mode="wait">
                {view === "code" ? (
                  <CodeView key={`code-${current.id}`} artifact={current} />
                ) : (
                  <motion.iframe
                    key={`preview-${current.id}-${runKey}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    title={`Preview: ${current.title || current.kind}`}
                    sandbox="allow-scripts"
                    srcDoc={artifactDocument(current, dark, accent)}
                    className="min-h-0 w-full flex-1 border-0"
                    style={{ background: dark ? "#0b0b0f" : "#ffffff" }}
                  />
                )}
              </AnimatePresence>
            ) : (
              <Empty />
            )}
          </div>
        ) : (
          <MetricsView metrics={metrics} />
        )}
      </div>
    </motion.aside>
  );
}

function TabButton({
  on,
  onClick,
  icon,
  label,
  badge,
  grow,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  grow?: boolean;
}) {
  return (
    <button
      role="tab"
      aria-selected={on}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] transition-colors",
        grow && "flex-1",
        on ? "bg-accentc/15 text-accentc" : "text-white/45 hover:text-white/85"
      )}
    >
      {icon}
      {label}
      {badge ? (
        <span className="rounded bg-accentc/25 px-1 font-mono text-[10px] text-accentc">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function Empty() {
  return (
    <div className="flex flex-1 items-center justify-center p-5 sm:p-8">
      <div className="canvas-empty relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/[0.08] p-6 text-left">
        <div className="mb-8 flex items-start justify-between">
          <div className="brand-mark flex h-11 w-11 items-center justify-center rounded-xl">
            <LayoutDashboard className="h-5 w-5 text-pure" />
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/25">Standby / 00</span>
        </div>
        <p className="font-display text-2xl font-bold tracking-tight text-white/90">Visual output,<br />ready on demand.</p>
        <p className="mt-3 text-xs leading-relaxed text-white/40">
          Ask the agent for a page, diagram, table, or code artifact. It will render here without interrupting the conversation.
        </p>
        <div className="mt-6 grid grid-cols-2 gap-2">
          {[
            [Code2, "Code"],
            [Eye, "Preview"],
            [Workflow, "Diagrams"],
            [Table2, "Tables"],
          ].map(([Icon, label]) => {
            const Glyph = Icon as typeof Code2;
            return (
              <div key={label as string} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-2 text-[10.5px] text-white/40">
                <Glyph className="h-3.5 w-3.5 text-accentc" />
                {label as string}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricsView({
  metrics,
}: {
  metrics: {
    turns: number;
    avg: number;
    fastest: number;
    slowest: number;
    totalTokens: number;
    times: number[];
    errors: number;
    toolCount: number;
    toolFails: number;
    toolMs: number;
  };
}) {
  const max = metrics.times.length ? Math.max(...metrics.times) : 1;
  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2.5">
        <Stat label="Replies" value={String(metrics.turns)} />
        <Stat label="Avg latency" value={fmtMs(metrics.avg)} />
        <Stat label="Fastest" value={fmtMs(metrics.fastest)} />
        <Stat label="Slowest" value={fmtMs(metrics.slowest)} />
        <Stat label="Context" value={`~${metrics.totalTokens.toLocaleString()}`} sub="tokens" />
        <Stat
          label="Errors"
          value={String(metrics.errors)}
          tone={metrics.errors ? "bad" : undefined}
        />
      </div>

      <div className="tile p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          <Activity className="h-3 w-3" /> Latency per reply
        </div>
        {metrics.times.length ? (
          <>
            <div className="flex h-24 items-end gap-1">
              {metrics.times.slice(-28).map((t, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t bg-gradient-to-t from-accentc/40 to-accentc"
                  style={{ height: `${Math.max(6, (t / max) * 100)}%` }}
                  title={fmtMs(t)}
                />
              ))}
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-white/25">
              <span>oldest</span>
              <span>peak {fmtMs(max)}</span>
              <span>latest</span>
            </div>
          </>
        ) : (
          <p className="text-xs text-white/30">No replies yet.</p>
        )}
      </div>

      <div className="tile p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">
          Tool calls
        </div>
        {metrics.toolCount ? (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-lg text-white/90">
                {metrics.toolCount}
              </span>
              <span className="text-[11.5px] text-white/40">
                calls · {fmtMs(metrics.toolMs)} total
              </span>
            </div>
            {/* success share, so a flaky server is visible at a glance */}
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-emerald-400"
                style={{
                  width: `${((metrics.toolCount - metrics.toolFails) / metrics.toolCount) * 100}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-[11px]">
              <span className="text-emerald-300/70">
                {metrics.toolCount - metrics.toolFails} ok
              </span>
              {metrics.toolFails ? (
                <span className="text-red-300/80">{metrics.toolFails} failed</span>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-xs text-white/30">
            No tools called. Connect an MCP server in the sidebar to give the model
            something to reach for.
          </p>
        )}
      </div>
    </div>
  );
}

function CodeView({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);
  const lines = artifact.source.split("\n").length;
  const html = highlightCode(artifact.source, artifact.lang);

  const copy = async () => {
    if (!(await copyText(artifact.source))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-none items-center justify-between border-b border-white/[0.06] px-3 py-1.5">
        <span className="min-w-0 truncate font-mono text-[11px] text-white/40">
          {lines} lines · {artifact.lang || artifact.kind}
        </span>
        <button
          onClick={copy}
          className="flex flex-none items-center gap-1 rounded-md px-2 py-1 text-[11px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/85"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-w-max">
          <div className="sticky left-0 z-10 select-none border-r border-white/[0.06] bg-white/[0.03] px-3 py-3 text-right font-mono text-[12.5px] leading-[1.6] text-white/20">
            {Array.from({ length: lines }).map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <pre className="flex-1 px-4 py-3 font-mono text-[12.5px] leading-[1.6] text-white/85">
            <code dangerouslySetInnerHTML={{ __html: html }} />
          </pre>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bad";
}) {
  return (
    <div className="tile p-3">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono text-lg",
          tone === "bad" ? "text-red-300" : "text-white/90"
        )}
      >
        {value}
        {sub ? (
          <span className="ml-1 font-sans text-[11px] text-white/30">{sub}</span>
        ) : null}
      </div>
    </div>
  );
}
