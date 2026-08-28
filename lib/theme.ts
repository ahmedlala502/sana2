export type Theme = "light" | "dark" | "system";

export const THEME_KEY = "agent_theme";

export function systemPrefersDark() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function readTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    const v = raw ? (JSON.parse(raw) as Theme) : null;
    return v === "light" || v === "dark" || v === "system" ? v : "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(theme: Theme) {
  try {
    window.localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    /* storage blocked - theme lasts for this tab only */
  }
}

/**
 * Runs before first paint so the page never flashes the wrong theme, wrong
 * accent or wrong density. Kept as a string because it is injected with
 * dangerouslySetInnerHTML.
 */
export const THEME_BOOTSTRAP = `
(function(){
  var d = document.documentElement;
  var dark = true;
  try{
    var raw = localStorage.getItem(${JSON.stringify(THEME_KEY)});
    var t = raw ? JSON.parse(raw) : "dark";
    dark = t === "dark" || (t === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (dark) d.classList.add("dark");
    d.style.colorScheme = dark ? "dark" : "light";
  }catch(e){
    d.classList.add("dark");
  }
  try{
    var p = JSON.parse(localStorage.getItem("agent_prefs") || "{}");
    var accents = {"violet":{"rgb":"167 139 250","rgb2":"129 140 248","hex":"#8b5cf6","hex2":"#6366f1"},"blue":{"rgb":"96 165 250","rgb2":"34 211 238","hex":"#3b82f6","hex2":"#06b6d4"},"teal":{"rgb":"45 212 191","rgb2":"56 189 248","hex":"#14b8a6","hex2":"#0ea5e9"},"emerald":{"rgb":"74 222 128","rgb2":"45 212 191","hex":"#22c55e","hex2":"#14b8a6"},"rose":{"rgb":"251 113 133","rgb2":"192 132 252","hex":"#f43f5e","hex2":"#a855f7"},"amber":{"rgb":"251 191 36","rgb2":"248 113 113","hex":"#f59e0b","hex2":"#ef4444"}};
    var a = accents[p.accent] || accents.violet;
    d.style.setProperty("--accent-rgb", dark ? a.rgb : ({"violet":"109 40 217","blue":"29 78 216","teal":"15 118 110","emerald":"21 128 61","rose":"190 18 60","amber":"180 83 9"})[p.accent||"violet"] || a.rgb);
    d.style.setProperty("--accent-vivid-rgb", a.rgb);
    d.style.setProperty("--accent-2-rgb", a.rgb2);
    d.style.setProperty("--pi-accent", a.hex);
    d.style.setProperty("--pi-accent-2", a.hex2);
    if (p.density === "compact") d.classList.add("density-compact");
    if (p.density === "roomy") d.classList.add("density-roomy");
    if (p.reducedMotion) d.classList.add("reduce-motion");
    if (p.mono) d.classList.add("font-mono-ui");
    // width first, so the rail never jumps after hydration
    if (typeof p.railWidth === "number") d.style.setProperty("--rail-w", p.railWidth + "px");
  }catch(e){}
})();
`;

/**
 * Accents drive every violet in the UI.
 *
 * `rgb` is what Tailwind's `accent-*` colour resolves to, so `text-accentc`,
 * `bg-accentc/15` and friends follow the picker. `hex` is only for places that
 * need a literal colour (gradients, glows, iframe chrome).
 */
export interface AccentSpec {
  id: string;
  label: string;
  hex: string;
  hex2: string;
  /** space-separated channels, for `rgb(var(--accent-rgb) / <alpha>)` */
  rgb: string;
  rgb2: string;
  /** darker pair, used in light mode where the bright tone fails contrast */
  hexInk: string;
  rgbInk: string;
}

export const ACCENT_LIST: AccentSpec[] = [
  {
    id: "violet",
    label: "Violet",
    hex: "#8b5cf6",
    hex2: "#6366f1",
    rgb: "167 139 250",
    rgb2: "129 140 248",
    hexInk: "#6d28d9",
    rgbInk: "109 40 217",
  },
  {
    id: "blue",
    label: "Azure",
    hex: "#3b82f6",
    hex2: "#06b6d4",
    rgb: "96 165 250",
    rgb2: "34 211 238",
    hexInk: "#1d4ed8",
    rgbInk: "29 78 216",
  },
  {
    id: "teal",
    label: "Teal",
    hex: "#14b8a6",
    hex2: "#0ea5e9",
    rgb: "45 212 191",
    rgb2: "56 189 248",
    hexInk: "#0f766e",
    rgbInk: "15 118 110",
  },
  {
    id: "emerald",
    label: "Emerald",
    hex: "#22c55e",
    hex2: "#14b8a6",
    rgb: "74 222 128",
    rgb2: "45 212 191",
    hexInk: "#15803d",
    rgbInk: "21 128 61",
  },
  {
    id: "rose",
    label: "Rose",
    hex: "#f43f5e",
    hex2: "#a855f7",
    rgb: "251 113 133",
    rgb2: "192 132 252",
    hexInk: "#be123c",
    rgbInk: "190 18 60",
  },
  {
    id: "amber",
    label: "Amber",
    hex: "#f59e0b",
    hex2: "#ef4444",
    rgb: "251 191 36",
    rgb2: "248 113 113",
    hexInk: "#b45309",
    rgbInk: "180 83 9",
  },
];

export const ACCENTS: Record<string, AccentSpec> = Object.fromEntries(
  ACCENT_LIST.map((a) => [a.id, a])
);

export type AccentId = string;

/** Writes the accent onto :root. Light mode uses the darker `ink` pair so
 *  accent-coloured text still clears 4.5:1 on paper. */
export function applyAccent(id: AccentId, dark: boolean) {
  if (typeof document === "undefined") return;
  const a = ACCENTS[id] || ACCENTS.violet;
  const root = document.documentElement;
  root.style.setProperty("--accent-rgb", dark ? a.rgb : a.rgbInk);
  root.style.setProperty("--accent-2-rgb", a.rgb2);
  root.style.setProperty("--accent-vivid-rgb", a.rgb);
  root.style.setProperty("--pi-accent", a.hex);
  root.style.setProperty("--pi-accent-2", a.hex2);
}
