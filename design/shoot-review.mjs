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

async function shot(name, path, { scrollTo, click } = {}) {
  await page.goto(BASE + path, { waitUntil: "networkidle2" });
  await sleep(3400);
  if (click) {
    await page.evaluate((txt) => {
      const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === txt);
      if (b) b.click();
    }, click);
    await sleep(2600);
  }
  if (scrollTo) {
    await page.evaluate((txt) => {
      const h = [...document.querySelectorAll("h2,h3")].find((e) => e.textContent.includes(txt));
      if (h) h.scrollIntoView({ block: "start" });
    }, scrollTo);
    await sleep(700);
  }
  await page.screenshot({ path: `design/shots/${name}.png`, fullPage: !scrollTo && !click });
  console.log("shot", name);
}

await shot("r-today-peak", "/today?sim=peak", { scrollTo: "วิเคราะห์" });
await shot("r-today-discharge", "/today?sim=discharge", { scrollTo: "วิเคราะห์" });
await shot("r-weather", "/weather");
await shot("r-device", "/device?sim=peak");
await shot("r-history-month", "/history", { click: "เดือน" });

await browser.close();
console.log("done");
