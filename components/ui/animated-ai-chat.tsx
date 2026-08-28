"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpRight,
  Command,
  FileText,
  LoaderIcon,
  Paperclip,
  SendIcon,
  Square,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* auto-resizing textarea                                              */
/* ------------------------------------------------------------------ */

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

export function useAutoResizeTextarea({
  minHeight,
  maxHeight,
}: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }
      textarea.style.height = `${minHeight}px`;
      const newHeight = Math.max(
        minHeight,
        Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
      );
      textarea.style.height = `${newHeight}px`;
      // past the cap the box stops growing, so it has to scroll instead
      textarea.style.overflowY =
        maxHeight && textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    },
    [minHeight, maxHeight]
  );

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) textarea.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

/* ------------------------------------------------------------------ */
/* ambient background + typing dots                                    */
/* ------------------------------------------------------------------ */

export function AmbientGlow() {
  return (
    <div
      className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
      style={{ opacity: "var(--glow)" }}
      aria-hidden
    >
      <div
        className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full blur-[128px]"
        style={{
          background: "radial-gradient(circle, var(--pi-accent), transparent 70%)",
          opacity: 0.14,
        }}
      />
      <div
        className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full blur-[128px] [animation-delay:700ms]"
        style={{
          background: "radial-gradient(circle, var(--pi-accent-2), transparent 70%)",
          opacity: 0.12,
        }}
      />
      <div className="absolute right-1/3 top-1/4 h-64 w-64 animate-pulse rounded-full bg-fuchsia-500/10 blur-[96px] [animation-delay:1000ms]" />
    </div>
  );
}

