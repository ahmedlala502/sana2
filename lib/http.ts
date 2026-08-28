/**
 * Server-side fetch helpers.
 *
 * Every upstream call in this app talks to a provider we do not control, so
 * each one gets a deadline. Without it a hung provider socket holds a Node
 * request open until the platform kills it, and the browser just sees a
 * spinner that never resolves.
 */

export const DEFAULT_TIMEOUT_MS = 45_000;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

/**
 * fetch() with a deadline, honouring a caller-supplied signal too so a client
 * disconnect aborts the upstream request instead of leaving it running.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number; parentSignal?: AbortSignal } = {}
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, parentSignal, ...rest } = init;
  const ctrl = new AbortController();
  // A zero timeout explicitly means no app-imposed deadline. The request still
  // follows the browser/client abort signal, so Stop and tab close remain safe.
  const timer =
    timeoutMs > 0
      ? setTimeout(() => ctrl.abort(new Error("timeout")), timeoutMs)
      : undefined;

  const onParentAbort = () => ctrl.abort(new Error("client disconnected"));
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    return await fetch(url, { ...rest, signal: ctrl.signal });
  } catch (e: any) {
    if (parentSignal?.aborted) throw e;
    if (ctrl.signal.aborted && timeoutMs > 0) {
      throw new UpstreamError(
        `No response within ${Math.round(timeoutMs / 1000)}s - the provider is slow or unreachable.`,
        504
      );
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Turns a raw upstream failure into something a person can act on. Provider
 * error bodies are usually a wall of JSON; the status code is what actually
 * tells you what to change.
 */
export function explainStatus(status: number, body: string, label: string) {
  const b = body.slice(0, 300);
  if (status === 401 || status === 403)
    return `${label} rejected the key (HTTP ${status}). Check it in Settings, or set the env var and restart the server. ${b}`;
  if (status === 404)
    return `HTTP 404 - that model ID is not available on this account. Hit "Load model list" to see what is. ${b}`;
  if (status === 429)
    return `HTTP 429 - rate limited by ${label}. Wait a moment, or switch model. ${b}`;
  if (status === 413) return `HTTP 413 - the request is too large. Trim the history or the attachments.`;
  if (status >= 500) return `HTTP ${status} - ${label} is having trouble. This is upstream, not your config. ${b}`;
  return `HTTP ${status} - ${b}`;
}

/** Network-level failures worth a specific hint rather than a raw stack. */
export function explainNetwork(msg: string) {
  if (/ECONNREFUSED|fetch failed|ENOTFOUND/i.test(msg))
    return `${msg} - nothing is listening at that base URL. If this is Ollama, run \`ollama serve\` first.`;
  if (/certificate|SELF_SIGNED/i.test(msg))
    return `${msg} - TLS rejected the endpoint's certificate.`;
  return msg;
}
