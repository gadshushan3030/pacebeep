// Signs in to the local site and screenshots a page at 2x with headless Chrome (temporary profile).
// usage: PB_EMAIL=… PB_PASSWORD=… node capture-web.mjs <path> <out.png> [width] [colorScheme]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [path = "/", out = "page.png", width = "1280", scheme = "light"] = process.argv.slice(2);
const BASE = "http://localhost:3201";
// The local demo account (see README.md here); never a real one.
const creds = { email: process.env.PB_EMAIL, password: process.env.PB_PASSWORD };

// Session cookie, as the login form would get it.
const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ email: creds.email, password: creds.password }),
});
const cookies = res.headers.getSetCookie().map((c) => c.split(";")[0].split("="));

const profile = mkdtempSync(join(tmpdir(), "pb-chrome-"));
const port = 9333;
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--hide-scrollbars", "about:blank",
]);
let target;
for (let i = 0; i < 50 && !target; i++) {
  await new Promise((r) => setTimeout(r, 200));
  target = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).then((l) => l.find((t) => t.type === "page")).catch(() => null);
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) pending.get(m.id)(m.result), pending.delete(m.id);
});
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

await send("Network.enable");
for (const [name, value] of cookies) await send("Network.setCookie", { name, value, url: BASE });
await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: 900, deviceScaleFactor: 2, mobile: Number(width) < 600 });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
await send("Page.enable");
await send("Page.navigate", { url: BASE + path });
await new Promise((r) => setTimeout(r, 3500)); // page + fonts
// The dev server's corner badge is not part of the site; crop below the content.
const { result } = await send("Runtime.evaluate", {
  expression: "document.querySelectorAll('nextjs-portal').forEach((e) => e.remove()); Math.ceil(document.querySelector('main').getBoundingClientRect().bottom + 56)",
  returnByValue: true,
});
const height = result.value;
const shot = await send("Page.captureScreenshot", {
  format: "png", captureBeyondViewport: true,
  clip: { x: 0, y: 0, width: Number(width), height, scale: 1 },
});
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out}: ${width}x${height} css px at 2x`);
ws.close();
chrome.kill();
