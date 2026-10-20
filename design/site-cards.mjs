// Element screenshots of app cards for the project site: PIN=… OUT=dir node design/site-cards.mjs
// Each shot: open a tab (bottom-nav label), optionally click a button, find the card whose heading
// starts with `text` and capture that card. Never shoot the device page (serials).
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE || "http://127.0.0.1:47811";
const OUT = process.env.OUT || "shots";
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const SHOTS = [
  { name: "accuracy", tab: "อากาศ", text: "ความแม่นยำพยากรณ์" },
  { name: "forecast", tab: "อากาศ", text: "คาดการณ์การผลิตไฟ" },
  { name: "month", tab: "ย้อนหลัง", click: "เดือน", text: "เดือนนี้" },
  { name: "analysis", tab: "วันนี้", text: "วิเคราะห์" },
  { name: "saved", tab: "หน้าหลัก", text: "เดือนนี้ประหยัดแล้ว" },
  { name: "selfuse", tab: "วันนี้", text: "พึ่งพาไฟตัวเอง" },
];
const b = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--hide-scrollbars", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await b.newPage();
await p.setViewport({ width: 393, height: 852, deviceScaleFactor: 2 });
await p.goto(BASE, { waitUntil: "domcontentloaded" });
await p.evaluate(async (pin) => { await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) }); localStorage.setItem("deye_a2hs_snooze", String(Date.now())); }, process.env.PIN);
await p.goto(BASE + "/", { waitUntil: "networkidle2" }).catch(() => {});
await new Promise((r) => setTimeout(r, 6000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const s of SHOTS.filter((x) => !ONLY || ONLY.includes(x.name))) {
  await p.evaluate((t) => { const n = [...document.querySelectorAll("nav button, nav a")].find((x) => x.textContent.trim() === t); n?.click(); }, s.tab);
  await sleep(3500);
  if (s.click) { await p.evaluate((t) => { const n = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === t); n?.click(); }, s.click); await sleep(3500); }
  const ok = await p.evaluate((t) => {
    document.querySelectorAll("[data-shot]").forEach((e) => e.removeAttribute("data-shot"));
    const leaf = [...document.querySelectorAll("body *")].filter((x) => x.textContent.trim().startsWith(t) && x.textContent.trim().length < t.length + 40).pop();
    if (!leaf) return false;
    let e = leaf.tagName === "H2" ? leaf.nextElementSibling : leaf;
    while (e && e !== document.body) { const cs = getComputedStyle(e); if (parseFloat(cs.borderTopLeftRadius) >= 12 && e.getBoundingClientRect().width >= 300 && cs.backgroundColor !== "rgba(0, 0, 0, 0)") break; e = e.parentElement; }
    if (!e || e === document.body) return false;
    e.setAttribute("data-shot", "1"); e.scrollIntoView({ block: "center" }); return true;
  }, s.text);
  if (!ok) { console.log("miss", s.name); continue; }
  await sleep(1200);
  const el = await p.$("[data-shot]");
  await el.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log("ok", s.name);
}
await b.close();
