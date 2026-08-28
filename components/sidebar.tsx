"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Blocks,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Cpu,
  Download,
  Eye,
  EyeOff,
  Loader2,
  MessageSquarePlus,
  Monitor,
  Moon,
  Pencil,
  Pin,
  PinOff,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { cn, dateBucket } from "@/lib/utils";
import { ResizeHandle } from "@/components/ui/resize-handle";
import type { Theme } from "@/lib/theme";
import { ACCENT_LIST } from "@/lib/theme";
import { MODEL_HINTS, PROVIDERS, PROVIDER_ORDER } from "@/lib/providers";
import { PLUGINS, SKILLS } from "@/lib/registry";
import type {
  Conversation,
  Density,
  GenParams,
  McpServer,
  Prefs,
  ProviderId,
} from "@/lib/types";

import { Listbox, type ListboxOption } from "@/components/ui/listbox";

type Tab = "chats" | "skills" | "plugins" | "mcp" | "settings";

export interface SidebarProps {
  conversations: Conversation[];
  currentId: string | null;
  /** true while boot reads localStorage - avoids flashing "No saved chats" */
  loading?: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string) => void;
  onNew: () => void;

  provider: ProviderId;
  setProvider: (p: ProviderId) => void;
  model: string;
  setModel: (m: string) => void;
  baseUrl: string;
  setBaseUrl: (u: string) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  rememberKey: boolean;
  setRememberKey: (b: boolean) => void;
  models: string[];
  /** ready-made rows for the model picker, already filtered and grouped */
  modelOptions: ListboxOption[];
  /** how many catalogue entries are non-chat endpoints */
  hiddenModels: number;
  loadingModels: boolean;
  onLoadModels: () => void;
  connection: { ok: boolean; message: string } | null;
  /** which providers the server itself holds a key for, from /api/health */
  serverKeys: Record<string, boolean>;
  /** which providers the browser holds a key for - one per provider */
  providerKeys: Record<ProviderId, string>;
  /** endpoint reverts to the provider default */
  onResetEndpoint: () => void;

  params: GenParams;
  setParams: (p: GenParams) => void;

  enabledPlugins: string[];
  togglePlugin: (id: string) => void;
  enabledSkills: string[];
  toggleSkill: (id: string) => void;
  onUseSkill: (id: string) => void;

  mcpServers: McpServer[];
  addMcpServer: (name: string, url: string) => void;
  removeMcpServer: (id: string) => void;
  toggleMcpServer: (id: string) => void;
  refreshMcpServer: (id: string) => void;

  theme: Theme;
  setTheme: (t: Theme) => void;

  prefs: Prefs;
  setPrefs: (p: Prefs) => void;
  onExport: () => void;
  onImport: (file: File) => void;

  onWipe: () => void;
  /** rendered as a drawer under lg, where a close control is needed */
  onClose?: () => void;

  /** desktop only: collapsed to an icon strip */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** desktop only: drag-resizable width */
  width?: number;
  onWidthChange?: (w: number) => void;
  onResetWidth?: () => void;
}

export const RAIL_MIN = 240;
export const RAIL_MAX = 520;
export const RAIL_DEFAULT = 310;

const TABS: { id: Tab; icon: typeof Sparkles; label: string }[] = [
  { id: "chats", icon: MessageSquarePlus, label: "Chats" },
  { id: "skills", icon: Sparkles, label: "Skills" },
  { id: "plugins", icon: Blocks, label: "Plugins" },
  { id: "mcp", icon: Plug, label: "MCP" },
  { id: "settings", icon: Settings2, label: "Settings" },
];

