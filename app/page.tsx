"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  BookOpen,
  BookCheck,
  Bot,
  Boxes,
  Brain,
  CheckSquare,
  ClipboardList,
  Compass,
  FileText,
  FileWarning,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Menu,
  MessageCircle,
  MessageSquarePlus,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Palette,
  RotateCcw,
  ScanEye,
  Scissors,
  ShieldCheck,
  Siren,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trash2,
  Users,
  Wand2,
  Zap,
  Wrench,
} from "lucide-react";
import {
  AmbientGlow,
  AnimatedComposer,
  ChatHero,
  ThinkingPill,
  ActionButton,
  type CommandSuggestion,
} from "@/components/ui/animated-ai-chat";
import dynamic from "next/dynamic";
import type { Command } from "@/components/ui/command-palette";
import { ToastStack } from "@/components/ui/toast";
import { ChatMessage } from "@/components/chat-message";
import { Sidebar, RAIL_DEFAULT } from "@/components/sidebar";

import { PROVIDERS, PROVIDER_ORDER, MODEL_HINTS } from "@/lib/providers";
import { Listbox, type ListboxOption } from "@/components/ui/listbox";
import { PLUGINS, SKILLS, commandSkills, systemFragments } from "@/lib/registry";
import { extractArtifacts } from "@/lib/markdown";
import {
  cn,
  downloadBlob,
  estimateTokens,
  isMac,
  store,
  uid,
} from "@/lib/utils";
import {
  ACCENTS,
  applyAccent,
  applyTheme,
  readTheme,
  saveTheme,
  systemPrefersDark,
  type Theme,
} from "@/lib/theme";
import type {
  Artifact,
  Attachment,
  Conversation,
  GenParams,
  McpServer,
  Message,
  ModelInfo,
  Prefs,
  ProviderId,
  Toast,
  ToolTrace,
} from "@/lib/types";

/** Everything we know about one provider's catalogue, cached per provider. */
interface Catalogue {
  models: string[];
  detail: ModelInfo[];
  /** how many entries were filtered out as non-chat endpoints */
  hidden: number;
}

/*
  Neither of these is on screen at first paint - the canvas is closed on mobile
  and the palette needs a keystroke - and between them they carry the artifact
  renderer and the command index. Splitting them out keeps that weight off the
  initial bundle.
*/
const VisualPanel = dynamic(
  () => import("@/components/visual-panel").then((m) => m.VisualPanel),
  { ssr: false }
);
const CommandPalette = dynamic(
  () => import("@/components/ui/command-palette").then((m) => m.CommandPalette),
  { ssr: false }
);

const ICONS: Record<string, typeof Sparkles> = {
  ListChecks,
  Target,
  ShieldCheck,
  TrendingUp,
  Siren,
  BookOpen,
  CheckSquare,
  ScanEye,
  Compass,
  LayoutDashboard,
  Wrench,
  Scissors,
  Zap,
  MessageCircle,
  Users,
  FileWarning,
  BookCheck,
  Megaphone,
  Palette,
  Boxes,
  Bot,
  ClipboardList,
  FileText,
  Wand2,
  Brain,
};

const MAX_IMG = 180 * 1024;
const MAX_TXT = 400 * 1024;

const DEFAULT_PROVIDER_ENDPOINTS = Object.fromEntries(
  PROVIDER_ORDER.map((id) => [id, PROVIDERS[id].baseUrl])
) as Record<ProviderId, string>;

/*
  Keys and models are per provider, like endpoints already were. Sharing one
  key field across providers meant switching from NVIDIA to Zen carried the
  NVIDIA key with it and authentication failed for reasons the UI never
  explained.
*/
const DEFAULT_PROVIDER_KEYS = Object.fromEntries(
  PROVIDER_ORDER.map((id) => [id, ""])
) as Record<ProviderId, string>;

const DEFAULT_PROVIDER_MODELS = Object.fromEntries(
  PROVIDER_ORDER.map((id) => [id, PROVIDERS[id].defaultModel])
) as Record<ProviderId, string>;

const DEFAULT_PARAMS: GenParams = {
  temperature: 1,
  topP: 0.95,
  // 0 means "do not impose an app cap"; the selected provider/model decides.
  maxTokens: 0,
  seed: "",
  thinking: false,
  // -1 is genuinely unbounded history, not a large-number sentinel.
  historyDepth: -1,
};

const DEFAULT_PREFS: Prefs = {
  accent: "amber",
  autoPreview: true,
  reducedMotion: false,
  density: "standard",
  mono: false,
  autoTitle: true,
  panelWidth: 440,
  railWidth: RAIL_DEFAULT,
  railCollapsed: false,
  showAllModels: false,
};

