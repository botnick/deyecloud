import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "/usr/bin/google-chrome-stable";
const BASE = process.env.BASE || "http://localhost:5180";
const PIN = "2580";
mkdirSync("design/shots", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"],
});
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async (pin) => {
  await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
}, PIN);

for (const sim of ["peak", "discharge"]) {
  await page.goto(`${BASE}/today?sim=${sim}`, { waitUntil: "networkidle2" });
  await sleep(3400);
  // scroll to the วิเคราะห์ heading so the คำแนะนำ card is in frame
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2,h3")].find((e) => e.textContent.includes("วิเคราะห์"));
    if (h) h.scrollIntoView({ block: "start" });
  });
  await sleep(700);
  await page.screenshot({ path: `design/shots/tip-${sim}.png` });
  console.log("shot", sim);
}
await browser.close();
console.log("done");