export function TypingDots() {
  return (
    <div className="ml-1 flex items-center" aria-hidden>
      {[1, 2, 3].map((dot) => (
        <motion.div
          key={dot}
          className="mx-0.5 h-1.5 w-1.5 rounded-full bg-white/90"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: dot * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function ActionButton({
  icon,
  label,
  description,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "group relative flex min-h-[76px] w-full items-center gap-3 overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
        active
          ? "chip-on"
          : "border-white/[0.09] bg-white/[0.025] text-white/60 hover:border-accentc/45 hover:bg-accentc/[0.08] hover:text-white/90"
      )}
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/45 transition-all group-hover:border-accentc/35 group-hover:bg-accentc/15 group-hover:text-accentc">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-semibold tracking-tight text-white/85">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block truncate text-[10.5px] text-white/35">
            {description}
          </span>
        ) : null}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 flex-none text-white/20 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-accentc" />
      <span className="absolute inset-y-0 left-0 w-0.5 bg-accentc opacity-0 transition-opacity group-hover:opacity-100" />
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* composer                                                            */
/* ------------------------------------------------------------------ */

export interface CommandSuggestion {
  icon: React.ReactNode;
  label: string;
  description: string;
  prefix: string;
}

export interface AnimatedComposerProps {
  value: string;
  onValueChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  onAttach: (files: FileList | File[]) => void;
  onRemoveAttachment: (id: string) => void;
  attachments: Attachment[];
  busy: boolean;
  suggestions: CommandSuggestion[];
  onSelectCommand: (prefix: string) => void;
  /** pulls the last user message back into the box on ArrowUp in an empty composer */
  onRecall?: () => void;
  placeholder?: string;
  footer?: React.ReactNode;
  compact?: boolean;
}

export function AnimatedComposer({
  value,
  onValueChange,
  onSend,
  onStop,
  onAttach,
  onRemoveAttachment,
  attachments,
  busy,
  suggestions,
  onSelectCommand,
  onRecall,
  placeholder = "Ask anything, or type / for a skill...",
  footer,
  compact,
}: AnimatedComposerProps) {
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [dragging, setDragging] = useState(false);
  const commandPaletteRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: compact ? 52 : 64,
    maxHeight: 240,
  });

  // only the commands still matching what has been typed
  const filtered = React.useMemo(() => {
    if (!showCommandPalette) return suggestions;
    const q = value.toLowerCase();
    const hit = suggestions.filter(
      (s) => s.prefix.startsWith(q) || s.label.toLowerCase().includes(q.slice(1))
    );
    return hit.length ? hit : suggestions;
  }, [showCommandPalette, suggestions, value]);

  useEffect(() => {
    setShowCommandPalette(value.startsWith("/") && !value.includes(" "));
  }, [value]);

  useEffect(() => {
    setActiveSuggestion(0);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const commandButton = document.querySelector("[data-command-button]");
      if (
        commandPaletteRef.current &&
        !commandPaletteRef.current.contains(target) &&
        !commandButton?.contains(target)
      ) {
        setShowCommandPalette(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    // On a narrow first paint some browsers report a stale scrollHeight before
    // fonts and container width settle. An empty composer should always begin
    // at its compact baseline, never at the 240px growth cap.
    adjustHeight(!value);
  }, [value, adjustHeight]);

  const pick = (index: number) => {
    const selected = filtered[index];
    if (!selected) return;
    onSelectCommand(selected.prefix);
    setShowCommandPalette(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter during IME composition confirms the candidate - it must never send
    // the message or pick a palette entry (JP/CN/KR input).
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;
    if (showCommandPalette && filtered.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestion((p) => (p + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion((p) => (p - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        pick(activeSuggestion);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandPalette(false);
        return;
      }
    }
    // an empty box + ArrowUp recalls the last thing you sent, like a shell
    if (e.key === "ArrowUp" && !value && onRecall) {
      e.preventDefault();
      onRecall();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() || attachments.length) onSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgs = items
      .filter((i) => i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter(Boolean) as File[];
    if (imgs.length) {
      e.preventDefault();
      onAttach(imgs);
    }
  };

  const canSend = !!value.trim() || attachments.length > 0;

  return (
    <div className="relative w-full">
      <motion.div
        className={cn(
          "composer-glow command-composer relative overflow-hidden rounded-2xl border bg-white/[0.025] shadow-lift backdrop-blur-2xl transition-colors",
          dragging ? "border-accentc/60 bg-accentc/[0.06]" : "border-white/[0.06]"
        )}
        initial={{ scale: 0.995, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // dragleave fires when crossing into child elements; only drop the
          // highlight when the pointer actually left the composer.
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragging(false);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer?.files?.length) onAttach(e.dataTransfer.files);
        }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.05] px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accentc shadow-[0_0_10px_rgb(var(--accent-vivid-rgb))]" />
            <span className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Command input
            </span>
          </div>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.14em] text-white/20 sm:block">
            Shift + Enter for new line
          </span>
        </div>
        <AnimatePresence>
          {showCommandPalette && filtered.length > 0 && (
            <motion.div
              ref={commandPaletteRef}
              className="absolute bottom-full left-2 right-2 z-50 mb-2 overflow-hidden rounded-xl border border-white/10 bg-black/95 shadow-lift backdrop-blur-xl"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              role="listbox"
              aria-label="Skill commands"
            >
              <div className="max-h-64 overflow-y-auto p-1">
                {filtered.map((suggestion, index) => (
                  <button
                    key={suggestion.prefix}
                    type="button"
                    role="option"
                    aria-selected={activeSuggestion === index}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors",
                      activeSuggestion === index
                        ? "bg-accentc/15 text-white"
                        : "text-white/65 hover:bg-white/[0.05]"
                    )}
                    onMouseMove={() => setActiveSuggestion(index)}
                    onClick={() => pick(index)}
                  >
                    <span
                      className={cn(
                        "mt-px flex h-5 w-5 flex-none items-center justify-center",
                        activeSuggestion === index ? "text-accentc" : "text-white/40"
                      )}
                    >
                      {suggestion.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{suggestion.label}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-white/35">
                        {suggestion.description}
                      </span>
                    </span>
                    <span className="mt-px flex-none font-mono text-[11px] text-white/40">
                      {suggestion.prefix}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-3.5 pb-1.5">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label="Message"
            rows={1}
            className={cn(
              "w-full resize-none border-none bg-transparent px-1 py-1 text-sm text-white/90",
              "placeholder:text-white/30 focus:outline-none",
              compact ? "min-h-[52px]" : "min-h-[64px]"
            )}
          />
        </div>

        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              className="flex flex-wrap gap-2 px-3.5 pb-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
            >
              {attachments.map((file) => (
                <motion.div
                  key={file.id}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] py-1.5 pl-1.5 pr-2 text-xs text-white/70"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  {file.kind === "image" && file.data ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.data}
                      alt=""
                      className="h-6 w-6 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-4 w-4 text-white/40" />
                  )}
                  <span className="max-w-[160px] truncate font-mono">
                    {file.name}
                  </span>
                  <button
                    onClick={() => onRemoveAttachment(file.id)}
                    className="-m-1 rounded p-1 text-white/40 transition-colors hover:text-white"
                    aria-label={`Remove ${file.name}`}
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-2.5 py-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="icon-btn"
              aria-label="Attach a file"
              title="Attach an image or text file"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-command-button
              onClick={(e) => {
                e.stopPropagation();
                setShowCommandPalette((p) => !p);
                textareaRef.current?.focus();
              }}
              className={cn("icon-btn", showCommandPalette && "bg-white/10 text-white")}
              aria-label="Show skill commands"
              aria-expanded={showCommandPalette}
              title="Skill commands (/)"
            >
              <Command className="h-4 w-4" />
            </button>
            <div className="min-w-0 truncate pl-1">{footer}</div>
          </div>

          <motion.button
            type="button"
            onClick={busy ? onStop : onSend}
            whileTap={{ scale: 0.97 }}
            disabled={!busy && !canSend}
            className={cn(
              "flex min-h-[38px] flex-none items-center gap-2 rounded-lg px-4 text-sm font-medium transition-all",
              busy
                ? "bg-white/[0.09] text-white/85 hover:bg-white/[0.14]"
                : canSend
                ? "bg-accentc text-pure shadow-accent hover:brightness-110"
                : "cursor-not-allowed bg-white/[0.05] text-white/35"
            )}
            aria-label={busy ? "Stop generating" : "Send message"}
          >
            {busy ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <SendIcon className="h-4 w-4" />
                <span className="hidden xs:inline">Send</span>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,.txt,.md,.csv,.json,.log,.tsv,.yaml,.yml"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onAttach(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* hero - shown on an empty conversation                               */
/* ------------------------------------------------------------------ */

export function ChatHero({
  title = "Build. Decide. Ship.",
  subtitle = "Type a command or ask a question",
  children,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      className="hero-stage relative z-10 w-full"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative mx-auto max-w-2xl text-center">
        <div className="mb-5 flex items-center justify-center gap-3" aria-hidden>
          <span className="h-px w-10 bg-accentc/60" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-accentc">
            Sana2 / Advanced assistant
          </span>
          <span className="h-px w-10 bg-accentc/60" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45 }}
          className="inline-block"
        >
          <h1 className="font-display hero-title pb-2 text-[clamp(2.4rem,6vw,5.4rem)] font-bold leading-[0.9] tracking-[-0.065em] text-white/95">
            {title}
          </h1>
          <motion.div
            className="mx-auto h-[3px] bg-gradient-to-r from-transparent via-accentc to-transparent"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "100%", opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.7 }}
          />
        </motion.div>
        <motion.p
          className="mx-auto mt-5 max-w-xl text-[13.5px] leading-relaxed text-white/50 sm:text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28 }}
        >
          {subtitle}
        </motion.p>
      </div>
      <div className="mt-8 space-y-5">{children}</div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* thinking pill                                                       */
/* ------------------------------------------------------------------ */

export function ThinkingPill({
  label = "agent",
  phase,
  elapsed,
}: {
  label?: string;
  phase?: string;
  elapsed?: number;
}) {
  return (
    <motion.div
      className="pointer-events-none fixed bottom-[7.5rem] left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/[0.07] bg-black/70 px-3.5 py-1.5 shadow-lift backdrop-blur-2xl"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5">
        <LoaderIcon className="h-3.5 w-3.5 animate-[spin_1.6s_linear_infinite] text-accentc" />
        <span className="text-[12.5px] text-white/75">
          {phase === "tools" ? "Running tools" : "Thinking"}
        </span>
        {elapsed ? (
          <span className="font-mono text-[11px] text-white/35">
            {(elapsed / 1000).toFixed(0)}s
          </span>
        ) : null}
        <TypingDots />
        <span className="sr-only">{label} is generating a reply</span>
      </div>
    </motion.div>
  );
}