/** Tailwind's lg breakpoint, in a hook. Drives drawer-vs-rail layout. */
function useIsDesktop() {
  // Lazy init with matchMedia - starting from `true` made phones render the
  // desktop layout (canvas open, rail instead of drawer) for the first paint.
  const [desktop, setDesktop] = useState(
    () =>
      typeof window === "undefined" ||
      window.matchMedia("(min-width: 1024px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desktop;
}

export default function Page() {
  /* ---------------- persisted state ---------------- */
  const [ready, setReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderId>("nvidia");
  const [providerModels, setProviderModels] = useState<Record<ProviderId, string>>(
    DEFAULT_PROVIDER_MODELS
  );
  const [providerEndpoints, setProviderEndpoints] = useState<
    Record<ProviderId, string>
  >(DEFAULT_PROVIDER_ENDPOINTS);
  const [providerKeys, setProviderKeys] = useState<Record<ProviderId, string>>(
    DEFAULT_PROVIDER_KEYS
  );
  const [rememberKey, setRememberKey] = useState(false);
  const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>(
    PLUGINS.filter((p) => p.enabled).map((p) => p.id)
  );
  const [enabledSkills, setEnabledSkills] = useState<string[]>([
    "ops-voice",
    "visual-out",
    "tool-use",
  ]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  /* ---------------- session state ---------------- */
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);
  const [catalogues, setCatalogues] = useState<Partial<Record<ProviderId, Catalogue>>>(
    {}
  );
  const [loadingModels, setLoadingModels] = useState(false);
  const [connections, setConnections] = useState<
    Partial<Record<ProviderId, { ok: boolean; message: string }>>
  >({});
  const [serverKeys, setServerKeys] = useState<Record<string, boolean>>({});
  const [panelOpen, setPanelOpen] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [atBottom, setAtBottom] = useState(true);
  const [theme, setThemeState] = useState<Theme>("dark");
  const [isDark, setIsDark] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* epoch for /api/models - a stale completion must not repopulate the model
     list after the user has already switched to another provider */
  const modelsReq = useRef(0);
  const desktop = useIsDesktop();
  const baseUrl = providerEndpoints[provider] ?? PROVIDERS[provider].baseUrl;
  const apiKey = providerKeys[provider] ?? "";
  const model = providerModels[provider] ?? PROVIDERS[provider].defaultModel;
  const catalogue = catalogues[provider];
  const models = catalogue?.models ?? [];
  const modelDetail = catalogue?.detail ?? [];
  const hiddenModels = catalogue?.hidden ?? 0;
  const connection = connections[provider] ?? null;

  const setApiKey = useCallback(
    (key: string) => setProviderKeys((c) => ({ ...c, [provider]: key })),
    [provider]
  );
  const setModel = useCallback(
    (id: string) => setProviderModels((c) => ({ ...c, [provider]: id })),
    [provider]
  );

  /* ---------------- composer drafts, per conversation ---------------- */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const setBaseUrl = useCallback(
    (url: string) =>
      setProviderEndpoints((current) => ({ ...current, [provider]: url })),
    [provider]
  );

  /*
    Switching is now just a pointer move: the endpoint, key, model, catalogue
    and connection status for each provider are all held separately, so coming
    back to one restores exactly what you left it set to.
  */
  const switchProvider = useCallback((id: ProviderId) => {
    modelsReq.current++; // invalidate any in-flight loadModels for the old provider
    setProvider(id);
  }, []);

  /* the mobile panel-close effect lives with the layout section below */

  /* ---------------- toasts ---------------- */
  const toastTimers = useRef<number[]>([]);
  useEffect(() => () => toastTimers.current.forEach(clearTimeout), []);

  const toast = useCallback(
    (kind: Toast["kind"], message: string, action?: Toast["action"]) => {
      const t: Toast = { id: uid("t"), kind, message, action };
      setToasts((prev) => [...prev.slice(-3), t]);
      // errors stay long enough to read a stack-trace-shaped message
      toastTimers.current.push(
        window.setTimeout(
          () => setToasts((prev) => prev.filter((x) => x.id !== t.id)),
          kind === "error" ? 9000 : 4000
        )
      );
    },
    []
  );

  /* ---------------- boot ---------------- */
  useEffect(() => {
    setConversations(store.get<Conversation[]>("chats", []));
    const cfg = store.get<any>("cfg", null);
    if (cfg) {
      const restoredProvider = (cfg.provider ?? "nvidia") as ProviderId;
      setProvider(restoredProvider);
      setProviderModels({
        ...DEFAULT_PROVIDER_MODELS,
        ...(cfg.providerModels || {}),
        // migrate the former single model field onto the provider that owned it
        ...(typeof cfg.model === "string" && cfg.model
          ? { [restoredProvider]: cfg.model }
          : {}),
      });
      setProviderEndpoints({
        ...DEFAULT_PROVIDER_ENDPOINTS,
        ...(cfg.providerEndpoints || {}),
        // Migrate the former single endpoint into the provider that owned it.
        ...(typeof cfg.baseUrl === "string"
          ? { [restoredProvider]: cfg.baseUrl }
          : {}),
      });
      const restoredParams = { ...DEFAULT_PARAMS, ...(cfg.params || {}) };
      // Migrate the old defaults so existing installations receive the new
      // provider-managed output and genuinely complete session history too.
      if (restoredParams.maxTokens === 16384) restoredParams.maxTokens = 0;
      if (restoredParams.historyDepth === 99) restoredParams.historyDepth = -1;
      setParams(restoredParams);
      setEnabledPlugins(
        cfg.enabledPlugins ?? PLUGINS.filter((p) => p.enabled).map((p) => p.id)
      );
      setEnabledSkills(
        cfg.enabledSkills ?? ["ops-voice", "visual-out", "tool-use"]
      );
      setRememberKey(!!cfg.rememberKey);
      if (cfg.rememberKey) {
        const saved = store.get<unknown>("keys", null);
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
          setProviderKeys({
            ...DEFAULT_PROVIDER_KEYS,
            ...(saved as Record<string, string>),
          });
        } else {
          // pre-migration installs stored one key for whichever provider was
          // selected at the time - move it there rather than dropping it
          const legacy = store.get<string>("key", "");
          if (legacy)
            setProviderKeys({ ...DEFAULT_PROVIDER_KEYS, [restoredProvider]: legacy });
        }
      }
    }
    setMcpServers(store.get<McpServer[]>("mcp", []));
    setDrafts(store.get<Record<string, string>>("drafts", {}));
    const pr = store.get<any>("prefs", null);
    if (pr) setPrefs({ ...DEFAULT_PREFS, ...pr });
    const t = readTheme();
    setThemeState(t);
    setIsDark(t === "dark" || (t === "system" && systemPrefersDark()));
    setReady(true);
  }, []);

  /* which providers have a key on the server - so Settings can say so */
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((j) => setServerKeys(j.serverKeys || {}))
      .catch(() => {
        /* health is advisory; the app works without it */
      });
  }, []);

  /*
    localStorage has a hard quota and a long transcript with inlined images
    reaches it. Failing silently used to mean every chat written after the
    limit was simply lost on reload - now it says so, once.
  */
  const quotaWarned = useRef(false);
  /*
    Serialising the whole transcript on every change was the single most
    expensive thing the app did while streaming: `conversations` is a new
    object on each flush, so a long chat with inlined images was being
    JSON.stringify-ed into localStorage several times a second, on the main
    thread. Trailing debounce, plus a synchronous flush on pagehide so nothing
    is lost when the tab closes.
  */
  const pendingChats = useRef<Conversation[] | null>(null);
  const writeChats = useCallback(() => {
    const value = pendingChats.current;
    if (!value) return;
    pendingChats.current = null;
    if (!store.trySet("chats", value) && !quotaWarned.current) {
      quotaWarned.current = true;
      toast(
        "error",
        "Out of browser storage - new chats will not survive a reload. Delete an old chat or export and wipe.",
        { label: "Export everything", run: () => exportAll() }
      );
    }
  }, [toast]);

  useEffect(() => {
    if (!ready) return;
    pendingChats.current = conversations;
    const t = setTimeout(writeChats, 600);
    return () => clearTimeout(t);
  }, [conversations, ready, writeChats]);

  useEffect(() => {
    const flush = () => writeChats();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flush();
    };
  }, [writeChats]);

  useEffect(() => {
    if (!ready) return;
    store.trySet("cfg", {
      provider,
      providerModels,
      providerEndpoints,
      // Retained for backward-compatible backups; new builds read the maps.
      model,
      baseUrl,
      params,
      enabledPlugins,
      enabledSkills,
      rememberKey,
    });
    // one entry per provider, and nothing at all when the box is unticked
    store.trySet("keys", rememberKey ? providerKeys : {});
    store.trySet("key", "");
  }, [
    ready,
    provider,
    model,
    providerModels,
    providerEndpoints,
    baseUrl,
    params,
    enabledPlugins,
    enabledSkills,
    rememberKey,
    providerKeys,
  ]);

  useEffect(() => {
    if (ready)
      store.trySet(
        "mcp",
        mcpServers.map((s) => ({ ...s, status: "idle" as const }))
      );
  }, [mcpServers, ready]);

  useEffect(() => {
    if (ready) store.trySet("prefs", prefs);
  }, [ready, prefs]);

  /* ---------------- theme + prefs -> document ---------------- */
  useEffect(() => {
    applyAccent(prefs.accent, isDark);
  }, [prefs.accent, isDark]);

  useEffect(() => {
    // mirrored onto :root so the pre-paint bootstrap can restore it on reload
    document.documentElement.style.setProperty("--rail-w", `${prefs.railWidth}px`);
  }, [prefs.railWidth]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", prefs.reducedMotion);
    root.classList.toggle("density-compact", prefs.density === "compact");
    root.classList.toggle("density-roomy", prefs.density === "roomy");
    root.classList.toggle("font-mono-ui", prefs.mono);
  }, [prefs.reducedMotion, prefs.density, prefs.mono]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    saveTheme(t);
    applyTheme(t);
    setIsDark(t === "dark" || (t === "system" && systemPrefersDark()));
  }, []);

  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setIsDark(mq.matches);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  /* ---------------- derived ---------------- */
  const conversation = useMemo(
    () => conversations.find((c) => c.id === currentId) || null,
    [conversations, currentId]
  );
  const messages = conversation?.messages ?? [];

  /*
    extractArtifacts scans a whole reply with several regexes. Re-running it
    over every message on every streamed frame was pure waste - only the last
    message is changing. Cached on (message id, exact text), so a settled turn
    is scanned once and never again.
  */
  const artifactCache = useRef(new Map<string, { text: string; out: Artifact[] }>());
  const artifacts: Artifact[] = useMemo(() => {
    const cache = artifactCache.current;
    const live = new Set<string>();
    const out: Artifact[] = [];
    for (const m of messages) {
      if (m.role !== "assistant" || !m.content) continue;
      live.add(m.id);
      const hit = cache.get(m.id);
      if (hit && hit.text === m.content) {
        out.push(...hit.out);
        continue;
      }
      const found = extractArtifacts(m.id, m.content);
      cache.set(m.id, { text: m.content, out: found });
      out.push(...found);
    }
    // drop entries for deleted or truncated-away messages
    for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
    return out;
  }, [messages]);

  const suggestions: CommandSuggestion[] = useMemo(
    () =>
      commandSkills(enabledPlugins).map((s) => {
        const Icon = ICONS[s.icon] || Sparkles;
        return {
          icon: <Icon className="h-4 w-4" />,
          label: s.name,
          description: s.description,
          prefix: s.command as string,
        };
      }),
    [enabledPlugins]
  );

  const systemPrompt = useMemo(
    () => systemFragments(enabledPlugins, enabledSkills).join("\n\n"),
    [enabledPlugins, enabledSkills]
  );

  const contextTokens = useMemo(
    () =>
      messages.reduce((n, m) => n + estimateTokens(m.content), 0) +
      estimateTokens(systemPrompt),
    [messages, systemPrompt]
  );

  /* ---------------- scrolling ---------------- */
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  /*
    Only auto-scroll when the reader is already at the bottom. Yanking the view
    down while someone is reading back through a long reply is the single most
    irritating thing a streaming chat can do.
  */
  useEffect(() => {
    // An oversized empty-state hero is scrollable on small phones. Treating it
    // like a transcript and jumping to its bottom hid the headline on entry.
    if (atBottom && messages.length > 0) scrollToBottom(false);
  }, [messages.length, busy, atBottom, scrollToBottom]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [currentId]);

  /*
    The pill runs its own clock from this timestamp. Ticking a counter in the
    page re-rendered the whole transcript four times a second while generating.
  */
  useEffect(() => {
    setStartedAt(busy ? Date.now() : undefined);
  }, [busy]);

  /* ---------------- conversation helpers ---------------- */
  const patch = useCallback(
    (id: string, fn: (c: Conversation) => Conversation) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? fn(c) : c)));
    },
    []
  );

  const newChat = useCallback(() => {
    const c: Conversation = {
      id: uid("c"),
      title: "New chat",
      ts: Date.now(),
      messages: [],
    };
    setConversations((prev) => [c, ...prev]);
    setCurrentId(c.id);
    setInput(""); // a new chat starts with an empty composer, drafts aside
    setNavOpen(false);
    return c;
  }, []);

  /* ---------------- attachments ---------------- */
  const onAttach = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach((f) => {
        const reader = new FileReader();
        if (f.type.startsWith("image/")) {
          if (f.size > MAX_IMG) {
            toast(
              "error",
              `${f.name} is ${Math.round(f.size / 1024)}kb. Images are inlined into the request, so they have to stay under 180kb.`
            );
            return;
          }
          reader.onload = () =>
            setAttachments((a) => [
              ...a,
              {
                id: uid("att"),
                kind: "image",
                name: f.name,
                data: String(reader.result),
              },
            ]);
          reader.readAsDataURL(f);
        } else {
          if (f.size > MAX_TXT) {
            toast(
              "error",
              `${f.name} is over 400kb - trim it, or paste just the relevant part.`
            );
            return;
          }
          reader.onload = () =>
            setAttachments((a) => [
              ...a,
              {
                id: uid("att"),
                kind: "text",
                name: f.name,
                text: String(reader.result),
              },
            ]);
          reader.readAsText(f);
        }
      });
    },
    [toast]
  );

  /* ---------------- provider calls ---------------- */
  const loadModels = useCallback(async () => {
    const req = ++modelsReq.current;
    const forProvider = provider;
    setLoadingModels(true);
    setConnections((c) => ({ ...c, [forProvider]: undefined }));
    try {
      const r = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: forProvider, baseUrl, apiKey }),
      });
      const j = await r.json();
      // the user switched providers while this was in flight - drop the result
      if (req !== modelsReq.current) return;
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      const usable: string[] = j.models || [];
      setCatalogues((c) => ({
        ...c,
        [forProvider]: {
          models: usable,
          detail: j.detail || [],
          hidden: j.hidden || 0,
        },
      }));
      /*
        Count what you can actually pick, and say plainly what was left out -
        the raw catalogue is padded with embedding, reranking, OCR and speech
        endpoints that 404 the moment you send them a message.
      */
      const msg =
        `Connected - ${usable.length} chat models reachable` +
        (j.hidden ? `, ${j.hidden} non-chat endpoints hidden` : "") +
        (j.ms ? ` (${j.ms}ms)` : "") +
        ".";
      setConnections((c) => ({ ...c, [forProvider]: { ok: true, message: msg } }));
      // if the selected model is not in the catalogue, move to the best one
      // that is, rather than leaving a dead id in the box
      if (usable.length && !usable.includes(providerModels[forProvider] ?? "")) {
        setProviderModels((m) => ({ ...m, [forProvider]: usable[0] }));
      }
      toast("success", msg);
    } catch (e: any) {
      if (req !== modelsReq.current) return;
      const msg = String(e?.message || e);
      setConnections((c) => ({ ...c, [forProvider]: { ok: false, message: msg } }));
      toast("error", msg);
    } finally {
      if (req === modelsReq.current) setLoadingModels(false);
    }
  }, [provider, baseUrl, apiKey, providerModels, toast]);

  const refreshMcpServer = useCallback(
    async (id: string) => {
      const server = mcpServers.find((s) => s.id === id);
      if (!server) return;
      setMcpServers((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, status: "connecting", error: undefined } : s
        )
      );
      try {
        const r = await fetch("/api/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "list",
            url: server.url,
            headers: server.headers,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setMcpServers((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, status: "ready", tools: j.tools || [] } : s
          )
        );
        toast("success", `${server.name}: ${j.tools?.length ?? 0} tools ready.`);
      } catch (e: any) {
        const msg = String(e?.message || e);
        setMcpServers((prev) =>
          prev.map((s) => (s.id === id ? { ...s, status: "error", error: msg } : s))
        );
        toast("error", `${server.name} failed: ${msg}`);
      }
    },
    [mcpServers, toast]
  );

  /* ---------------- auto-title ---------------- */
  const nameChat = useCallback(
    async (conv: Conversation, user: string, assistant: string) => {
      if (!prefs.autoTitle) return;
      try {
        const r = await fetch("/api/title", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            baseUrl,
            apiKey,
            model,
            user,
            assistant,
          }),
        });
        const j = await r.json();
        if (j.title) patch(conv.id, (c) => ({ ...c, title: j.title, titled: true }));
      } catch {
        /* the truncated first message is already a serviceable title */
      }
    },
    [prefs.autoTitle, provider, baseUrl, apiKey, model, patch]
  );

  /* ---------------- send ---------------- */
  const run = useCallback(
    async (conv: Conversation, history: Message[]) => {
      const assistantId = uid("m");
      const assistant: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        reasoning: "",
        ts: Date.now(),
        model,
        provider,
        toolCalls: [],
      };
      patch(conv.id, (c) => ({ ...c, messages: [...c.messages, assistant] }));

      const depth = params.historyDepth;
      const trimmed =
        depth < 0 ? history : depth === 0 ? history.slice(-1) : history.slice(-depth);

      // Errored/empty turns stay visible in the transcript but are never sent
      // back: an empty assistant message makes several OpenAI-compatible
      // providers 400 the whole conversation, turning one transient error
      // permanent.
      const sendable = trimmed.filter(
        (m) => m.content || (m.role === "user" && m.attachments?.length)
      );
      const payload = sendable.map((m) => {
        if (m.role !== "user") return { role: m.role, content: m.content };
        let text = m.content;
        const images = (m.attachments || []).filter((a) => a.kind === "image");
        (m.attachments || [])
          .filter((a) => a.kind === "text")
          .forEach((a) => {
            text += `\n\n--- ${a.name} ---\n${a.text}`;
          });
        if (!images.length) return { role: "user", content: text };
        return {
          role: "user",
          content: [
            { type: "text", text },
            ...images.map((a) => ({
              type: "image_url",
              image_url: { url: a.data },
            })),
          ],
        };
      });

      const started = performance.now();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);
      setPhase(null);

      let content = "";
      let reasoning = "";
      let notice = "";
      let tokens: number | undefined;
      let finish: string | undefined;
      const tools: ToolTrace[] = [];

      const flush = () =>
        patch(conv.id, (c) => ({
          ...c,
          messages: c.messages.map((m) =>
            m.id === assistantId
              ? { ...m, content, reasoning, notice, toolCalls: [...tools] }
              : m
          ),
        }));

      try {
        const r = await fetch("/api/chat", {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            baseUrl,
            apiKey,
            model,
            system: systemPrompt,
            messages: payload,
            params,
            mcpServers: mcpServers.filter((s) => s.enabled && s.tools?.length),
          }),
        });
        // Plain-text 400s (bad request, unknown provider) carry no data:
        // frames at all - without this they used to vanish with no reply, no
        // toast and no error.
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          throw new Error(text || `HTTP ${r.status}`);
        }
        if (!r.body) throw new Error("no response stream");

        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        /*
          Flushing every other network frame meant a fast provider re-rendered
          the transcript dozens of times a second. 60ms is still well inside
          "instant" for a reader and cuts the React work by an order of
          magnitude on a fast stream.
        */
        let lastFlush = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const l = line.trim();
            if (!l.startsWith("data:")) continue;
            try {
              const j = JSON.parse(l.slice(5).trim());
              if (j.type === "delta") content += j.text;
              else if (j.type === "reasoning") reasoning += j.text;
              else if (j.type === "tool") tools.push(j as ToolTrace);
              else if (j.type === "status") setPhase(j.phase);
              else if (j.type === "notice") notice = j.message;
              else if (j.type === "done") {
                tokens = j.usage?.completion_tokens;
                finish = j.finish;
              } else if (j.type === "error") {
                patch(conv.id, (c) => ({
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantId ? { ...m, error: j.message } : m
                  ),
                }));
                toast("error", j.message);
              }
            } catch {
              /* skip malformed frame */
            }
          }
          const now = performance.now();
          if (now - lastFlush >= 60) {
            lastFlush = now;
            flush();
          }
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          const msg = String(e?.message || e);
          patch(conv.id, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === assistantId ? { ...m, error: msg } : m
            ),
          }));
          toast("error", msg);
        }
      } finally {
        const ms = performance.now() - started;
        patch(conv.id, (c) => ({
          ...c,
          ts: Date.now(),
          messages: c.messages
            .map((m) =>
              m.id === assistantId
                ? { ...m, content, reasoning, notice, tokens, finish, toolCalls: tools, ms }
                : m
            )
            .filter((m) => m.content || m.error || m.role === "user"),
        }));
        setBusy(false);
        setPhase(null);
        abortRef.current = null;

        // name the chat once, after its first real exchange
        if (!conv.titled && content) {
          const firstUser = history.find((m) => m.role === "user")?.content || "";
          if (firstUser) void nameChat(conv, firstUser, content);
        }
      }
    },
    [
      model,
      provider,
      baseUrl,
      apiKey,
      params,
      systemPrompt,
      mcpServers,
      patch,
      toast,
      nameChat,
    ]
  );

  const send = useCallback(() => {
    if (busy) return;
    const text = input.trim();
    if (!text && !attachments.length) return;

    let conv = conversation;
    if (!conv) conv = newChat();

    const userMessage: Message = {
      id: uid("m"),
      role: "user",
      content: text,
      ts: Date.now(),
      attachments: attachments.length ? attachments : undefined,
    };
    const history = [...(conv.messages || []), userMessage];

    patch(conv.id, (c) => ({
      ...c,
      title:
        c.title === "New chat" && text
          ? text.slice(0, 46) + (text.length > 46 ? "..." : "")
          : c.title,
      messages: history,
    }));

    setInput("");
    setAttachments([]);
    setAtBottom(true);
    void run({ ...conv, messages: history }, history);
  }, [busy, input, attachments, conversation, newChat, patch, run]);

  /*
    These are handed straight to a memoised ChatMessage, so their identity has
    to survive a re-render or the memo never holds. Reading the moving parts
    out of a ref keeps the callbacks themselves constant for the life of the
    page, while still acting on current state.
  */
  const live = useRef({ conversation, busy, patch, run });
  live.current = { conversation, busy, patch, run };

  const retry = useCallback((index: number) => {
    const { conversation, busy, patch, run } = live.current;
    if (!conversation || busy) return;
    const history = conversation.messages.slice(0, index);
    patch(conversation.id, (c) => ({ ...c, messages: history }));
    void run({ ...conversation, messages: history }, history);
  }, []);

  const edit = useCallback((index: number) => {
    // Guard with retry/branch: truncating `messages` mid-stream deletes the
    // in-flight assistant placeholder, so the reply streams into the void.
    const { conversation, busy, patch } = live.current;
    if (!conversation || busy) return;
    const m = conversation.messages[index];
    setInput(m.content);
    setAttachments(m.attachments || []);
    patch(conversation.id, (c) => ({
      ...c,
      messages: c.messages.slice(0, index),
    }));
  }, []);

  /** Copies the conversation up to this point into a new chat, leaving the
   *  original intact - so you can try a different direction without losing the
   *  one you already have. */
  const branch = useCallback(
    (index: number) => {
      const { conversation } = live.current;
      if (!conversation) return;
      const c: Conversation = {
        id: uid("c"),
        title: `${conversation.title} (branch)`,
        ts: Date.now(),
        titled: true,
        messages: conversation.messages.slice(0, index + 1),
      };
      setConversations((prev) => [c, ...prev]);
      setCurrentId(c.id);
      toast("info", "Branched into a new chat. The original is untouched.");
    },
    [toast]
  );

  /** ArrowUp in an empty composer pulls back the last thing you sent. */
  const recall = useCallback(() => {
    const last = [...messages].reverse().find((m) => m.role === "user");
    if (last) setInput(last.content);
  }, [messages]);

  const useSkill = useCallback((id: string) => {
    const skill = SKILLS.find((s) => s.id === id);
    if (skill?.template) setInput(skill.template);
    setNavOpen(false);
  }, []);

  const onSelectCommand = useCallback((prefix: string) => {
    const skill = SKILLS.find((s) => s.command === prefix);
    setInput(skill?.template ?? `${prefix} `);
  }, []);

  /* ---------------- import / export ---------------- */
  const exportAll = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      cfg: store.get("cfg", {}),
      prefs: store.get("prefs", {}),
      mcp: store.get("mcp", []),
      chats: store.get("chats", []),
    };
    downloadBlob(
      JSON.stringify(data, null, 2),
      `sana2-advanced-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`,
      "application/json"
    );
    toast("success", "Exported chats, settings and MCP servers. No API key is included.");
  }, [toast]);

  const importAll = useCallback(
    async (file: File) => {
      try {
        const data = JSON.parse(await file.text());
        if (!data || typeof data !== "object") throw new Error("not a backup file");
        let added = 0;
        if (Array.isArray(data.chats)) {
          // merge rather than replace - an import should never eat existing
          // work. Only structurally sound conversations come in: one record
          // missing a string title or with non-string message bodies would
          // otherwise crash the sidebar's search/render paths.
          const have = new Set(conversations.map((c) => c.id));
          const add = (data.chats as any[])
            .filter(
              (c) =>
                c &&
                typeof c.id === "string" &&
                typeof c.title === "string" &&
                Array.isArray(c.messages) &&
                !have.has(c.id)
            )
            .map((c) => ({
              ...c,
              messages: c.messages.filter(
                (m: any) =>
                  m &&
                  (m.role === "user" || m.role === "assistant" || m.role === "system") &&
                  typeof m.content === "string"
              ),
            }));
          added = add.length;
          if (add.length) setConversations((prev) => [...add, ...prev]);
        }
        if (data.prefs) setPrefs({ ...DEFAULT_PREFS, ...data.prefs });
        if (data.cfg) {
          const c = data.cfg;
          const importedProvider = (c.provider || provider) as ProviderId;
          if (c.provider) setProvider(importedProvider);
          setProviderModels((current) => ({
            ...current,
            ...(c.providerModels || {}),
            ...(typeof c.model === "string" && c.model
              ? { [importedProvider]: c.model }
              : {}),
          }));
          setProviderEndpoints((current) => ({
            ...current,
            ...(c.providerEndpoints || {}),
            ...(typeof c.baseUrl === "string"
              ? { [importedProvider]: c.baseUrl }
              : {}),
          }));
          if (c.params) setParams({ ...DEFAULT_PARAMS, ...c.params });
          if (c.enabledPlugins) setEnabledPlugins(c.enabledPlugins);
          if (c.enabledSkills) setEnabledSkills(c.enabledSkills);
        }
        if (Array.isArray(data.mcp)) setMcpServers(data.mcp);
        toast("success", `Imported ${added} chats and your settings.`);
      } catch (e: any) {
        toast("error", `Could not read that file: ${String(e?.message || e)}`);
      }
    },
    [provider, conversations, toast]
  );

  /* ---------------- layout ---------------- */
  /*
    One shortcut, two meanings, because the rail and the drawer are the same
    affordance at different sizes: below lg it opens the overlay drawer, above
    lg it collapses the rail to its icon strip.
  */
  const toggleRail = useCallback(() => {
    if (desktop) setPrefs((p) => ({ ...p, railCollapsed: !p.railCollapsed }));
    else setNavOpen((v) => !v);
  }, [desktop]);

  /*
    Below lg the canvas is a full-screen sheet, so "open by default" - which is
    right on a wide screen - would land a phone user on an empty canvas with
    the conversation hidden behind it. Close it whenever we are not on a wide
    viewport; the Canvas button (with its artifact count) reopens it.
  */
  useEffect(() => {
    if (!desktop) setPanelOpen(false);
  }, [desktop]);

  /** Deletes a chat with an undo path. Deleting the conversation that is
   *  currently streaming also aborts the request, so tokens do not stream
   *  into the void. */
  const deleteChat = useCallback(
    (id: string) => {
      const index = conversations.findIndex((c) => c.id === id);
      const target = conversations[index];
      if (!target) return;
      if (busy && id === currentId) abortRef.current?.abort();
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentId === id) setCurrentId(null);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast("info", `Deleted "${target.title}".`, {
        label: "Undo",
        run: () => {
          setConversations((prev) => {
            if (prev.some((c) => c.id === id)) return prev;
            const next = [...prev];
            next.splice(Math.min(index, next.length), 0, target);
            return next;
          });
        },
      });
    },
    [conversations, busy, currentId, toast]
  );

  /** One readable Markdown file per chat - the Everything export is JSON and
   *  meant for restore, not for reading. */
  const exportChat = useCallback(() => {
    if (!conversation) return;
    const lines: string[] = [`# ${conversation.title}`, ""];
    conversation.messages.forEach((m) => {
      const who = m.role === "user" ? "You" : m.model || "Assistant";
      const when = new Date(m.ts || conversation.ts).toLocaleString();
      lines.push(`## ${who} — ${when}`, "");
      if (m.error) lines.push(`> ⚠ ${m.error}`, "");
      if (m.content) lines.push(m.content, "");
    });
    downloadBlob(
      lines.join("\n"),
      `${(conversation.title || "chat").replace(/[^\w-]+/g, "-").slice(0, 48)}.md`,
      "text/markdown"
    );
    toast("success", "Chat exported as Markdown.");
  }, [conversation, toast]);

  /* ---------------- drafts ---------------- */
  // A half-typed message survives switching chats and reloading; sending or
  // switching to an empty box clears it again.
  useEffect(() => {
    if (!ready || !currentId) return;
    setDrafts((prev) => {
      const has = Object.prototype.hasOwnProperty.call(prev, currentId);
      const want = input.trim() ? input : undefined;
      if (want === undefined && !has) return prev;
      if (want !== undefined && prev[currentId] === want) return prev;
      const next = { ...prev };
      if (want === undefined) delete next[currentId];
      else next[currentId] = want;
      return next;
    });
  }, [input, currentId, ready]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => store.trySet("drafts", drafts), 600);
    return () => clearTimeout(t);
  }, [ready, drafts]);

  const openChat = useCallback(
    (id: string) => {
      setCurrentId(id);
      setInput(drafts[id] || "");
      setNavOpen(false);
      setAtBottom(true);
    },
    [drafts]
  );

  /* ---------------- keyboard ---------------- */
  const mod = isMac() ? "⌘" : "Ctrl";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Nested UIs (palette, slash menu, rename box, expanded canvas) handle
      // their own Escape and preventDefault it - falling through here would
      // also abort an in-flight generation or slam the drawer shut.
      if (e.defaultPrevented) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (meta && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleRail();
      } else if (meta && e.key === "\\") {
        e.preventDefault();
        setPanelOpen((v) => !v);
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        newChat();
      } else if (e.key === "Escape") {
        if (busy) abortRef.current?.abort();
        else setNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, newChat, toggleRail]);

  /* ---------------- palette commands ---------------- */
  const paletteCommands: Command[] = useMemo(() => {
    /*
      This list embeds up to 25 conversations' full text as search keywords.
      Building it on every render meant doing that work on every streamed
      frame, for a panel that is almost always closed.
    */
    if (!paletteOpen) return [];
    const cmds: Command[] = [
      {
        id: "new",
        group: "Actions",
        label: "New chat",
        icon: <MessageSquarePlus className="h-4 w-4" />,
        keys: `${mod}⇧O`,
        run: newChat,
      },
      {
        id: "canvas",
        group: "Actions",
        label: panelOpen ? "Hide canvas" : "Show canvas",
        icon: <PanelRight className="h-4 w-4" />,
        keys: `${mod}\\`,
        run: () => setPanelOpen((v) => !v),
      },
      {
        id: "rail",
        group: "Actions",
        label: prefs.railCollapsed ? "Expand sidebar" : "Collapse sidebar",
        icon: <PanelLeft className="h-4 w-4" />,
        keys: `${mod}B`,
        run: toggleRail,
      },
      {
        id: "rail-reset",
        group: "Actions",
        label: "Reset sidebar width",
        hint: `${RAIL_DEFAULT}px`,
        icon: <PanelLeft className="h-4 w-4" />,
        run: () => setPrefs((p) => ({ ...p, railWidth: RAIL_DEFAULT })),
      },
      {
        id: "export",
        group: "Actions",
        label: "Export everything",
        hint: "chats, settings, MCP",
        icon: <FileText className="h-4 w-4" />,
        run: exportAll,
      },
      ...(conversation
        ? [
            {
              id: "export-chat",
              group: "Chats",
              label: "Export this chat as Markdown",
              hint: `${conversation.messages.length} messages`,
              icon: <FileText className="h-4 w-4" />,
              run: exportChat,
            },
          ]
        : []),
      ...(busy || !conversation || conversation.messages.at(-1)?.role !== "assistant"
        ? []
        : [
            {
              id: "regen",
              group: "Actions",
              label: "Regenerate last reply",
              icon: <RotateCcw className="h-4 w-4" />,
              run: () => retry(conversation.messages.length - 1),
            },
          ]),
    ];

    (["light", "dark", "system"] as Theme[]).forEach((t) =>
      cmds.push({
        id: `theme-${t}`,
        group: "Appearance",
        label: `Theme: ${t}`,
        icon:
          t === "light" ? (
            <Sun className="h-4 w-4" />
          ) : t === "dark" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Monitor className="h-4 w-4" />
          ),
        run: () => setTheme(t),
      })
    );

    Object.values(ACCENTS).forEach((a) =>
      cmds.push({
        id: `accent-${a.id}`,
        group: "Appearance",
        label: `Accent: ${a.label}`,
        icon: (
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: `linear-gradient(135deg, ${a.hex}, ${a.hex2})` }}
          />
        ),
        run: () => setPrefs((p) => ({ ...p, accent: a.id })),
      })
    );

    commandSkills(enabledPlugins).forEach((s) => {
      const Icon = ICONS[s.icon] || Sparkles;
      cmds.push({
        id: `skill-${s.id}`,
        group: "Skills",
        label: s.name,
        hint: s.command,
        icon: <Icon className="h-4 w-4" />,
        run: () => useSkill(s.id),
      });
    });

    conversations.slice(0, 25).forEach((c) =>
      cmds.push({
        id: `chat-${c.id}`,
        group: "Chats",
        label: c.title,
        hint: `${c.messages.length} messages`,
        // searchable but never shown - "find the chat where I pasted that
        // stack trace" from the palette, like the sidebar search already does
        keywords: c.messages
          .map((m) => m.content)
          .join(" ")
          .slice(0, 4000),
        icon: <MessageCircle className="h-4 w-4" />,
        run: () => openChat(c.id),
      })
    );

    if (conversation)
      cmds.push({
        id: "delete-current",
        group: "Chats",
        label: "Delete this chat",
        icon: <Trash2 className="h-4 w-4" />,
        run: () => deleteChat(conversation.id),
      });

    return cmds;
  }, [
    paletteOpen,
    mod,
    newChat,
    panelOpen,
    exportAll,
    exportChat,
    deleteChat,
    openChat,
    busy,
    retry,
    toggleRail,
    prefs.railCollapsed,
    setTheme,
    enabledPlugins,
    useSkill,
    conversations,
    conversation,
  ]);

  /* ---------------- pickers ---------------- */
  const providerOptions: ListboxOption[] = useMemo(
    () =>
      PROVIDER_ORDER.map((id) => ({
        value: id,
        label: PROVIDERS[id].label,
        hint: PROVIDERS[id].blurb,
        meta: serverKeys[id]
          ? "server key"
          : providerKeys[id]
            ? "key set"
            : PROVIDERS[id].needsKey
              ? "needs key"
              : undefined,
      })),
    [serverKeys, providerKeys]
  );

  /*
    Built from the live catalogue when there is one, falling back to the hand
    written hints. Non-chat endpoints are hidden unless you ask for them, and
    the currently selected id is always present even if nothing lists it - a
    picker that silently shows a different model than the one you are about to
    send to is worse than an unfamiliar entry.
  */
  const modelOptions: ListboxOption[] = useMemo(() => {
    const out: ListboxOption[] = [];
    const seen = new Set<string>();
    const add = (o: ListboxOption) => {
      if (seen.has(o.value)) return;
      seen.add(o.value);
      out.push(o);
    };

    if (modelDetail.length) {
      for (const m of modelDetail) {
        if (!m.chat && !prefs.showAllModels) continue;
        add({
          value: m.id,
          label: m.id,
          hint: m.owned || undefined,
          meta: m.context ? `${Math.round(m.context / 1000)}k` : undefined,
          warn: m.chat ? undefined : "not a chat endpoint - it will not answer",
          group: m.chat ? "Chat models" : "Other endpoints",
        });
      }
    } else {
      for (const id of models.length ? models : MODEL_HINTS[provider] || [])
        add({ value: id, label: id });
    }

    if (model && !seen.has(model))
      add({
        value: model,
        label: model,
        hint: "set by hand - not in the loaded catalogue",
        group: modelDetail.length ? "Chat models" : undefined,
      });
    return out;
  }, [modelDetail, models, model, provider, prefs.showAllModels]);

  /* ---------------- render ---------------- */
  const providerSpec = PROVIDERS[provider];
  /*
    Above lg the rail is always mounted - collapsing swaps it for the icon
    strip rather than unmounting, so Sidebar keeps its tab and search state.
    Below lg it is an overlay drawer that really does unmount.
  */
  const showSidebar = desktop || navOpen;

  return (
    <div className="app-shell relative flex h-[100dvh] w-screen overflow-hidden text-white">
      <a className="skip-link" href="#main-content">
        Skip to conversation
      </a>
      <div className="pi-aurora" aria-hidden />
      <AmbientGlow />

      {/* ---- sidebar: a rail on desktop, a drawer below lg ---- */}
      <AnimatePresence>
        {!desktop && navOpen ? (
          <motion.div
            key="scrim"
            className="scrim fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setNavOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showSidebar ? (
          <motion.div
            key="nav"
            initial={desktop ? false : { x: "-100%" }}
            animate={{ x: 0 }}
            exit={desktop ? undefined : { x: "-100%" }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "h-full",
              desktop
                ? // z-30 keeps the resize handle above the transcript but below
                  // the canvas overlay and the palette
                  "relative z-30 flex-none"
                : "fixed left-0 top-0 z-50 w-[85vw] max-w-[320px] shadow-lift"
            )}
          >
            <Sidebar
              conversations={conversations}
              currentId={currentId}
              loading={!ready}
              onSelect={openChat}
              onDelete={deleteChat}
              onRename={(id, title) => patch(id, (c) => ({ ...c, title, titled: true }))}
              onTogglePin={(id) => patch(id, (c) => ({ ...c, pinned: !c.pinned }))}
              onNew={() => newChat()}
              provider={provider}
              setProvider={switchProvider}
              model={model}
              setModel={setModel}
              baseUrl={baseUrl}
              setBaseUrl={setBaseUrl}
              apiKey={apiKey}
              setApiKey={setApiKey}
              rememberKey={rememberKey}
              setRememberKey={setRememberKey}
              models={models}
              modelOptions={modelOptions}
              hiddenModels={hiddenModels}
              loadingModels={loadingModels}
              onLoadModels={loadModels}
              connection={connection}
              serverKeys={serverKeys}
              providerKeys={providerKeys}
              onResetEndpoint={() =>
                setProviderEndpoints((c) => ({
                  ...c,
                  [provider]: PROVIDERS[provider].baseUrl,
                }))
              }
              params={params}
              setParams={setParams}
              enabledPlugins={enabledPlugins}
              togglePlugin={(id) =>
                setEnabledPlugins((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              enabledSkills={enabledSkills}
              toggleSkill={(id) =>
                setEnabledSkills((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              onUseSkill={useSkill}
              mcpServers={mcpServers}
              addMcpServer={(name, url) => {
                const s: McpServer = {
                  id: uid("mcp"),
                  name,
                  url,
                  enabled: true,
                  status: "idle",
                };
                setMcpServers((prev) => [...prev, s]);
                setTimeout(() => void refreshMcpServer(s.id), 50);
              }}
              removeMcpServer={(id) =>
                setMcpServers((prev) => prev.filter((s) => s.id !== id))
              }
              toggleMcpServer={(id) =>
                setMcpServers((prev) =>
                  prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
                )
              }
              refreshMcpServer={refreshMcpServer}
              theme={theme}
              setTheme={setTheme}
              onWipe={() => {
                if (!confirm("Erase every saved chat, key and setting on this device?"))
                  return;
                // Stop any in-flight work first - it would keep streaming into
                // state we are about to throw away.
                abortRef.current?.abort();
                store.clear();
                // Reset every slice of persisted state too, otherwise the
                // persistence effects instantly re-write the old values back
                // into storage and the "erase" is a lie.
                setConversations([]);
                setCurrentId(null);
                setMcpServers([]);
                setProviderKeys(DEFAULT_PROVIDER_KEYS);
                setRememberKey(false);
                setProvider("nvidia");
                setProviderModels(DEFAULT_PROVIDER_MODELS);
                setProviderEndpoints(DEFAULT_PROVIDER_ENDPOINTS);
                setParams(DEFAULT_PARAMS);
                setEnabledPlugins(
                  PLUGINS.filter((p) => p.enabled).map((p) => p.id)
                );
                setEnabledSkills(["ops-voice", "visual-out", "tool-use"]);
                setPrefs(DEFAULT_PREFS);
                setCatalogues({});
                setConnections({});
                setDrafts({});
                setInput("");
                setAttachments([]);
                toast("info", "Local data erased.");
              }}
              prefs={prefs}
              setPrefs={setPrefs}
              onExport={exportAll}
              onImport={importAll}
              onClose={desktop ? undefined : () => setNavOpen(false)}
              collapsed={desktop && prefs.railCollapsed}
              onToggleCollapse={desktop ? toggleRail : undefined}
              width={desktop ? prefs.railWidth : undefined}
              onWidthChange={
                desktop
                  ? (w) => setPrefs((p) => ({ ...p, railWidth: w }))
                  : undefined
              }
              onResetWidth={() =>
                setPrefs((p) => ({ ...p, railWidth: RAIL_DEFAULT }))
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main
        id="main-content"
        aria-label="Conversation workspace"
        aria-busy={busy || undefined}
        className="relative flex min-w-0 flex-1 flex-col"
      >
        <header
          className="workspace-header flex flex-none items-center justify-between gap-2 border-b border-white/[0.08] px-2 safe-t sm:px-4"
          style={{ minHeight: "var(--h-bar)" }}
        >
          <div className="flex min-w-0 items-center gap-1.5 text-white/50 sm:gap-2">
            <button
              onClick={() => (desktop ? toggleRail() : setNavOpen(true))}
              className="icon-btn lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <span className="hidden font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-white/30 md:inline">
              Runtime
            </span>
            <span
              className={cn(
                "h-1.5 w-1.5 flex-none rounded-full",
                connection
                  ? connection.ok
                    ? "bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153/0.7)]"
                    : "bg-red-400 shadow-[0_0_8px_rgb(248_113_113/0.7)]"
                  : "bg-white/20"
              )}
              title={connection?.message || "Not connected"}
              aria-hidden
            />
            <span className="sr-only" role="status">
              {connection
                ? connection.ok
                  ? "Provider connection ready"
                  : `Provider connection failed: ${connection.message}`
                : "Provider connection has not been checked"}
            </span>

            <Listbox
              className="flex-none"
              buttonClassName="font-mono hover:bg-white/[0.05]"
              label="Provider"
              value={provider}
              options={providerOptions}
              onChange={(id) => switchProvider(id as ProviderId)}
            />

            <span className="hidden text-white/15 xs:inline">·</span>

            {provider === "custom" ? (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                list="model-hints-header"
                placeholder="model id"
                aria-label="Model ID"
                className="hidden w-36 bg-transparent font-mono text-[11.5px] text-white/80 outline-none hover:text-white xs:block"
              />
            ) : (
              <Listbox
                className="hidden min-w-0 max-w-[10rem] xs:block sm:max-w-[18rem]"
                buttonClassName="font-mono hover:bg-white/[0.05]"
                label="Model"
                value={model}
                options={modelOptions}
                onChange={setModel}
                placeholder="Load models"
                footer={
                  hiddenModels ? (
                    <button
                      onClick={() =>
                        setPrefs((pr) => ({ ...pr, showAllModels: !pr.showAllModels }))
                      }
                      className="w-full text-left text-[10.5px] text-white/40 hover:text-white/70"
                    >
                      {prefs.showAllModels
                        ? `Hide ${hiddenModels} non-chat endpoints`
                        : `Show ${hiddenModels} hidden non-chat endpoints`}
                    </button>
                  ) : null
                }
              />
            )}

            {contextTokens ? (
              <span className="hidden font-mono text-[11px] text-white/25 md:inline">
                · ~{contextTokens.toLocaleString()} tok
              </span>
            ) : null}
            <datalist id="model-hints-header">
              {(MODEL_HINTS[provider] || []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-none items-center gap-1">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden items-center gap-1.5 rounded-lg border border-white/[0.07] px-2.5 py-1.5 text-[11.5px] text-white/45 transition-colors hover:border-white/[0.14] hover:text-white/80 sm:flex"
              aria-label="Open command palette"
            >
              <span>Search</span>
              <kbd className="rounded border border-white/[0.1] px-1 font-mono text-[10px]">
                {mod}K
              </kbd>
            </button>
            <button
              onClick={() => setPanelOpen((v) => !v)}
              aria-pressed={panelOpen}
              aria-label={panelOpen ? "Hide visual canvas" : "Show visual canvas"}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] transition-colors",
                panelOpen
                  ? "chip-on"
                  : "border-white/[0.07] text-white/45 hover:text-white/80"
              )}
            >
              <PanelRight className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Canvas</span>
              {artifacts.length ? (
                <span className="rounded bg-accentc/25 px-1 font-mono text-[10px]">
                  {artifacts.length}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="workspace-scroll min-h-0 flex-1 overflow-y-auto px-3 sm:px-6"
          style={{ paddingTop: "var(--pad-thread)", paddingBottom: "var(--pad-thread)" }}
        >
          {messages.length === 0 ? (
            <div className="flex min-h-full items-start justify-center py-8 sm:items-center">
              <ChatHero
                subtitle={
                  providerSpec.needsKey && !apiKey && !serverKeys[provider]
                    ? `${providerSpec.label} needs a key before it can answer. Add one under Settings, or set ${providerSpec.envKey} in .env.local.`
                    : "Pick a skill below, or just ask. Type / for commands."
                }
              >
                <div className="mx-auto grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                  {suggestions.slice(0, 6).map((s) => (
                    <ActionButton
                      key={s.prefix}
                      icon={s.icon}
                      label={s.label}
                      description={s.description}
                      onClick={() => onSelectCommand(s.prefix)}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10.5px] text-white/30">
                  <Hint keys={`${mod}K`}>command palette</Hint>
                  <Hint keys={`${mod}B`}>toggle sidebar</Hint>
                  <Hint keys={`${mod}\\`}>toggle canvas</Hint>
                  <Hint keys="/">skills</Hint>
                  <Hint keys="Esc">stop generating</Hint>
                </div>
              </ChatHero>
            </div>
          ) : (
            messages.map((m, i) => (
              <ChatMessage
                key={m.id}
                message={m}
                index={i}
                live={busy && i === messages.length - 1 && m.role === "assistant"}
                onRetry={m.role === "assistant" && !busy ? retry : undefined}
                onEdit={m.role === "user" && !busy ? edit : undefined}
                onBranch={!busy ? branch : undefined}
              />
            ))
          )}
        </div>

        {/* jump-to-latest, only while the reader is scrolled away from it */}
        <AnimatePresence>
          {!atBottom && messages.length > 0 ? (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              onClick={() => scrollToBottom()}
              className="absolute bottom-[9.5rem] left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/[0.1] bg-black/80 px-3 py-1.5 text-[11.5px] text-white/70 shadow-lift backdrop-blur-xl hover:text-white"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Latest
            </motion.button>
          ) : null}
        </AnimatePresence>

        <div className="composer-dock flex-none px-3 pb-4 safe-b sm:px-6 sm:pb-5">
          <div className="mx-auto max-w-4xl">
            <AnimatedComposer
              value={input}
              onValueChange={setInput}
              onSend={send}
              onStop={() => abortRef.current?.abort()}
              onAttach={onAttach}
              onRecall={recall}
              onRemoveAttachment={(id) =>
                setAttachments((a) => a.filter((x) => x.id !== id))
              }
              attachments={attachments}
              busy={busy}
              suggestions={suggestions}
              onSelectCommand={onSelectCommand}
              compact={messages.length > 0}
              footer={
                <span className="hidden text-[11px] text-white/30 md:inline">
                  {enabledSkills.length} skills ·{" "}
                  {mcpServers.filter((s) => s.enabled && s.tools?.length).length} MCP
                  {input.trim() ? (
                    <> · ~{estimateTokens(input).toLocaleString()} tok</>
                  ) : null}{" "}
                  · <kbd className="font-mono">⏎</kbd> send
                </span>
              }
            />
          </div>
        </div>

        <AnimatePresence>
          {busy ? (
            <ThinkingPill phase={phase || undefined} startedAt={startedAt} />
          ) : null}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {panelOpen ? (
          <VisualPanel
            artifacts={artifacts}
            messages={messages}
            dark={isDark}
            busy={busy}
            autoPreview={prefs.autoPreview}
            accent={(ACCENTS[prefs.accent] || ACCENTS.violet).hex}
            width={prefs.panelWidth}
            onWidthChange={(w) => setPrefs((p) => ({ ...p, panelWidth: w }))}
            sheet={!desktop}
            onClose={() => setPanelOpen(false)}
          />
        ) : null}
      </AnimatePresence>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
      />

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}

function Chevron() {
  return (
    <svg
      className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-white/30"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M5 7l5 5 5-5" />
    </svg>
  );
}

function Hint({ keys, children }: { keys: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <kbd className="rounded border border-white/[0.1] px-1.5 py-0.5 font-mono text-[10px] text-white/40">
        {keys}
      </kbd>
      {children}
    </span>
  );
}
