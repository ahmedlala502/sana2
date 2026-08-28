"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  GitBranch,
  Info,
  Pencil,
  RotateCcw,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn, copyText, fmtMs } from "@/lib/utils";
import { renderMarkdown } from "@/lib/markdown";
import type { Message, ToolTrace } from "@/lib/types";

export function ChatMessage({
  message,
  onRetry,
  onEdit,
  onBranch,
  live,
}: {
  message: Message;
  onRetry?: () => void;
  onEdit?: () => void;
  onBranch?: () => void;
  live?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [openReasoning, setOpenReasoning] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isUser = message.role === "user";

  const copy = async () => {
    const ok = await copyText(message.content);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  /*
    renderMarkdown injects a `.code-copy` button into every fenced block. One
    delegated listener handles all of them - re-binding per block on each
    streamed token would thrash, and the buttons are replaced wholesale on
    every re-render anyway.
  */
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    const onClick = async (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>(".code-copy");
      if (!btn) return;
      e.preventDefault();
      const ok = await copyText(btn.dataset.code || "");
      btn.textContent = ok ? "copied" : "failed";
      setTimeout(() => {
        btn.textContent = "copy";
      }, 1400);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="group mx-auto flex w-full max-w-3xl gap-3 sm:gap-3.5"
      style={{ marginBottom: "var(--gap-msg)" }}
    >
      <div
        className={cn(
          "flex h-7 w-7 flex-none items-center justify-center rounded-lg border text-[10px] font-bold",
          isUser
            ? "border-white/[0.08] bg-white/[0.05] text-white/65"
            : "border-accentc/30 bg-gradient-to-br from-accentc-vivid to-accentc-2 text-pure"
        )}
        aria-hidden
      >
        {isUser ? "YOU" : <Sparkles className="h-3.5 w-3.5" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-white/50">
          <span>{isUser ? "You" : message.model || "Assistant"}</span>
          {message.ts ? (
            <span
              className="font-normal text-white/25"
              title={new Date(message.ts).toLocaleString()}
            >
              {new Date(message.ts).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : null}
          {message.ms ? (
            <span className="font-normal text-white/30">{fmtMs(message.ms)}</span>
          ) : null}
          {message.provider && !isUser ? (
            <span className="rounded border border-white/[0.08] px-1.5 py-px text-[10px] font-normal uppercase tracking-wide text-white/35">
              {message.provider}
            </span>
          ) : null}
          {message.tokens ? (
            <span className="font-mono text-[10px] font-normal text-white/25">
              {message.tokens.toLocaleString()} tok
            </span>
          ) : null}
        </div>

        {message.attachments?.length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) =>
              a.kind === "image" && a.data ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.id}
                  src={a.data}
                  alt={a.name}
                  className="max-h-28 rounded-lg border border-white/[0.08]"
                />
              ) : (
                <div
                  key={a.id}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 font-mono text-[11px] text-white/50"
                >
                  {a.name}
                </div>
              )
            )}
          </div>
        ) : null}

        {message.toolCalls?.length ? (
          <div className="mb-2.5 space-y-1.5">
            {message.toolCalls.map((t, i) => (
              <ToolCard key={i} trace={t} />
            ))}
          </div>
        ) : null}

        {message.reasoning ? (
          <div className="mb-2.5 border-l-2 border-amber-400/50 pl-3">
            <button
              onClick={() => setOpenReasoning((o) => !o)}
              aria-expanded={openReasoning}
              className="flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-wider text-amber-300/70 hover:text-amber-300"
            >
              <ChevronRight
                className={cn(
                  "h-3 w-3 transition-transform",
                  openReasoning && "rotate-90"
                )}
              />
              Reasoning
              <span className="font-normal normal-case tracking-normal text-white/25">
                {message.reasoning.length.toLocaleString()} chars
              </span>
            </button>
            {openReasoning ? (
              <div className="mt-1.5 max-h-72 overflow-y-auto whitespace-pre-wrap pr-2 text-[13px] leading-relaxed text-white/45">
                {message.reasoning}
              </div>
            ) : null}
          </div>
        ) : null}

        {message.notice ? (
          <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-[12.5px] text-amber-300">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span className="min-w-0">{message.notice}</span>
          </div>
        ) : null}

        {message.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-400/25 bg-red-400/[0.06] px-3 py-2 text-[13px] text-red-200/90"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
            <span className="min-w-0 break-words">{message.error}</span>
          </div>
        ) : isUser ? (
          <div
            className="whitespace-pre-wrap break-words text-white/85"
            style={{ fontSize: "var(--text-msg)", lineHeight: "var(--lh-msg)" }}
          >
            {message.content}
          </div>
        ) : (
          <div
            ref={bodyRef}
            className="prose-chat break-words text-white/85"
            style={{ fontSize: "var(--text-msg)", lineHeight: "var(--lh-msg)" }}
            /* the whole reply is announced once it settles, not per token */
            aria-live={!live ? "polite" : undefined}
            aria-busy={live || undefined}
            dangerouslySetInnerHTML={{
              __html:
                renderMarkdown(message.content) +
                (live ? '<span class="caret" aria-hidden></span>' : ""),
            }}
          />
        )}

        {/* hover-until-shown on pointers, always visible on touch screens */}
        {!live ? (
          <div className="message-actions mt-2 flex flex-wrap gap-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 sm:gap-3">
            <RowAction onClick={copy} icon={copied ? Check : Copy}>
              {copied ? "Copied" : "Copy"}
            </RowAction>
            {!isUser && onRetry ? (
              <RowAction onClick={onRetry} icon={RotateCcw}>
                Retry
              </RowAction>
            ) : null}
            {isUser && onEdit ? (
              <RowAction onClick={onEdit} icon={Pencil}>
                Edit
              </RowAction>
            ) : null}
            {onBranch ? (
              <RowAction onClick={onBranch} icon={GitBranch}>
                Branch
              </RowAction>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function RowAction({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-11 items-center gap-1 rounded px-2 text-[11px] text-white/50 transition-colors hover:bg-white/[0.05] hover:text-accentc sm:min-h-0 sm:px-0"
    >
      <Icon className="h-3 w-3" />
      {children}
    </button>
  );
}

/** One MCP tool call - collapsed to a line, expandable to args and full result. */
function ToolCard({ trace }: { trace: ToolTrace }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border text-[11.5px]",
        trace.ok
          ? "border-emerald-400/20 bg-emerald-400/[0.04] text-emerald-200/80"
          : "border-red-400/25 bg-red-400/[0.05] text-red-200/80"
      )}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left"
      >
        <Wrench className="mt-0.5 h-3 w-3 flex-none" />
        <span className="min-w-0 flex-1">
          <span className="font-mono font-medium">
            {trace.server}.{trace.tool}
          </span>
          <span className="ml-2 text-white/35">{fmtMs(trace.ms)}</span>
          {!open ? (
            <span className="mt-0.5 line-clamp-1 font-mono text-[11px] text-white/40">
              {trace.result}
            </span>
          ) : null}
        </span>
        <ChevronRight
          className={cn(
            "mt-0.5 h-3 w-3 flex-none text-white/30 transition-transform",
            open && "rotate-90"
          )}
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-white/[0.07] px-2.5 py-2">
          <Block label="Arguments" body={JSON.stringify(trace.args, null, 2)} />
          <Block label="Result" body={trace.result} />
        </div>
      ) : null}
    </div>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
        {label}
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white/[0.04] p-2 font-mono text-[11px] leading-relaxed text-white/60">
        {body}
      </pre>
    </div>
  );
}
