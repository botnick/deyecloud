import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
const BASE = process.env.BASE || "http://localhost:5174";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox","--hide-scrollbars","--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.evaluate(async (pin) => { await fetch("/api/login", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ pin }) }); }, "2580");
await page.goto(BASE + "/device", { waitUntil: "networkidle2" });
await sleep(3500);
// open every collapsed accordion (header button sits just before a grid-rows-[0fr] panel)
await page.evaluate(() => {
  document.querySelectorAll('button').forEach((b) => {
    const panel = b.nextElementSibling;
    if (panel && panel.className && panel.className.includes('grid-rows-[0fr]')) b.click();
  });
});
await sleep(1100);
await page.screenshot({ path: "design/shots/device-full.png", fullPage: true });
console.log("done device-full");
await browser.close();
