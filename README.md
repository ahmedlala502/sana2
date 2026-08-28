# Sana2 Advanced Assistant

A multi-provider AI console built on Next.js 14 (App Router), TypeScript, Tailwind and the
shadcn project structure. One chat surface across **NVIDIA NIM**, **Ollama**, **OpenCode Zen**
and any OpenAI-compatible endpoint — with skills, plugins, MCP tools and a live visual canvas.

---

## Run it

You need [Node.js](https://nodejs.org) 18.17 or newer.

```bash
npm install
cp .env.local.example .env.local   # optional, see Keys below
npm run dev
```

Open http://localhost:3000.

Production build:

```bash
npm run build && npm start
```

---

## Keys

Two options, and the second is the better one.

**In the UI** — Settings → paste the key. It stays in the browser tab; tick *Remember on this
device* to keep it in `localStorage`. Convenient, but the key lives in the browser.

**In `.env.local`** — leave the UI field blank and set the key there instead:

```
NVIDIA_API_KEY=nvapi-...
OPENCODE_API_KEY=...
```

The server routes read it directly, so the key never reaches the browser at all. Prefer this.

> Rotate any key that has been pasted into a chat, an email, or a shared doc. Treat it as public.

---

## Providers

| Provider | Base URL | Key | Notes |
|---|---|---|---|
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `nvapi-…` | 84+ models, free tier |
| Ollama | `http://127.0.0.1:11434/v1` | none | run `ollama serve` first |
| OpenCode Zen | `https://opencode.ai/zen/v1` | Zen key | coding models, free tier |
| Custom | you set it | optional | OpenRouter, Groq, LM Studio, vLLM |

**Load model list** in Settings queries the provider's own `/models` and turns the model field
into a picker — no guessing at IDs.

---

## Architecture

Every provider call goes through a Next.js route handler, never straight from the browser:

```
browser  →  /api/chat    →  provider  (SSE re-framed as typed events)
         →  /api/models  →  provider  (catalogue)
         →  /api/title   →  provider  (names a chat from its first exchange)
         →  /api/health  →  provider  (reachability + which keys the server holds)
         →  /api/mcp     →  MCP server (JSON-RPC over Streamable HTTP)
```

That buys three things: CORS disappears, keys can live server-side, and MCP credentials never
touch the client.

```
app/
  api/chat/route.ts     streaming + MCP tool loop
  api/models/route.ts   provider catalogue
  api/title/route.ts    auto-names a conversation
  api/health/route.ts   provider ping + server-side key report
  api/mcp/route.ts      tools/list and tools/call
  page.tsx              orchestrator - all state lives here
components/
  ui/animated-ai-chat.tsx   composer, skill palette, hero, motion primitives
  ui/command-palette.tsx    the Cmd+K palette
  ui/toast.tsx              transient notices
  sidebar.tsx               chats / skills / plugins / MCP / settings
  chat-message.tsx          markdown, reasoning, tool traces
  visual-panel.tsx          sandboxed canvas + metrics
lib/
  providers.ts  registry.ts  mcp.ts  markdown.ts  http.ts  theme.ts
  types.ts  utils.ts
```

### Skills

Prompt-level capabilities in `lib/registry.ts`. Two kinds:

- **Always-on** — contribute a fragment to the system prompt (*Ops voice*, *Visual output*,
  *Tool discipline*). Toggle them in the Skills tab.
- **Commands** — load a template into the composer. Type `/` to reach them, or click *Load into
  composer*.

Adding one is a single object in the `SKILLS` array. No other file needs to change.

### Plugins

Bundles of skills (`PLUGINS` in the same file). Turning a plugin off hides its skills and its
slash commands everywhere at once.

### MCP

Add a Streamable-HTTP MCP server in the MCP tab. The app handshakes, lists its tools, and
exposes them to the model as OpenAI function specs, namespaced `server__tool` so two servers can
share a tool name. When the model calls one, `/api/chat` runs up to 4 tool rounds, executes each
call server-side, feeds results back, and only then streams the final answer. Every call shows in
the transcript with its server, arguments, duration and result.

### Theme and appearance

Four independent axes, all remembered per device and all applied by a script in
`<head>` before first paint, so nothing flashes on reload:

| Axis | Options | How it works |
|---|---|---|
| Theme | Light / Dark / System | swaps `--tint` and `--shade` |
| Accent | six palettes | swaps `--accent-rgb`, which the `accentc` Tailwind colour reads |
| Density | Compact / Standard / Roomy | swaps `--gap-msg`, `--pad-thread`, `--text-msg`, `--h-bar` |
| Motion | Reduce motion | honoured from the toggle *and* from `prefers-reduced-motion` |

The whole UI is built from translucent tints (`text-white/40`, `bg-white/[0.02]`).
Rather than maintain two sets of classes, `white` and `black` are mapped to CSS
variables in `tailwind.config.ts`, and the theme swaps those variables - light
mode makes "white" near-black ink and "black" paper. A small contrast layer at
the bottom of `globals.css` raises alpha values in light mode only, because
opacities tuned for white-on-black read too faint as ink-on-paper.

The accent works the same way one level up: every control that reads as "the
brand colour" uses `accentc` rather than a hardcoded violet, so the picker
repaints the app instead of only tinting the ambient glow. In light mode the
accent switches to a darker ink tone so accent-coloured text still clears 4.5:1
on paper.

### Keyboard

| Keys | Does |
|---|---|
| `Cmd/Ctrl` `K` | command palette - chats, skills, theme, accent, actions |
| `Cmd/Ctrl` `B` | toggle the sidebar |
| `Cmd/Ctrl` `\` | toggle the canvas |
| `Cmd/Ctrl` `Shift` `O` | new chat |
| `Esc` | stop generating, or close the drawer |
| `/` | skill commands, in the composer |
| `Up` | recall your last message, in an empty composer |

### Layout

One layout, three shapes. Above `lg` the sidebar is a fixed rail and the canvas
is a resizable one (drag the divider, or focus it and use the arrow keys - the
width is remembered). Below `lg` the sidebar becomes a drawer and the canvas a
full-screen sheet, so the transcript keeps the full width. Pinch-zoom is never
disabled.

### Visual canvas

The *Visual output* skill asks the model to emit renderable blocks. Any ` ```html `, ` ```svg `,
` ```mermaid ` block or markdown table is extracted and rendered in a **sandboxed iframe**
(`sandbox="allow-scripts"`, no same-origin) in the right-hand panel, with a tab per artifact
named from its own `<title>` or first heading. **Mermaid renders for real**, loading the library
inside the sandbox; if that CDN is unreachable the frame falls back to showing the source.

The **Metrics** tab - reachable from the switch in the panel header - tracks replies, latency
distribution, context size, error count and tool-call success rate.

---

## Adding a shadcn component

The project is already configured (`components.json`, `@/*` path alias, CSS variables), so:

```bash
npx shadcn@latest add button dialog
```

lands in `components/ui/`. That path matters: `components.json` points the CLI there, `@/components/ui/...`
imports assume it, and every future shadcn component expects to find its siblings in the same
folder.

---

## Notes and limits

- Drafts are kept **per chat** - switch away and back and your half-typed message is
  still there (persisted to `localStorage` too). Deleting a chat offers **Undo** in the
  toast, and `Export this chat as Markdown` in the palette writes a readable file for
  the current conversation.

- Images are inlined as data URLs, so they are capped at 180kb. Only vision-capable models will
  read them.
- Some models reject a `system` role. If a 400 mentions it, turn off the always-on skills.
- Tool calling needs a provider that supports it. If tools 400, the app drops them and answers
  without.
- Chats, settings and MCP configs are stored in `localStorage` — this device only. That has a
  hard quota (~5MB) and inlined images fill it fast; when a write fails the app says so rather
  than losing chats silently. **Export** in Settings writes chats, settings and MCP servers to
  a JSON file, and **Import** merges one back without overwriting what is already there. No API
  key is ever included in an export.
- Main model generations and MCP tool calls have no app-imposed deadline. Output limit defaults
  to **Provider max**, complete session history is sent by default, and MCP sessions are reused
  until the server expires them. Provider/model context and output ceilings still apply; when a
  provider reports a length stop, continue in the same session. Closing the tab or hitting Stop
  aborts the active provider request immediately. Short catalogue/title lookups retain deadlines
  because they are advisory UI operations rather than agent work.
- Mermaid rendering fetches the library from jsdelivr inside the sandboxed frame. On an offline
  or locked-down network the panel shows the diagram source instead.

---

## Troubleshooting

**Blank page / "can't reach this site".** Nothing is listening on the port. Either the dev server
was never started, it was stopped (Ctrl+C), or it crashed — check the terminal you ran
`npm run dev` in. If port 3000 was busy, Next picks another one and prints it; read the
`- Local: http://localhost:PORT` line rather than assuming 3000.

**Page loads but nothing is interactive.** Usually a stale server process serving old asset
hashes — you'll see `400` on `/_next/static/...` in the browser console. Kill every running
`next` process and start one fresh.

**401 "needs an API key".** Expected until a key is set. Either paste it in Settings, or put it
in `.env.local` and **restart the server** — Next only reads env files at startup.

**Ollama says `fetch failed` / `ECONNREFUSED`.** Run `ollama serve`, and confirm the base URL is
`http://127.0.0.1:11434/v1`.
