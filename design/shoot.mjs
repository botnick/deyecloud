import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { mkdirSync } from "node:fs";

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find(existsSync);
const BASE = process.env.BASE || "http://localhost:5174";
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

// authenticate by hitting the login API in-origin (sets the cookie)
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async (pin) => {
  await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
}, PIN);

const views = [
  ["home", "/"],
  ["today", "/today"],
  ["weather", "/weather"],
  ["device", "/device"],
  ["history", "/history"],
];

for (const [name, path] of views) {
  await page.goto(BASE + path, { waitUntil: "networkidle2" });
  await sleep(3200); // splash (1.7s) + data fetch + settle
  await page.screenshot({ path: `design/shots/${name}.png` });
  console.log("shot", name);
}

await browser.close();
console.log("done");