export function Sidebar(p: SidebarProps) {
  const [tab, setTab] = useState<Tab>("chats");
  const [showKey, setShowKey] = useState(false);
  const [mcpName, setMcpName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const spec = PROVIDERS[p.provider];

  /*
    Chats: pinned first, then bucketed by recency. Search looks inside message
    bodies too - finding the chat where you pasted a stack trace is the whole
    reason to have search here.
  */
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? p.conversations.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some((m) => m.content.toLowerCase().includes(q))
        )
      : p.conversations;

    const sorted = [...matched].sort((a, b) => b.ts - a.ts);
    const out: [string, Conversation[]][] = [];
    const pinned = sorted.filter((c) => c.pinned);
    if (pinned.length) out.push(["Pinned", pinned]);

    const rest = sorted.filter((c) => !c.pinned);
    const seen = new Map<string, Conversation[]>();
    rest.forEach((c) => {
      const k = dateBucket(c.ts);
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k)!.push(c);
    });
    return out.concat(Array.from(seen.entries()));
  }, [p.conversations, query]);

  const commitRename = (id: string) => {
    const t = draftTitle.trim();
    if (t) p.onRename(id, t);
    setRenaming(null);
  };

  /* Clicking a tab while collapsed should expand onto that tab, not just
     switch a panel nobody can see. */
  const openTab = (t: Tab) => {
    setTab(t);
    if (p.collapsed) p.onToggleCollapse?.();
  };

  if (p.collapsed) {
    return (
      <aside
        className="relative flex h-full flex-col items-center gap-1 border-r surface"
        style={{ width: "var(--rail-collapsed-w)" }}
        aria-label="Sidebar, collapsed"
      >
        <button
          onClick={p.onToggleCollapse}
          className="brand-mark mt-2 flex h-9 w-9 flex-none items-center justify-center rounded-lg transition-transform hover:scale-105"
          aria-label="Expand sidebar"
          title="Expand sidebar (Ctrl/Cmd B)"
        >
          <Sparkles className="h-4 w-4 text-pure" />
        </button>

        <button
          onClick={p.onNew}
          className="icon-btn mt-1 text-accentc hover:bg-accentc/15"
          aria-label="New chat"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </button>

        <div className="my-1 h-px w-6 bg-white/[0.08]" />

        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => openTab(t.id)}
            className={cn("icon-btn", tab === t.id && "text-accentc")}
            aria-label={t.label}
            title={t.label}
          >
            <t.icon className="h-4 w-4" />
          </button>
        ))}

        <div className="mt-auto pb-2">
          <button
            onClick={p.onToggleCollapse}
            className="icon-btn"
            aria-label="Expand sidebar"
            title="Expand sidebar (Ctrl/Cmd B)"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className="relative flex h-full w-full flex-col border-r surface lg:flex-none"
      style={p.width ? { width: p.width } : undefined}
    >
      {p.onWidthChange && p.width ? (
        <ResizeHandle
          side="left"
          width={p.width}
          min={RAIL_MIN}
          max={RAIL_MAX}
          onWidthChange={p.onWidthChange}
          onDoubleClick={p.onResetWidth}
          label="Resize sidebar"
        />
      ) : null}
      <div
        className="flex flex-none items-center gap-2.5 border-b border-white/[0.06] px-4 safe-t"
        style={{ minHeight: "var(--h-bar)" }}
      >
        <div className="brand-mark flex h-8 w-8 flex-none items-center justify-center rounded-lg">
          <Sparkles className="h-4 w-4 text-pure" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-[13px] font-bold uppercase tracking-[0.08em] text-white/95">
            Sana2
          </div>
          <div className="truncate font-mono text-[8.5px] uppercase tracking-[0.18em] text-white/30">Advanced assistant</div>
        </div>
        <span
          className={cn(
            "h-2 w-2 flex-none rounded-full",
            p.connection?.ok
              ? "bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
              : p.connection
              ? "bg-red-400"
              : "bg-white/20"
          )}
          title={p.connection?.message || "not connected"}
          role="status"
          aria-label={p.connection?.message || "Not connected"}
        />
        {p.onClose ? (
          <button onClick={p.onClose} className="icon-btn lg:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {p.onToggleCollapse ? (
          <button
            onClick={p.onToggleCollapse}
            className="icon-btn hidden lg:inline-flex"
            aria-label="Collapse sidebar"
            title="Collapse sidebar (Ctrl/Cmd B)"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <nav
        className="flex flex-none border-b border-white/[0.06]"
        role="tablist"
        aria-label="Sidebar sections"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => openTab(t.id)}
            title={t.label}
            aria-label={t.label}
            className={cn(
              "relative flex min-h-12 flex-1 items-center justify-center py-3 transition-colors",
              tab === t.id ? "text-accentc" : "text-white/35 hover:text-white/75"
            )}
          >
            <t.icon className="h-4 w-4" />
            {tab === t.id ? (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-2 bottom-0 h-px bg-accentc"
              />
            ) : null}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: "var(--pad-rail)" }}>
        {/* ---------------- chats ---------------- */}
        {tab === "chats" ? (
          <div>
            <button
              onClick={p.onNew}
              className="primary-command mb-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] transition-all"
            >
              <Plus className="h-3.5 w-3.5" /> New chat
            </button>

            {p.conversations.length > 3 ? (
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search chats and messages"
                  aria-label="Search chats"
                  className="field pl-8"
                />
                {query ? (
                  <button
                    onClick={() => setQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            ) : null}

            {p.loading ? (
              <div className="space-y-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-9 animate-pulse rounded-lg bg-white/[0.04]"
                    style={{ opacity: 1 - i * 0.3 }}
                  />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <p className="px-1 py-3 text-xs text-white/30">
                {query ? `Nothing matches "${query}".` : "No saved chats yet."}
              </p>
            ) : (
              groups.map(([label, list]) => (
                <div key={label} className="mb-2">
                  <div className="px-1 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                    {label}
                  </div>
                  {list.map((c) => (
                    <div
                      key={c.id}
                      className={cn(
                        "group mb-1 flex items-center gap-1.5 rounded-lg border px-2 py-2 transition-colors",
                        c.id === p.currentId
                          ? "border-white/[0.1] bg-white/[0.05]"
                          : "border-transparent hover:bg-white/[0.03]"
                      )}
                    >
                      {renaming === c.id ? (
                        <input
                          autoFocus
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          onBlur={() => commitRename(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename(c.id);
                            if (e.key === "Escape") {
                              // preventDefault so the page-level handler does not
                              // also slam the whole drawer shut under us
                              e.preventDefault();
                              setRenaming(null);
                            }
                          }}
                          aria-label="Chat title"
                          className="min-w-0 flex-1 rounded bg-white/[0.06] px-1.5 py-0.5 text-[13px] outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => p.onSelect(c.id)}
                          className="min-w-0 flex-1 truncate text-left text-[13px] text-white/80"
                          title={c.title}
                        >
                          {c.pinned ? (
                            <Pin className="mr-1 inline h-3 w-3 -translate-y-px text-accentc" />
                          ) : null}
                          {c.title}
                        </button>
                      )}
                      <span className="flex-none font-mono text-[10px] text-white/25 group-hover:hidden [@media(hover:none)]:hidden">
                        {c.messages.length}
                      </span>
                      <div className="hidden flex-none items-center gap-1 group-hover:flex [@media(hover:none)]:flex">
                        <MiniButton
                          onClick={() => p.onTogglePin(c.id)}
                          label={c.pinned ? "Unpin" : "Pin"}
                        >
                          {c.pinned ? (
                            <PinOff className="h-3 w-3" />
                          ) : (
                            <Pin className="h-3 w-3" />
                          )}
                        </MiniButton>
                        <MiniButton
                          onClick={() => {
                            setDraftTitle(c.title);
                            setRenaming(c.id);
                          }}
                          label="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </MiniButton>
                        <MiniButton
                          onClick={() => p.onDelete(c.id)}
                          label="Delete chat"
                          danger
                        >
                          <Trash2 className="h-3 w-3" />
                        </MiniButton>
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : null}

        {/* ---------------- skills ---------------- */}
        {tab === "skills" ? (
          <div className="space-y-2">
            <p className="px-0.5 pb-1 text-[11px] leading-relaxed text-white/35">
              Always-on skills shape every reply. Command skills load a template
              into the composer - type <span className="font-mono">/</span> to
              reach them fast.
            </p>
            {SKILLS.filter(
              (s) => !s.pluginId || p.enabledPlugins.includes(s.pluginId)
            ).map((s) => {
              const on = p.enabledSkills.includes(s.id);
              return (
                <div
                  key={s.id}
                  className={cn("tile p-2.5 transition-colors", on && "border-accentc/25")}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => p.toggleSkill(s.id)}
                      role="switch"
                      aria-checked={on}
                      className={cn(
                        "mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded border transition-colors",
                        on
                          ? "border-accentc bg-accentc"
                          : "border-white/25 hover:border-white/50"
                      )}
                      aria-label={`${on ? "Disable" : "Enable"} ${s.name}`}
                    >
                      {on ? <Check className="h-3 w-3 text-pure" /> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <span className="text-[13px] font-medium text-white/85">
                          {s.name}
                        </span>
                        {s.command ? (
                          <span className="font-mono text-[10px] text-accentc">
                            {s.command}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-white/40">
                        {s.description}
                      </p>
                      {s.template ? (
                        <button
                          onClick={() => p.onUseSkill(s.id)}
                          className="mt-1.5 text-[11px] text-accentc hover:underline"
                        >
                          Load into composer
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ---------------- plugins ---------------- */}
        {tab === "plugins" ? (
          <div className="space-y-2">
            <p className="px-0.5 pb-1 text-[11px] leading-relaxed text-white/35">
              A plugin is a bundle of skills. Turning one off hides its skills
              and its slash commands everywhere.
            </p>
            {PLUGINS.map((pl) => {
              const on = p.enabledPlugins.includes(pl.id);
              return (
                <div
                  key={pl.id}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    on
                      ? "border-accentc/25 bg-accentc/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Blocks
                      className={cn(
                        "h-4 w-4 flex-none",
                        on ? "text-accentc" : "text-white/30"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">
                      {pl.name}
                    </span>
                    <Toggle
                      on={on}
                      onClick={() => p.togglePlugin(pl.id)}
                      label={`${on ? "Disable" : "Enable"} ${pl.name}`}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-white/40">
                    {pl.description}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10.5px] text-white/30">
                    <span>{pl.skills.length} skills</span>
                    <span>&middot;</span>
                    <span>{pl.author}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ---------------- mcp ---------------- */}
        {tab === "mcp" ? (
          <div className="space-y-2.5">
            <p className="px-0.5 text-[11px] leading-relaxed text-white/35">
              Connect a Streamable-HTTP MCP server and its tools become callable
              mid-conversation. Calls run server-side, never from the browser.
            </p>

            {p.mcpServers.map((s) => (
              <div key={s.id} className="tile p-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 flex-none rounded-full",
                      s.status === "ready"
                        ? "bg-emerald-400"
                        : s.status === "connecting"
                        ? "bg-amber-400"
                        : s.status === "error"
                        ? "bg-red-400"
                        : "bg-white/20"
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/85">
                    {s.name}
                  </span>
                  <MiniButton
                    onClick={() => p.refreshMcpServer(s.id)}
                    label={`Reconnect ${s.name}`}
                  >
                    {s.status === "connecting" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </MiniButton>
                  <Toggle
                    on={s.enabled}
                    onClick={() => p.toggleMcpServer(s.id)}
                    label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`}
                  />
                  <MiniButton
                    onClick={() => p.removeMcpServer(s.id)}
                    label={`Remove ${s.name}`}
                    danger
                  >
                    <X className="h-3.5 w-3.5" />
                  </MiniButton>
                </div>
                <div className="mt-1 truncate font-mono text-[10.5px] text-white/30">
                  {s.url}
                </div>
                {s.error ? (
                  <div className="mt-1 break-words text-[11px] text-red-300/80">
                    {s.error}
                  </div>
                ) : null}
                {s.tools?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {s.tools.slice(0, 12).map((t) => (
                      <span
                        key={t.name}
                        title={t.description}
                        className="rounded border border-white/[0.08] px-1.5 py-px font-mono text-[10px] text-white/50"
                      >
                        {t.name}
                      </span>
                    ))}
                    {s.tools.length > 12 ? (
                      <span className="text-[10px] text-white/30">
                        +{s.tools.length - 12}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}

            <div className="space-y-2 rounded-xl border border-dashed border-white/[0.12] p-2.5">
              <input
                value={mcpName}
                onChange={(e) => setMcpName(e.target.value)}
                placeholder="name (e.g. github)"
                aria-label="Server name"
                className="field"
              />
              <input
                value={mcpUrl}
                onChange={(e) => setMcpUrl(e.target.value)}
                placeholder="https://server/mcp"
                aria-label="Server URL"
                inputMode="url"
                className="field font-mono text-[11.5px]"
              />
              <button
                onClick={() => {
                  if (!mcpName.trim() || !mcpUrl.trim()) return;
                  p.addMcpServer(mcpName.trim(), mcpUrl.trim());
                  setMcpName("");
                  setMcpUrl("");
                }}
                disabled={!mcpName.trim() || !mcpUrl.trim()}
                className="w-full rounded-lg bg-white/[0.06] py-2 text-[12.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.11] disabled:opacity-40"
              >
                Add server
              </button>
            </div>
          </div>
        ) : null}

        {/* ---------------- settings ---------------- */}
        {tab === "settings" ? (
          <div className="space-y-4">
            <Section title="Provider">
              <div className="grid grid-cols-2 gap-1.5">
                {PROVIDER_ORDER.map((id) => {
                  const s = PROVIDERS[id];
                  const on = p.provider === id;
                  return (
                    <button
                      key={id}
                      onClick={() => p.setProvider(id)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-left transition-colors",
                        on
                          ? "border-accentc/40 bg-accentc/10"
                          : "border-white/[0.06] hover:border-white/[0.16]"
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <Cpu
                          className={cn(
                            "h-3 w-3 flex-none",
                            on ? "text-accentc" : "text-white/30"
                          )}
                        />
                        <span className="min-w-0 truncate text-[12px] font-medium text-white/85">
                          {s.label}
                        </span>
                        {p.serverKeys[id] ? (
                          <ShieldCheck
                            className="ml-auto h-3 w-3 flex-none text-emerald-400"
                            aria-label="Key set on the server"
                          />
                        ) : p.providerKeys[id] ? (
                          <span
                            className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-accentc"
                            title="Key saved in this browser"
                            aria-label="Key saved in this browser"
                          />
                        ) : s.needsKey ? (
                          <span
                            className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-amber-400/70"
                            title="No key yet"
                            aria-label="No key yet"
                          />
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
                {spec.blurb}
              </p>
            </Section>

            <Section title="Provider endpoint">
              <input
                value={p.baseUrl}
                onChange={(e) => p.setBaseUrl(e.target.value)}
                placeholder={spec.baseUrl || "https://api.example.com/v1"}
                aria-label={`${spec.label} endpoint`}
                inputMode="url"
                className="field font-mono text-[11.5px]"
              />
              <div className="mt-1.5 flex items-start justify-between gap-2">
                <p className="text-[10.5px] leading-relaxed text-white/30">
                  Saved separately for {spec.label}, along with its key and model.
                  Switching providers restores all three.
                </p>
                {spec.baseUrl && p.baseUrl !== spec.baseUrl ? (
                  <button
                    onClick={p.onResetEndpoint}
                    className="flex-none text-[10.5px] text-white/40 underline-offset-2 hover:text-white/75 hover:underline"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </Section>

            {/*
              Shown whenever the provider can use a key at all - not only when
              it demands one. OpenCode Zen answers its free models unauthenticated
              but needs a key for the paid ones, and keying this off needsKey
              alone hid the field exactly where it was still needed.
            */}
            {spec.needsKey || spec.freeTier || spec.envKey || p.provider === "custom" ? (
              <Section title="API key">
                {p.serverKeys[p.provider] ? (
                  <p className="mb-2 flex items-start gap-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] px-2.5 py-2 text-[11.5px] leading-relaxed text-emerald-300/90">
                    <ShieldCheck className="mt-px h-3.5 w-3.5 flex-none" />
                    <span>
                      The server already holds a key from{" "}
                      <span className="font-mono">{spec.envKey}</span>. Leave this
                      blank and it never reaches the browser at all.
                    </span>
                  </p>
                ) : null}
                <div className="flex gap-1.5">
                  <input
                    type={showKey ? "text" : "password"}
                    value={p.apiKey}
                    onChange={(e) => p.setApiKey(e.target.value)}
                    placeholder={spec.keyPlaceholder}
                    aria-label="API key"
                    autoComplete="off"
                    spellCheck={false}
                    className="field min-w-0 flex-1"
                  />
                  <button
                    onClick={() => setShowKey((v) => !v)}
                    className="flex-none rounded-lg border border-white/[0.08] px-2.5 text-white/45 transition-colors hover:text-white"
                    aria-label={showKey ? "Hide key" : "Show key"}
                  >
                    {showKey ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-relaxed text-white/30">
                  {spec.freeTier ? (
                    <>
                      Optional. The <span className="font-mono">-free</span> models
                      answer without a key; the rest need one.{" "}
                    </>
                  ) : null}
                  This key belongs to {spec.label} alone. Each provider keeps its
                  own, so switching never sends one provider&rsquo;s key to another.
                </p>
                <Check2
                  checked={p.rememberKey}
                  onChange={p.setRememberKey}
                  label="Remember keys on this device"
                />
                {p.rememberKey ? (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-300/70">
                    Stored in localStorage in plain text. Anything with access to
                    this browser profile can read it.
                  </p>
                ) : null}
              </Section>
            ) : null}

            <Section title="Model">
              {/*
                A <datalist> only previews as an OS-drawn dropdown that ignores
                the page's colours, and it cannot show a model's owner or
                context window. This is the same picker as the header.
              */}
              <Listbox
                className="w-full"
                buttonClassName="field font-mono"
                label="Model"
                value={p.model}
                options={p.modelOptions}
                onChange={p.setModel}
                placeholder="Load the model list"
                searchable
                footer={
                  p.hiddenModels ? (
                    <button
                      onClick={() =>
                        p.setPrefs({ ...p.prefs, showAllModels: !p.prefs.showAllModels })
                      }
                      className="w-full text-left text-[10.5px] text-white/40 hover:text-white/70"
                    >
                      {p.prefs.showAllModels
                        ? `Hide ${p.hiddenModels} non-chat endpoints`
                        : `Show ${p.hiddenModels} hidden non-chat endpoints`}
                    </button>
                  ) : null
                }
              />
              {p.provider === "custom" ? (
                <input
                  value={p.model}
                  onChange={(e) => p.setModel(e.target.value)}
                  aria-label="Model ID"
                  placeholder="or type a model id"
                  spellCheck={false}
                  className="field mt-1.5 font-mono text-[11.5px]"
                />
              ) : null}
              <button
                onClick={p.onLoadModels}
                disabled={p.loadingModels}
                className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.05] py-2 text-[12px] text-white/75 transition-colors hover:bg-white/[0.1] disabled:opacity-50"
              >
                {p.loadingModels ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                {p.models.length
                  ? `${p.models.length} chat models loaded`
                  : "Load model list"}
              </button>
              {p.connection ? (
                <p
                  className={cn(
                    "mt-1.5 break-words text-[11px] leading-relaxed",
                    p.connection.ok ? "text-emerald-300/80" : "text-red-300/80"
                  )}
                  role="status"
                >
                  {p.connection.message}
                </p>
              ) : null}
            </Section>

            <Section title="Appearance">
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: "light", icon: Sun, label: "Light" },
                    { id: "dark", icon: Moon, label: "Dark" },
                    { id: "system", icon: Monitor, label: "System" },
                  ] as const
                ).map((t) => {
                  const on = p.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => p.setTheme(t.id)}
                      aria-pressed={on}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg border py-2.5 transition-colors",
                        on
                          ? "border-accentc/40 bg-accentc/10 text-accentc"
                          : "border-white/[0.06] text-white/40 hover:border-white/[0.16] hover:text-white/75"
                      )}
                    >
                      <t.icon className="h-3.5 w-3.5" />
                      <span className="text-[11px]">{t.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3">
                <Label>Accent</Label>
                <div className="flex flex-wrap gap-1.5">
                  {ACCENT_LIST.map((a) => {
                    const on = p.prefs.accent === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => p.setPrefs({ ...p.prefs, accent: a.id })}
                        className={cn(
                          "h-7 w-7 rounded-full border-2 transition-transform hover:scale-110",
                          on ? "border-white/80" : "border-white/10"
                        )}
                        style={{
                          background: `linear-gradient(135deg, ${a.hex}, ${a.hex2})`,
                        }}
                        aria-label={a.label}
                        aria-pressed={on}
                        title={a.label}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="mt-3">
                <Label>Density</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      ["compact", "Compact"],
                      ["standard", "Standard"],
                      ["roomy", "Roomy"],
                    ] as [Density, string][]
                  ).map(([id, label]) => {
                    const on = p.prefs.density === id;
                    return (
                      <button
                        key={id}
                        onClick={() => p.setPrefs({ ...p.prefs, density: id })}
                        aria-pressed={on}
                        className={cn(
                          "rounded-lg border py-1.5 text-[11px] transition-colors",
                          on
                            ? "border-accentc/40 bg-accentc/10 text-accentc"
                            : "border-white/[0.06] text-white/40 hover:text-white/75"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Section>

            <Section title="Experience">
              <Row
                label="Auto-preview canvas"
                hint="Flip to Preview when a reply finishes"
                checked={p.prefs.autoPreview}
                onChange={(v) => p.setPrefs({ ...p.prefs, autoPreview: v })}
              />
              <Row
                label="Auto-name chats"
                hint="Ask the model for a title after the first reply"
                checked={p.prefs.autoTitle}
                onChange={(v) => p.setPrefs({ ...p.prefs, autoTitle: v })}
              />
              <Row
                label="Monospace interface"
                checked={p.prefs.mono}
                onChange={(v) => p.setPrefs({ ...p.prefs, mono: v })}
              />
              <Row
                label="Reduce motion"
                hint="Also honoured from your OS setting"
                checked={p.prefs.reducedMotion}
                onChange={(v) => p.setPrefs({ ...p.prefs, reducedMotion: v })}
              />

              <div className="mt-3 grid grid-cols-2 gap-1.5">
                <button
                  onClick={p.onExport}
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[12px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white/90"
                >
                  <Download className="h-3.5 w-3.5" /> Export
                </button>
                <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] py-2 text-[12px] text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white/90">
                  <Upload className="h-3.5 w-3.5" /> Import
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) p.onImport(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </Section>

            <Section title="Generation">
              <Slider
                label="Temperature"
                value={p.params.temperature}
                min={0}
                max={2}
                step={0.05}
                onChange={(v) => p.setParams({ ...p.params, temperature: v })}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Top P"
                value={p.params.topP}
                min={0.05}
                max={1}
                step={0.05}
                onChange={(v) => p.setParams({ ...p.params, topP: v })}
                fmt={(v) => v.toFixed(2)}
              />
              <Slider
                label="Output limit"
                value={p.params.maxTokens}
                min={0}
                max={65536}
                step={1024}
                onChange={(v) => p.setParams({ ...p.params, maxTokens: v })}
                fmt={(v) => (v === 0 ? "Provider max" : v.toLocaleString())}
              />
              <Check2
                checked={p.params.thinking}
                onChange={(v) => p.setParams({ ...p.params, thinking: v })}
                label="Extended thinking"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <Label>Seed</Label>
                  <input
                    value={p.params.seed}
                    onChange={(e) =>
                      p.setParams({ ...p.params, seed: e.target.value })
                    }
                    placeholder="none"
                    aria-label="Seed"
                    inputMode="numeric"
                    className="field font-mono text-[11.5px]"
                  />
                </div>
                <div>
                  <Label>History</Label>
                  <select
                    value={p.params.historyDepth}
                    onChange={(e) =>
                      p.setParams({
                        ...p.params,
                        historyDepth: Number(e.target.value),
                      })
                    }
                    aria-label="History depth"
                    className="field"
                  >
                    <option value={-1}>Full session</option>
                    <option value={12}>Last 12</option>
                    <option value={6}>Last 6</option>
                    <option value={0}>One-shot</option>
                  </select>
                </div>
              </div>
            </Section>

            <button
              onClick={p.onWipe}
              className="w-full rounded-lg border border-red-400/25 py-2.5 text-[12.5px] text-red-300/85 transition-colors hover:bg-red-400/10"
            >
              Erase all local data
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex-none border-t border-white/[0.06] px-4 py-2.5 text-[10.5px] text-white/30 safe-b">
        <span className="font-display tracking-wide">Crafted with Pi</span>
        <span className="mx-1.5 opacity-40">·</span>
        <span>Sana2 Advanced Assistant</span>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* small pieces                                                        */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/35">
        {title}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-white/35">
      {children}
    </div>
  );
}

function MiniButton({
  onClick,
  label,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded text-white/45 transition-colors sm:h-7 sm:w-7",
        danger ? "hover:text-red-400" : "hover:text-accentc"
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cn(
        "h-4 w-8 flex-none rounded-full p-0.5 transition-colors",
        on ? "bg-accentc" : "bg-white/15"
      )}
    >
      <span
        className={cn(
          "block h-3 w-3 rounded-full bg-pure transition-transform",
          on ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function Check2({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-white/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-accentc"
      />
      {label}
    </label>
  );
}

function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="text-[12px] text-white/70">{label}</div>
        {hint ? (
          <div className="mt-0.5 text-[10.5px] leading-relaxed text-white/30">
            {hint}
          </div>
        ) : null}
      </div>
      <Toggle on={checked} onClick={() => onChange(!checked)} label={label} />
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        <span className="font-mono text-[11px] text-accentc">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="w-full accent-accentc"
      />
    </div>
  );
}
