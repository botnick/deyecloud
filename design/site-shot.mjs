// Full-page screenshots of the built repo site at several widths: BASE=… Q=path OUT=prefix [W=393,768,1024,1440] node design/site-shot.mjs
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:47833/";
const widths = (process.env.W || "393,1366").split(",").map(Number);
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--hide-scrollbars"] });
for (const w of widths) {
  const p = await b.newPage();
  p.on("pageerror", (e) => console.log("pageerror:", e.message));
  p.on("requestfailed", (r) => console.log("failed:", r.url()));
  await p.setViewport({ width: w, height: 900, deviceScaleFactor: w < 500 ? 2 : 1 });
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await p.goto(BASE + (process.env.Q || ""), { waitUntil: "networkidle0" });
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); } scrollTo(0, 0); });
  await new Promise((r) => setTimeout(r, 600));
  const over = await p.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".phones,.table,pre")).slice(0, 5).map((e) => e.tagName + "." + e.className));
  if (over.length) console.log(w, "overflow:", over.join(" "));
  await p.screenshot({ path: `${process.env.OUT || "site"}-${w}.png`, fullPage: true });
  await p.close();
}
await b.close();
