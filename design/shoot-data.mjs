// Capture the current History/"Data" tab (Linux) for side-by-side vs the official app.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = process.env.CHROME || "/usr/bin/google-chrome-stable";
const BASE = process.env.BASE || "http://localhost:5180";
const PIN = process.env.PIN || "2580";
const OUT = "/tmp/deye-shots";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 393, height: Number(process.env.VH || 852), deviceScaleFactor: 2 });

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async (pin) => {
  await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
  try { localStorage.setItem("deye_a2hs_snooze", String(Date.now())); } catch {}
}, PIN);

await page.goto(BASE + "/history", { waitUntil: "networkidle2" });
await sleep(3500); // splash + fetch + settle

async function clickTab(label) {
  const ok = await page.evaluate((lbl) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === lbl);
    if (b) { b.click(); return true; }
    return false;
  }, label);
  await sleep(2500);
  return ok;
}

for (const [label, name] of [["วัน", "day"], ["เดือน", "month"], ["ปี", "year"]]) {
  if (label !== "วัน") await clickTab(label);
  await page.screenshot({ path: `${OUT}/history-${name}.png` });
  console.log("shot", name);
}

await browser.close();
console.log("done →", OUT);
