import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function estimateTokens(text: string) {
  return Math.round((text || "").length / 4);
}

/** "1.4s" / "820ms" - latency is easier to scan without a unit switch. */
export function fmtMs(ms: number) {
  if (!ms) return "-";
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Buckets a timestamp for the sidebar's date headings. */
export function dateBucket(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (ts >= startOfToday) return "Today";
  if (ts >= startOfToday - day) return "Yesterday";
  if (ts >= startOfToday - 7 * day) return "Previous 7 days";
  if (ts >= startOfToday - 30 * day) return "Previous 30 days";
  return then.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** Clipboard with a fallback for non-secure origins, where the API is absent. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea trick */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Triggers a browser download, revoking the object URL afterwards. */
export function downloadBlob(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the click a tick to start before the URL goes away
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** True when the platform uses Cmd rather than Ctrl for shortcuts. */
export function isMac() {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

/** localStorage that never throws (private mode, blocked storage, SSR). */
export const store = {
  get<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(`agent_${key}`);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(`agent_${key}`, JSON.stringify(value));
    } catch (e) {
      /*
        Quota is the realistic failure here - a long transcript with inlined
        images fills the 5MB budget fast. Report it so the caller can warn
        instead of silently losing every chat written after the limit.
      */
      throw e;
    }
  },
  /** set() that swallows failures, for state where losing it is acceptable. */
  trySet(key: string, value: unknown) {
    try {
      store.set(key, value);
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    if (typeof window === "undefined") return;
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith("agent_"))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
  },
};
