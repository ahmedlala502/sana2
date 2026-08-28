import type { Artifact } from "./types";

/** Languages that get pulled into the canvas instead of shown inline in chat. */
export const CANVAS_LANGS = ["html", "svg", "mermaid"] as const;

function esc(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

function escAttr(s: string) {
  return esc(s).replace(/"/g, "&quot;");
}

function isCanvasLang(lang: string) {
  return (CANVAS_LANGS as readonly string[]).includes(lang);
}

/**
 * Dependency-free syntax highlighter.
 *
 * Markup (html/svg/xml/mermaid) gets tag/attribute/string/comment colouring;
 * everything else gets a lighter pass over strings, comments, numbers and a
 * common keyword set, which is enough to stop a code block reading as a grey
 * wall without pulling in a 300kb tokenizer.
 *
 * Operates on an already-escaped string in a single pass so inserted spans are
 * never re-processed. Safe against the source containing `<`, `>`, `&`.
 */
export function highlightCode(src: string, lang?: string): string {
  const l = (lang || "").toLowerCase();
  const escSrc = esc(src);

  if (l === "html" || l === "svg" || l === "xml" || l === "mermaid") {
    const re =
      /(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-zA-Z][\w-]*)|([a-zA-Z_][\w-]*)(=)("[^"]*"|'[^']*')|(&gt;)/g;
    let out = "";
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(escSrc))) {
      out += escSrc.slice(last, m.index);
      if (m[1]) out += `<span class="tk-c">${m[1]}</span>`;
      else if (m[2]) out += `${m[2]}<span class="tk-t">${m[3]}</span>`;
      else if (m[4]) out += `<span class="tk-a">${m[4]}</span>${m[5]}<span class="tk-s">${m[6]}</span>`;
      else if (m[7]) out += m[7];
      last = re.lastIndex;
    }
    return out + escSrc.slice(last);
  }

  if (!l || l === "text" || l === "txt") return escSrc;

  const KEYWORDS =
    /\b(const|let|var|function|return|if|else|for|while|class|extends|import|from|export|default|async|await|new|try|catch|finally|throw|typeof|interface|type|def|elif|lambda|None|True|False|null|true|false|undefined|public|private|static|void|struct|impl|fn|match|use|package|select|where|insert|update|delete)\b/g;
  const re =
    /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  const kw = (s: string) => s.replace(KEYWORDS, '<span class="tk-k">$1</span>');
  while ((m = re.exec(escSrc))) {
    out += kw(escSrc.slice(last, m.index));
    if (m[1]) out += `<span class="tk-c">${m[1]}</span>`;
    else if (m[2]) out += `<span class="tk-s">${m[2]}</span>`;
    else if (m[3]) out += `<span class="tk-n">${m[3]}</span>`;
    last = re.lastIndex;
  }
  return out + kw(escSrc.slice(last));
}

/** Small, dependency-free markdown -> HTML. Handles the subset models emit. */
export function renderMarkdown(src: string): string {
  const blocks: string[] = [];

  let s = (src || "").replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, langRaw: string, code: string) => {
    const lang = (langRaw || "").toLowerCase();
    const source = code.replace(/\n$/, "");
    // Renderable blocks are pulled into the canvas - show a compact reference
    // chip in the chat rather than dumping the raw markup inline.
    if (isCanvasLang(lang) && source.trim()) {
      const label =
        lang === "mermaid" ? "Diagram" : lang === "svg" ? "SVG" : "HTML";
      blocks.push(
        `<div class="canvas-ref"><span class="canvas-ref-dot"></span>` +
          `<span class="canvas-ref-text">${label} rendered in canvas</span>` +
          `<span class="canvas-ref-lang">${lang}</span></div>`
      );
      return `\u0000${blocks.length - 1}\u0000`;
    }
    /*
      The copy button carries the source in a data attribute rather than
      reading textContent, so the highlighted spans do not end up on the
      clipboard. A delegated listener in ChatMessage handles the click.
    */
    blocks.push(
      `<pre data-lang="${escAttr(lang || "code")}">` +
        `<button type="button" class="code-copy" data-code="${escAttr(source)}">copy</button>` +
        `<code>${highlightCode(source, lang)}</code></pre>`
    );
    return `\u0000${blocks.length - 1}\u0000`;
  });

  s = esc(s);

  // inline code first, so its contents survive the rest of the pass
  const inline: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => {
    inline.push(`<code>${c}</code>`);
    return `\u0001${inline.length - 1}\u0001`;
  });

  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
  // [label](url) - only http(s) and mailto, so a reply cannot smuggle a
  // javascript: URL into the transcript. esc() already ran on this pass but
  // it leaves quotes alone - without this, a URL containing `"` would close
  // the href attribute early and inject an event handler into the transcript.
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">${label}</a>`
  );
  s = s.replace(/^#{1,6}\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^\s*(?:---|\*\*\*|___)\s*$/gm, "<hr>");
  s = s.replace(/^\s*&gt;\s?(.*)$/gm, "<blockquote>$1</blockquote>");
  s = s.replace(/<\/blockquote>\n<blockquote>/g, "<br>");

  s = renderTables(s);
  s = renderLists(s);
  s = renderParagraphs(s);

  s = s.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => inline[Number(i)]);
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)]);
  return s;
}

