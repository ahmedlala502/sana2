"use client";

import * as React from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ListboxOption {
  value: string;
  label: string;
  /** second line under the label - the "preview" of what you are picking */
  hint?: string;
  /** small right-aligned tag, e.g. a context window or a provider name */
  meta?: string;
  icon?: React.ReactNode;
  /** shown greyed with a reason, still selectable */
  warn?: string;
  group?: string;
}

/**
 * A themed single-select.
 *
 * Native <select> popups are painted by the OS, which honours almost nothing
 * from the page: on Windows/Chromium a select with a transparent background
 * rendered its options as white-on-white, so the list looked empty. It also
 * cannot show a description per row, which is what makes a list of 80 model
 * ids navigable. This gives both, plus type-to-filter and keyboard control.
 */
export function Listbox({
  value,
  options,
  onChange,
  placeholder = "Select",
  searchable,
  disabled,
  className,
  buttonClassName,
  align = "start",
  label,
  /** rendered at the bottom of the popup, e.g. a "show all" toggle */
  footer,
}: {
  value: string;
  options: ListboxOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  align?: "start" | "end";
  label?: string;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [drop, setDrop] = useState<"down" | "up">("down");

  const selected = options.find((o) => o.value === value);
  // search is opt-in, but a long list is unusable without it either way
  const withSearch = searchable ?? options.length > 8;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        o.hint?.toLowerCase().includes(q) ||
        o.group?.toLowerCase().includes(q)
    );
  }, [options, query]);

  /* group headings, preserving the order groups first appear in */
  const rows = useMemo(() => {
    const acc: Array<
      { kind: "group"; label: string } | { kind: "option"; option: ListboxOption; index: number }
    > = [];
    let last: string | undefined;
    filtered.forEach((o, i) => {
      if (o.group && o.group !== last) {
        acc.push({ kind: "group", label: o.group });
        last = o.group;
      }
      acc.push({ kind: "option", option: o, index: i });
    });
    return acc;
  }, [filtered]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  /* open onto the selected row, not the top of the list */
  useEffect(() => {
    if (!open) return;
    const i = filtered.findIndex((o) => o.value === value);
    setActive(i < 0 ? 0 : i);
    if (withSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [open, value, withSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* flip the popup above the button when there is no room below it */
  useLayoutEffect(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDrop(window.innerHeight - rect.bottom < 280 && rect.top > 280 ? "up" : "down");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    // capture, so a click that also opens another listbox still closes this one
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [open, close]);

  /* keep the active row in view while arrowing through a long list */
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const commit = (v: string) => {
    onChange(v);
    close();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      // stop the app-level Escape handler from also aborting a generation
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(filtered.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = filtered[active];
      if (o) commit(o.value);
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        className={cn(
          "flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
          "text-[11.5px] text-white/80 hover:text-white disabled:opacity-40",
          buttonClassName
        )}
      >
        {selected?.icon ? <span className="flex-none">{selected.icon}</span> : null}
        <span className={cn("min-w-0 flex-1 truncate", !selected && "text-white/40")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-none text-white/30 transition-transform",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className={cn(
            "listbox-pop absolute z-50 min-w-full overflow-hidden rounded-xl",
            drop === "down" ? "top-[calc(100%+4px)]" : "bottom-[calc(100%+4px)]",
            align === "end" ? "right-0" : "left-0"
          )}
          style={{ width: "max-content", maxWidth: "min(26rem, 90vw)" }}
        >
          {withSearch ? (
            <div className="flex items-center gap-1.5 border-b border-white/[0.08] px-2.5 py-2">
              <Search className="h-3 w-3 flex-none text-white/30" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Filter"
                spellCheck={false}
                aria-label="Filter options"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-white/85 outline-none placeholder:text-white/25"
              />
              {filtered.length !== options.length ? (
                <span className="flex-none font-mono text-[10px] text-white/30">
                  {filtered.length}
                </span>
              ) : null}
            </div>
          ) : null}

          <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="max-h-[min(22rem,60vh)] overflow-y-auto overscroll-contain py-1"
          >
            {rows.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11.5px] text-white/35">
                Nothing matches &ldquo;{query}&rdquo;.
              </p>
            ) : (
              rows.map((row, i) =>
                row.kind === "group" ? (
                  <div
                    key={`g-${row.label}-${i}`}
                    className="px-3 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-white/30"
                  >
                    {row.label}
                  </div>
                ) : (
                  <button
                    key={row.option.value}
                    type="button"
                    role="option"
                    aria-selected={row.option.value === value}
                    data-index={row.index}
                    data-active={row.index === active}
                    data-selected={row.option.value === value}
                    onMouseEnter={() => setActive(row.index)}
                    onClick={() => commit(row.option.value)}
                    className="listbox-option flex w-full items-start gap-2 px-3 py-1.5 text-left text-white/75"
                  >
                    {row.option.icon ? (
                      <span className="mt-0.5 flex-none">{row.option.icon}</span>
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="min-w-0 truncate font-mono text-[11.5px]">
                          {row.option.label}
                        </span>
                        {row.option.meta ? (
                          <span className="flex-none rounded bg-white/[0.06] px-1 font-mono text-[9.5px] text-white/40">
                            {row.option.meta}
                          </span>
                        ) : null}
                      </span>
                      {row.option.hint ? (
                        <span className="mt-0.5 block truncate text-[10.5px] text-white/35">
                          {row.option.hint}
                        </span>
                      ) : null}
                      {row.option.warn ? (
                        <span className="mt-0.5 block text-[10.5px] text-amber-300/70">
                          {row.option.warn}
                        </span>
                      ) : null}
                    </span>
                    {row.option.value === value ? (
                      <Check className="mt-0.5 h-3 w-3 flex-none text-accentc" aria-hidden />
                    ) : null}
                  </button>
                )
              )
            )}
          </div>

          {footer ? (
            <div className="border-t border-white/[0.08] px-2.5 py-1.5">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
