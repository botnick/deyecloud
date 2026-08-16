import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const BASE = process.env.BASE || "http://localhost:5174";
const PIN = "2580";
mkdirSync("design/shots", { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async (pin) => { await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) }); }, PIN);

const scenarios = ["offgrid", "charging", "peak", "fault", "lowbatt", "discharge"];
for (const k of scenarios) {
  await page.goto(`${BASE}/device?sim=${k}`, { waitUntil: "networkidle2" });
  await sleep(2800);
  await page.screenshot({ path: `design/shots/sim-${k}.png` });
  console.log("shot", k);
}
await browser.close();
console.log("done");
