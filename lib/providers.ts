import type { ProviderId, ProviderSpec } from "./types";

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  nvidia: {
    id: "nvidia",
    label: "NVIDIA NIM",
    blurb: "84+ hosted models. Free tier, no GPU needed.",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    needsKey: true,
    keyPlaceholder: "nvapi-...",
    defaultModel: "deepseek-ai/deepseek-v4-pro-0813",
    envKey: "NVIDIA_API_KEY",
    docs: "https://build.nvidia.com",
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    blurb: "Runs on your own machine. No key, no cost, works offline.",
    baseUrl: "http://127.0.0.1:11434/v1",
    needsKey: false,
    keyPlaceholder: "not required",
    defaultModel: "llama3.2",
    docs: "https://ollama.com",
    local: true,
  },
  opencode: {
    id: "opencode",
    label: "OpenCode Zen",
    blurb: "Coding-tuned gateway with a free tier.",
    baseUrl: "https://opencode.ai/zen/v1",
    needsKey: true,
    keyPlaceholder: "your Zen key",
    defaultModel: "deepseek-v4-flash-free",
    envKey: "OPENCODE_API_KEY",
    docs: "https://opencode.ai/docs/zen/",
  },
  custom: {
    id: "custom",
    label: "Custom",
    blurb: "Any OpenAI-compatible endpoint - OpenRouter, Groq, LM Studio, vLLM.",
    baseUrl: "",
    needsKey: false,
    keyPlaceholder: "optional",
    defaultModel: "",
    docs: "",
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  "nvidia",
  "ollama",
  "opencode",
  "custom",
];

/** Known-good starting points when a provider has no live catalogue. */
export const MODEL_HINTS: Partial<Record<ProviderId, string[]>> = {
  nvidia: [
    "deepseek-ai/deepseek-v4-pro-0813",
    "deepseek-ai/deepseek-v4-flash-0731",
    "deepseek-ai/deepseek-coder-6.7b-instruct",
  ],
  ollama: ["llama3.2", "qwen2.5-coder", "mistral", "phi3"],
  opencode: [
    "deepseek-v4-flash-free",
    "nemotron-3-ultra-free",
    "mimo-v2.5-free",
    "laguna-s-2.1-free",
  ],
};

export function resolveBaseUrl(id: ProviderId, custom?: string) {
  const spec = PROVIDERS[id];
  const url = (custom || spec.baseUrl || "").trim().replace(/\/+$/, "");
  return url;
}

/* ------------------------------------------------------------------ *
 * Model catalogue filtering
 *
 * `GET /models` is not a list of models you can chat with - it is every
 * artefact the account can reach. NVIDIA alone returns embedding, reranking,
 * retrieval, OCR, speech and safety-classifier endpoints alongside the actual
 * chat models, and picking one of those gets you a 404 or a shape error rather
 * than a reply. These are the families that are never chat completions.
 * ------------------------------------------------------------------ */

const NON_CHAT_PATTERNS: RegExp[] = [
  /embed/i, // *-embed, embedding, embedqa
  /\brerank/i,
  /retriev/i, // nemoretriever, retrieval-*
  /\bbge-/i,
  /\be5-/i,
  /\bgte-/i,
  /sentence-transformer/i,
  /\bocr\b/i,
  /paddleocr/i,
  /\basr\b/i,
  /\btts\b/i,
  /whisper/i,
  /speech/i,
  /parakeet/i,
  /riva/i,
  /\bclip\b/i,
  /diffusion/i,
  /\bsdxl\b/i,
  /flux/i,
  /image-gen/i,
  /text-to-image/i,
  /upscal/i,
  /moderation/i,
  /nv-(embed|rerank)/i,
  /-(embed|embedding|rerank|reranker)$/i,
  /molmim|esmfold|alphafold|genmol|diffdock|msa-search/i, // biology NIMs
];

/** True when the id looks like something you can actually hold a chat with. */
export function isChatModel(id: string): boolean {
  if (!id) return false;
  return !NON_CHAT_PATTERNS.some((re) => re.test(id));
}

/**
 * A rough "this is a mainstream, instruction-tuned model" score, used only to
 * sort the good stuff to the top of the picker. Higher is more prominent.
 */
export function modelRank(id: string): number {
  const s = id.toLowerCase();
  let n = 0;
  if (/instruct|chat|-it\b/.test(s)) n += 3;
  if (/deepseek|llama|qwen|mistral|nemotron|gemma|phi|mixtral|command/.test(s)) n += 2;
  if (/pro|ultra|large|70b|405b|max/.test(s)) n += 1;
  if (/free/.test(s)) n += 1;
  if (/base|preview|alpha|deprecated|legacy/.test(s)) n -= 2;
  if (/guard|safety|content-safety|topic-control/.test(s)) n -= 3;
  return n;
}

/** Filter + sort a raw catalogue into what the picker should show first. */
export function usableModels(ids: string[]): string[] {
  return ids
    .filter(isChatModel)
    .sort((a, b) => modelRank(b) - modelRank(a) || a.localeCompare(b));
}
