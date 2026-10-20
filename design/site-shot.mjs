// Full-page screenshots of the static repo site: BASE=… OUT=prefix node design/site-shot.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:47833/";
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--hide-scrollbars"] });
for (const [name, w, h, dpr] of [["desk", 1366, 860, 1], ["phone", 393, 852, 2]]) {
  const p = await b.newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  p.on("requestfailed", (r) => console.log("failed:", r.url()));
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(BASE + (process.env.Q || ""), { waitUntil: "networkidle0" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
  await new Promise((r) => setTimeout(r, 800));
  await p.screenshot({ path: `${process.env.OUT || "site"}-${name}.png`, fullPage: true });
  await p.close();
}
await b.close();
