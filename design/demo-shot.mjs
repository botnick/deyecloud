// Quick phone screenshot of the home tab of a running instance: BASE=… PIN=… OUT=… node design/demo-shot.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:47811";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
p.on("pageerror", (e) => console.log("pageerror:", e.message)); p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text()); });
await p.setViewport({ width: 393, height: +(process.env.H || 1500), deviceScaleFactor: 2 });
await p.goto(BASE, { waitUntil: "domcontentloaded" });
await p.evaluate(async (pin) => { await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) }); localStorage.setItem("deye_a2hs_snooze", String(Date.now())); }, process.env.PIN);
await p.goto(BASE + (process.env.Q || "/"), { waitUntil: "networkidle2" }).catch(() => {});
await new Promise((r) => setTimeout(r, +(process.env.WAIT || 9000)));
if (process.env.CLICK) {
  await p.evaluate((t) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes(t)); b?.click(); }, process.env.CLICK);
  await new Promise((r) => setTimeout(r, 4000));
}
if (process.env.SCROLLTO) await p.evaluate((t) => { const e = [...document.querySelectorAll("span,div")].find((x) => x.textContent === t); e?.scrollIntoView({ block: "start" }); window.scrollBy(0, -120); }, process.env.SCROLLTO);
await p.screenshot({ path: process.env.OUT || "shot.png" });
await b.close();
