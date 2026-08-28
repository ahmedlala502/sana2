// Temporary: confirms the drawer behaviour below lg is unaffected.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9337;
const profile = mkdtempSync(join(tmpdir(), "mob-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=430,900",
  "about:blank",
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const p = list.find((t) => t.type === "page");
    if (p?.webSocketDebuggerUrl) { wsUrl = p.webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
const sock = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const errors = [];
const call = (method, params = {}) =>
  new Promise((res) => {
    const myId = ++id;
    pending.set(myId, res);
    sock.send(JSON.stringify({ id: myId, method, params }));
    setTimeout(() => res(null), 10000);
  });
sock.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown")
    errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
await new Promise((r) => (sock.onopen = r));
await call("Runtime.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 430, height: 900, deviceScaleFactor: 2, mobile: true,
});

const js = (expression) =>
  call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    .then((r) => r?.result?.value);

const measure = () => js(`(() => {
  const asides = [...document.querySelectorAll('aside')].map(el => ({
    label: el.getAttribute('aria-label') || (el.className.includes('border-r') ? 'SIDEBAR' : '?'),
    w: Math.round(el.getBoundingClientRect().width),
    x: Math.round(el.getBoundingClientRect().x),
  }));
  const a = document.querySelector('aside');
  const r = a ? a.getBoundingClientRect() : null;
  return {
    asides,
    drawerPresent: !!a,
    width: r ? Math.round(r.width) : null,
    onScreen: r ? Math.round(r.x) === 0 : null,
    hasResizeHandle: !!document.querySelector('[aria-label="Resize sidebar"]'),
    hamburgerVisible: (() => {
      const b = document.querySelector('[aria-label="Open menu"]');
      return b ? getComputedStyle(b).display !== "none" : false;
    })(),
    docScrollW: document.documentElement.scrollWidth,
    viewportW: window.innerWidth,
  };
})()`);

const out = [];
await call("Page.navigate", { url: "http://localhost:3000/" });
await sleep(6500);
out.push(["1. mobile initial", await measure()]);

await js(`document.querySelector('[aria-label="Open menu"]').click()`);
await sleep(800);
out.push(["2. after hamburger", await measure()]);

await js(`document.querySelector('[aria-label="Close menu"]').click()`);
await sleep(800);
out.push(["3. after close", await measure()]);

for (const [name, m] of out) console.log(name.padEnd(22), JSON.stringify(m));
console.log("\nEXCEPTIONS:", errors.length ? errors.join("\n") : "(none)");

sock.close();
chrome.kill();
process.exit(0);