/**
 * Lists, keeping ordered and unordered apart.
 *
 * The previous pass turned both `- x` and `1. x` into bare `<li>` and wrapped
 * every run in `<ul>`, so numbered lists silently lost their numbers.
 */
function renderLists(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let i = 0;
  const ul = /^\s*[-*+]\s+(.+)$/;
  const ol = /^\s*\d+[.)]\s+(.+)$/;

  while (i < lines.length) {
    const isUl = ul.test(lines[i]);
    const isOl = !isUl && ol.test(lines[i]);
    if (!isUl && !isOl) {
      out.push(lines[i]);
      i++;
      continue;
    }
    const re = isUl ? ul : ol;
    const tag = isUl ? "ul" : "ol";
    const items: string[] = [];
    while (i < lines.length && re.test(lines[i])) {
      items.push(`<li>${lines[i].match(re)![1]}</li>`);
      i++;
    }
    out.push(`<${tag}>${items.join("")}</${tag}>`);
  }
  return out.join("\n");
}

/** Wraps loose text runs in <p> so paragraphs get real spacing. */
function renderParagraphs(s: string): string {
  const BLOCK = /^\s*<(h3|ul|ol|pre|table|blockquote|hr|div)/;
  return s
    .split(/\n{2,}/)
    .map((chunk) => {
      const t = chunk.trim();
      if (!t) return "";
      if (BLOCK.test(t) || /^\u0000\d+\u0000$/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br>")}</p>`;
    })
    .filter(Boolean)
    .join("\n");
}

function renderTables(s: string): string {
  const lines = s.split("\n");
  const out: string[] = [];
  let i = 0;
  const cells = (l: string) =>
    l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

  while (i < lines.length) {
    const head = /^\s*\|.*\|\s*$/.test(lines[i] || "");
    const sep = /^\s*\|[\s:\-|]+\|\s*$/.test(lines[i + 1] || "");
    if (head && sep) {
      let html =
        "<table><thead><tr>" +
        cells(lines[i]).map((c) => `<th>${c}</th>`).join("") +
        "</tr></thead><tbody>";
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        html +=
          "<tr>" + cells(lines[i]).map((c) => `<td>${c}</td>`).join("") + "</tr>";
        i++;
      }
      out.push(html + "</tbody></table>");
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}

/** A short human label for the artifact tab strip. */
function artifactTitle(kind: Artifact["kind"], source: string): string {
  const title = source.match(/<title>([^<]{1,60})<\/title>/i)?.[1];
  if (title) return title.trim();
  const h1 = source.match(/<h1[^>]*>([^<]{1,60})<\/h1>/i)?.[1];
  if (h1) return h1.trim();
  if (kind === "mermaid") {
    const type = source.trim().split(/\s|\n/)[0];
    return type ? `${type} diagram` : "Diagram";
  }
  if (kind === "table") {
    const first = source.split("\n")[0].replace(/^\||\|$/g, "").split("|")[0];
    return first?.trim() ? `Table: ${first.trim()}` : "Table";
  }
  if (kind === "svg") {
    const t = source.match(/<title>([^<]+)<\/title>/i)?.[1];
    return t?.trim() || "Vector";
  }
  return "Document";
}

/** Pulls renderable blocks out of a reply so the visual panel can show them. */
export function extractArtifacts(messageId: string, content: string): Artifact[] {
  const found: Artifact[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(content))) {
    const lang = (m[1] || "").toLowerCase();
    const source = m[2].trim();
    if (!source) continue;
    let kind: Artifact["kind"] | null = null;
    if (lang === "html") kind = "html";
    else if (lang === "svg" || source.startsWith("<svg")) kind = "svg";
    else if (lang === "mermaid") kind = "mermaid";
    if (!kind) continue;
    found.push({
      id: `${messageId}_a${n++}`,
      kind,
      lang,
      source,
      title: artifactTitle(kind, source),
      fromMessage: messageId,
      ts: Date.now(),
    });
  }

  // markdown tables count as visual output too - scan line by line rather than
  // with a regex, because /m makes `$` match every line end and truncates it
  const lines = content.split("\n");
  const isRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const isSep = (l: string) => /^\s*\|[\s:\-|]+\|\s*$/.test(l);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!isRow(lines[i]) || !isSep(lines[i + 1])) continue;
    let j = i + 2;
    while (j < lines.length && isRow(lines[j])) j++;
    const source = lines.slice(i, j).join("\n");
    found.push({
      id: `${messageId}_t${i}`,
      kind: "table",
      source,
      title: artifactTitle("table", source),
      fromMessage: messageId,
      ts: Date.now(),
    });
    i = j;
  }
  return found;
}

