import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "/usr/bin/google-chrome-stable";
const BASE = process.env.BASE || "http://localhost:5174";
const PIN = "2580";
mkdirSync("design/shots", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async (pin) => {
  await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
}, PIN);

async function shot(name, path, { click, scrollTo, full } = {}) {
  await page.goto(BASE + path, { waitUntil: "networkidle2" });
  await sleep(4500); // real Deye/TMD fetch can be slow
  if (click) {
    await page.evaluate((txt) => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === txt); if (b) b.click(); }, click);
    await sleep(5000);
  }
  if (scrollTo) {
    await page.evaluate((txt) => { const h = [...document.querySelectorAll("h2,h3")].find((e) => e.textContent.includes(txt)); if (h) h.scrollIntoView({ block: "start" }); }, scrollTo);
    await sleep(800);
  }
  await page.screenshot({ path: `design/shots/${name}.png`, fullPage: !!full });
  console.log("shot", name);
}

await shot("real-today", "/today", { scrollTo: "วิเคราะห์" });
await shot("real-device", "/device", { full: true });
await shot("real-hist-month", "/history", { click: "เดือน", scrollTo: "วิเคราะห์" });
await shot("real-hist-year", "/history", { click: "ปี", scrollTo: "วิเคราะห์" });

await browser.close();
console.log("done");
