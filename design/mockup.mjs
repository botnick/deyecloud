// Capture every page + key states, wrap each in a phone mockup, build a hero banner.
//   node design/mockup.mjs   (needs dev server on 5174)
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
const BASE = process.env.BASE || "http://localhost:5174";
const PIN = "2580";
const OUT = "docs/shots";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 120000,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
});

const app = await browser.newPage();
await app.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
await app.goto(BASE, { waitUntil: "domcontentloaded" });
await app.evaluate(async (pin) => {
  await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
}, PIN);

// privacy: never expose the real station name / serials in public shots
const MASK = [
  ["โซร่าบ้านคุณนิก", "ระบบโซลาร์"],
  ["บ้านคุณนิก", "ระบบโซลาร์"],
];
async function capture(path, { hideDev = false } = {}) {
  await app.goto(BASE + path, { waitUntil: "networkidle2" });
  // wait past the 1.7s splash until real content (beyond the header) has rendered
  try {
    await app.waitForFunction(() => document.body && document.body.innerText.replace(/\s+/g, "").length > 180, { timeout: 14000 });
  } catch {}
  await sleep(1800); // count-up numbers + chart/flow animations settle
  if (hideDev) {
    await app.addStyleTag({ content: ".fixed.z-50.rounded-full{display:none!important}" });
  }
  await app.evaluate((pairs) => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const ns = [];
    while (w.nextNode()) ns.push(w.currentNode);
    for (const n of ns) for (const [a, b] of pairs) if (n.nodeValue.includes(a)) n.nodeValue = n.nodeValue.split(a).join(b);
  }, MASK);
  await sleep(150);
  return await app.screenshot({ type: "png" });
}

const frame = await browser.newPage();
await frame.setViewport({ width: 620, height: 1140, deviceScaleFactor: 2 });
const FRAME_HTML = (b64) => `<!doctype html><html><head><meta charset="utf8"><style>
  html,body{margin:0;padding:0;background:transparent}
  .stage{display:inline-block;padding:60px 60px 86px}
  .phone{position:relative;width:393px;height:852px;background:#0c0b12;border:14px solid #0c0b12;
    border-radius:60px;box-shadow:0 44px 80px -22px rgba(58,28,92,.5),0 20px 40px -18px rgba(0,0,0,.42),
    inset 0 0 0 2px #2b2833}
  .screen{position:absolute;inset:0;border-radius:46px;overflow:hidden;background:#000}
  .screen img{width:393px;height:852px;display:block}
  .island{position:absolute;top:13px;left:50%;transform:translateX(-50%);width:110px;height:30px;
    background:#0c0b12;border-radius:18px;z-index:2}
</style></head><body><div class="stage"><div class="phone">
  <div class="screen"><img src="data:image/png;base64,${b64}"></div><div class="island"></div>
</div></div></body></html>`;

async function makeMock(buf, name) {
  await frame.setContent(FRAME_HTML(buf.toString("base64")), { waitUntil: "load" });
  const el = await frame.$(".stage");
  const out = `${OUT}/${name}.png`;
  await el.screenshot({ path: out, omitBackground: true });
  console.log("mock", name);
  return out;
}

// Device page is intentionally excluded — it exposes inverter serials/model/specs.
const pages = [
  ["home", "/"],
  ["today", "/today"],
  ["weather", "/weather"],
  ["history", "/history"],
];
const pageMocks = [];
for (const [name, path] of pages) pageMocks.push(await makeMock(await capture(path), name));

// Energy-flow diagram per scenario (the part that visually differs by state).
async function captureFlow(key) {
  await app.setViewport({ width: 393, height: 1500, deviceScaleFactor: 2 });
  await app.goto(`${BASE}/?sim=${key}`, { waitUntil: "networkidle2" });
  try {
    await app.waitForFunction(() => [...document.querySelectorAll("h2")].some((e) => e.textContent.includes("พลังงานตอนนี้")), { timeout: 14000 });
  } catch {}
  await sleep(1500);
  await app.addStyleTag({ content: "*{animation:none!important;transition:none!important}" }); // freeze flow anim for a clean clip
  await sleep(200);
  const box = await app.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((e) => e.textContent.includes("พลังงานตอนนี้"));
    const c = h && h.nextElementSibling;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  if (box) {
    await app.screenshot({ path: `${OUT}/flow-${key}.png`, clip: box });
    console.log("flow", key);
  }
}
const flows = ["peak", "charging", "discharge", "offgrid", "buy"];
for (const k of flows) await captureFlow(k);

await browser.close();

// Hero banner: the 5 page mockups in a row, scaled to a common height.
const H = 760;
const imgs = await Promise.all(
  pageMocks.map(async (p) => {
    const m = await sharp(p).metadata();
    const w = Math.round((m.width * H) / m.height);
    const buf = await sharp(p).resize({ height: H }).png().toBuffer();
    return { buf, w };
  })
);
const GAP = -28; // slight overlap so the row reads as a set
let x = 0;
const composites = imgs.map(({ buf, w }) => {
  const c = { input: buf, left: Math.max(0, x), top: 0 };
  x += w + GAP;
  return c;
});
const totalW = x - GAP;
await sharp({ create: { width: totalW, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(composites)
  .png()
  .toFile(`${OUT}/banner.png`);
console.log("banner", totalW + "x" + H);
console.log("done");