/** Wraps an artifact into a self-contained document for the sandboxed iframe. */
export function artifactDocument(a: Artifact, dark = true, accent = "#8b5cf6"): string {
  const c = dark
    ? { bg: "#0b0b0f", fg: "#e6edf3", line: "#2a2a35", head: "#16161d", dim: "#8b98a5" }
    : { bg: "#ffffff", fg: "#16181d", line: "#e2e5ea", head: "#f3f4f7", dim: "#6b7280" };

  const shell = (inner: string, extra = "", scripts = "") => `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:${dark ? "dark" : "light"}}
  html,body{margin:0;background:${c.bg};color:${c.fg};
    font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  body{padding:18px}
  a{color:${accent}}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid ${c.line};padding:7px 10px;text-align:left}
  th{background:${c.head};font-weight:600}
  tr:nth-child(even) td{background:${dark ? "#101017" : "#fafbfc"}}
  svg,img{max-width:100%;height:auto}
  pre{overflow:auto}
  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-thumb{background:${c.line};border-radius:8px}
  ${extra}
</style></head><body>${inner}${scripts}</body></html>`;

  if (a.kind === "html") {
    return /<html[\s>]/i.test(a.source) ? a.source : shell(a.source);
  }
  if (a.kind === "svg") {
    return shell(`<div style="display:grid;place-items:center;min-height:60vh">${a.source}</div>`);
  }
  if (a.kind === "table") return shell(renderMarkdown(a.source));

  if (a.kind === "mermaid") {
    /*
      Mermaid renders from a CDN inside the sandbox. The frame is
      sandbox="allow-scripts" with no allow-same-origin, so the script can draw
      but cannot reach this app's storage or DOM. If the CDN is blocked or
      offline - an air-gapped machine, a strict network - the catch below swaps
      in the source, which is what the panel used to show unconditionally.
    */
    const src = a.source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
    return shell(
      `<div id="d" style="display:grid;place-items:center;min-height:60vh"></div>
       <pre id="f" hidden style="white-space:pre-wrap;font:12.5px/1.6 ui-monospace,monospace;color:${c.dim}"></pre>`,
      `#d svg{max-width:100%}`,
      `<script type="module">
        const src = \`${src}\`;
        const bail = (why) => {
          const f = document.getElementById("f");
          f.hidden = false;
          f.textContent = why + "\\n\\n" + src;
          document.getElementById("d").remove();
        };
        try {
          const m = await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs");
          m.default.initialize({ startOnLoad: false, theme: ${dark ? '"dark"' : '"default"'}, securityLevel: "strict" });
          const { svg } = await m.default.render("g", src);
          document.getElementById("d").innerHTML = svg;
        } catch (e) {
          bail("Could not render this diagram (" + (e && e.message ? e.message : e) + "). Source below:");
        }
      </script>`
    );
  }
  return shell("");
}
