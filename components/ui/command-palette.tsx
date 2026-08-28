"use client";

import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: React.ReactNode;
  keys?: string;
  /** extra searchable text that is ranked but never displayed (e.g. chat bodies) */
  keywords?: string;
  run: () => void;
}

/** Ranks by where the match lands: prefix beats word-start beats anywhere. */
function score(cmd: Command, q: string) {
  if (!q) return 0;
  const hay = `${cmd.label} ${cmd.hint || ""} ${cmd.keywords || ""} ${cmd.group}`.toLowerCase();
  const i = hay.indexOf(q);
  if (i < 0) return -1;
  if (cmd.label.toLowerCase().startsWith(q)) return 100;
  // a body match ranks below anything found in the visible label/hint
  if (!cmd.label.toLowerCase().includes(q) && cmd.keywords?.toLowerCase().includes(q)) return 10;
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(hay)) return 50;
  return 20 - Math.min(i, 19);
}

/**
 * One keyboard entry point for everything: chats, skills, settings, panels.
 *
 * Deliberately the only modal in the app, so focus handling lives in exactly
 * one place - trap on open, restore on close, Escape always exits.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands
      .map((c) => ({ c, s: score(c, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.c);
  }, [commands, query]);

  const groups = useMemo(() => {
    const m = new Map<string, Command[]>();
    results.forEach((c) => {
      if (!m.has(c.group)) m.set(c.group, []);
      m.get(c.group)!.push(c);
    });
    return Array.from(m.entries());
  }, [results]);

  // flat index -> command, so arrow keys cross group boundaries naturally
  const flat = useMemo(() => groups.flatMap(([, cs]) => cs), [groups]);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement;
    setQuery("");
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      clearTimeout(t);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // keep the highlighted row in view as the selection walks past the fold
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const runAt = (i: number) => {
    const cmd = flat[i];
    if (!cmd) return;
    onClose();
    // let the modal unmount and focus settle before the command mutates state
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((p) => (p + 1) % Math.max(flat.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((p) => (p - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "Tab") {
      // aria-modal promises a trap, so deliver one: Tab/Shift+Tab cycle
      // through the input and the result rows and never leak to the page.
      e.preventDefault();
      const root = dialogRef.current;
      if (!root) return;
      const els = Array.from(
        root.querySelectorAll<HTMLElement>("input, button")
      ).filter((el) => !el.hasAttribute("disabled"));
      if (!els.length) return;
      const i = els.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? i <= 0
          ? els.length - 1
          : i - 1
        : i === els.length - 1
        ? 0
        : i + 1;
      els[next].focus();
    }
  };

  let index = -1;

  return (
    <AnimatePresence>
      <motion.div
        key="cp"
        className="scrim fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          initial={{ opacity: 0, y: -8, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.985 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          onKeyDown={onKeyDown}
          className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/[0.1] bg-black/90 shadow-lift backdrop-blur-2xl"
        >
          <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
            <Search className="h-4 w-4 flex-none text-white/35" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats, skills and settings..."
              aria-label="Search commands"
              aria-controls="cp-list"
              className="w-full bg-transparent py-3.5 text-sm text-white/90 outline-none placeholder:text-white/30"
            />
            <kbd className="flex-none rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-white/35">
              esc
            </kbd>
          </div>

          <div
            ref={listRef}
            id="cp-list"
            role="listbox"
            className="max-h-[52vh] overflow-y-auto p-1.5"
          >
            {flat.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12.5px] text-white/35">
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            ) : (
              groups.map(([group, cmds]: [string, Command[]]) => (
                <div key={group} className="mb-1">
                  <div className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    {group}
                  </div>
                  {cmds.map((c) => {
                    index++;
                    const i = index;
                    const on = i === active;
                    return (
                      <button
                        key={c.id}
                        role="option"
                        aria-selected={on}
                        data-active={on}
                        onMouseMove={() => setActive(i)}
                        onClick={() => runAt(i)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          on ? "bg-accentc/15 text-white" : "text-white/65 hover:bg-white/[0.04]"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 flex-none items-center justify-center",
                            on ? "text-accentc" : "text-white/35"
                          )}
                        >
                          {c.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">
                          {c.label}
                          {c.hint ? (
                            <span className="ml-2 text-[11.5px] text-white/30">
                              {c.hint}
                            </span>
                          ) : null}
                        </span>
                        {c.keys ? (
                          <kbd className="flex-none rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-white/35">
                            {c.keys}
                          </kbd>
                        ) : null}
                        {on ? (
                          <CornerDownLeft className="h-3.5 w-3.5 flex-none text-accentc" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
