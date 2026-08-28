export type ProviderId = "nvidia" | "ollama" | "opencode" | "custom";

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  blurb: string;
  baseUrl: string;
  needsKey: boolean;
  keyPlaceholder: string;
  defaultModel: string;
  /** Server-side env var consulted when the client sends no key. */
  envKey?: string;
  docs: string;
  local?: boolean;
}

export interface Attachment {
  id: string;
  kind: "image" | "text";
  name: string;
  /** data: URL for images */
  data?: string;
  /** decoded contents for text files */
  text?: string;
}

export interface Message {
  id: string;
  /** wall-clock time the turn was created, for transcript grouping */
  ts?: number;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  attachments?: Attachment[];
  ms?: number;
  model?: string;
  provider?: ProviderId;
  toolCalls?: ToolTrace[];
  error?: string;
  /** non-fatal note from the server, e.g. hit the token ceiling */
  notice?: string;
  /** completion tokens reported by the provider, when it reports them */
  tokens?: number;
  /** why generation stopped: stop | length | tool_calls | ... */
  finish?: string;
}

export interface ToolTrace {
  server: string;
  tool: string;
  args: unknown;
  result: string;
  ms: number;
  ok: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  ts: number;
  messages: Message[];
  /** pinned chats sort above the date groups */
  pinned?: boolean;
  /** true once /api/title has named it, so we only ever ask once */
  titled?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  /** Prepended to the system prompt when the skill is enabled. */
  system?: string;
  /** Loaded into the composer when the skill is invoked as a command. */
  template?: string;
  command?: string;
  icon: string;
  pluginId?: string;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  skills: string[];
  enabled: boolean;
}

export interface McpServer {
  id: string;
  name: string;
  /** Streamable-HTTP MCP endpoint. */
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  status?: "idle" | "connecting" | "ready" | "error";
  tools?: McpTool[];
  error?: string;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface GenParams {
  temperature: number;
  topP: number;
  maxTokens: number;
  seed: string;
  thinking: boolean;
  historyDepth: number;
}

export interface Artifact {
  id: string;
  kind: "html" | "svg" | "mermaid" | "code" | "table";
  /** short human label for the canvas tab strip */
  title?: string;
  lang?: string;
  source: string;
  fromMessage: string;
  ts: number;
}

export type Density = "compact" | "standard" | "roomy";

export interface Prefs {
  accent: string;
  autoPreview: boolean;
  reducedMotion: boolean;
  density: Density;
  /** monospace the whole interface, not just code */
  mono: boolean;
  /** name new chats from their first exchange via /api/title */
  autoTitle: boolean;
  /** remembered width of the canvas panel, in px */
  panelWidth: number;
  /** remembered width of the left rail, in px */
  railWidth: number;
  /** left rail collapsed to an icon strip */
  railCollapsed: boolean;
}

export interface Toast {
  id: string;
  kind: "info" | "success" | "error";
  message: string;
  /** optional inline action, e.g. "Open settings" */
  action?: { label: string; run: () => void };
}

export interface HealthReport {
  provider: ProviderId;
  baseUrl: string;
  /** true when the server itself holds a key for this provider */
  serverKey: boolean;
  reachable: boolean;
  ms: number;
  models?: number;
  error?: string;
}
