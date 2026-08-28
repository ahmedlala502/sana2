// Temporary: verifies the left rail collapses, resizes, and persists.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9336;
const profile = mkdtempSync(join(tmpdir(), "rail-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--window-size=1440,900",
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

const js = (expression) =>
  call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
    .then((r) => r?.result?.value);

const measure = () => js(`(() => {
  const a = document.querySelector("aside");
  const r = a ? a.getBoundingClientRect() : null;
  const handle = document.querySelector('[aria-label="Resize sidebar"]');
  return {
    width: r ? Math.round(r.width) : null,
    collapsedLabel: a ? a.getAttribute("aria-label") : null,
    hasHandle: !!handle,
    handleMin: handle ? handle.getAttribute("aria-valuemin") : null,
    handleMax: handle ? handle.getAttribute("aria-valuemax") : null,
    handleNow: handle ? handle.getAttribute("aria-valuenow") : null,
    railVar: getComputedStyle(document.documentElement).getPropertyValue("--rail-w").trim(),
    savedWidth: (JSON.parse(localStorage.getItem("agent_prefs")||"{}")).railWidth ?? null,
    savedCollapsed: (JSON.parse(localStorage.getItem("agent_prefs")||"{}")).railCollapsed ?? null,
  };
})()`);

const out = [];
const step = async (name, fn) => {
  await fn();
  await sleep(700);
  out.push([name, await measure()]);
};

await call("Page.navigate", { url: "http://localhost:3000/" });
await sleep(6000);
out.push(["1. initial", await measure()]);

// collapse via the header chevron
await step("2. after collapse click", () =>
  js(`document.querySelector('[aria-label="Collapse sidebar"]').click()`));

// expand via the chevron in the icon strip
await step("3. after expand click", () =>
  js(`document.querySelector('[aria-label="Expand sidebar"]').click()`));

// keyboard resize: focus the handle, 5x Shift+ArrowRight = +400 clamped to max 520
await step("4. keyboard widen (5x shift-right)", async () => {
  await js(`document.querySelector('[aria-label="Resize sidebar"]').focus()`);
  for (let i = 0; i < 5; i++) {
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 8 });
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 8 });
  }
});

// Home key jumps to the minimum
await step("5. keyboard Home (min)", async () => {
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
});

// mouse drag the handle to widen it
await step("6. mouse drag +120px", async () => {
  const box = await js(`(() => { const r = document.querySelector('[aria-label="Resize sidebar"]').getBoundingClientRect();
    return {x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2)}; })()`);
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: box.x + 120, y: box.y, button: "left" });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x + 120, y: box.y, button: "left", clickCount: 1 });
});

// persistence across reload
await step("7. after reload", async () => {
  await call("Page.navigate", { url: "http://localhost:3000/" });
  await sleep(5000);
});

// Ctrl+B collapses on desktop (the bug: it used to do nothing)
await step("8. Ctrl+B", async () => {
  await js(`document.body.click()`);
  await call("Input.dispatchKeyEvent", { type: "keyDown", key: "b", code: "KeyB", windowsVirtualKeyCode: 66, modifiers: 2 });
  await call("Input.dispatchKeyEvent", { type: "keyUp", key: "b", code: "KeyB", windowsVirtualKeyCode: 66, modifiers: 2 });
});

await step("9. reload while collapsed", async () => {
  await call("Page.navigate", { url: "http://localhost:3000/" });
  await sleep(5000);
});

for (const [name, m] of out) console.log(name.padEnd(30), JSON.stringify(m));
console.log("\nEXCEPTIONS:", errors.length ? errors.join("\n") : "(none)");

sock.close();
chrome.kill();
process.exit(0);
