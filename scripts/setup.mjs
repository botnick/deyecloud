#!/usr/bin/env node
/**
 * One-command production setup for Cloudflare Workers.
 *
 *   1) npm install
 *   2) npx wrangler login           (browser login, once)
 *   3) fill secrets in .dev.vars     (DEYE_APP_SECRET, DEYE_PASSWORD, APP_PIN, TMD_TOKEN)
 *   4) npm run setup                 ← this script: D1 + secrets + deploy, automatically
 *
 * Idempotent — safe to re-run. Tables auto-create on first request (ensureSchema),
 * so no manual schema step is needed.
 */
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";

const DB_NAME = "deye-monitor";
const W = "npx wrangler";
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

const cap = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const show = (cmd) => execSync(cmd, { stdio: "inherit" });
const log = (m) => console.log("\x1b[36m▸\x1b[0m " + m);
const ok = (m) => console.log("\x1b[32m✓\x1b[0m " + m);
const die = (m) => { console.error("\x1b[31m✗ " + m + "\x1b[0m"); process.exit(1); };

// 1) Cloudflare auth ---------------------------------------------------------
try { cap(`${W} whoami`); }
catch { die("ยังไม่ได้ล็อกอิน Cloudflare — รัน `npx wrangler login` ก่อน แล้วค่อย `npm run setup`"); }
ok("ล็อกอิน Cloudflare แล้ว");

// 2) D1 database — find or create, then write the real id into wrangler.jsonc -
let dbId;
let out = "";
try { out = cap(`${W} d1 info ${DB_NAME}`); } catch { out = ""; }
let m = out.match(UUID);
if (m && m[0] !== PLACEHOLDER) {
  dbId = m[0];
  ok(`พบ D1 "${DB_NAME}" แล้ว`);
} else {
  log(`สร้าง D1 "${DB_NAME}"...`);
  try { out = cap(`${W} d1 create ${DB_NAME}`); } catch (e) { out = (e.stdout || "") + (e.stderr || ""); }
  m = out.match(UUID);
  if (!m || m[0] === PLACEHOLDER) { try { m = cap(`${W} d1 info ${DB_NAME}`).match(UUID); } catch {} }
  if (!m) die("อ่าน database_id ไม่ได้ — ลองรัน `npx wrangler d1 create deye-monitor` เองแล้วใส่ id ลง wrangler.jsonc");
  dbId = m[0];
  ok(`สร้าง D1 แล้ว (id ${dbId.slice(0, 8)}…)`);
}
let cfg = readFileSync("wrangler.jsonc", "utf8");
if (cfg.includes(PLACEHOLDER)) {
  writeFileSync("wrangler.jsonc", cfg.replace(PLACEHOLDER, dbId));
  ok("ใส่ database_id ลง wrangler.jsonc แล้ว");
} else {
  log("wrangler.jsonc มี database_id อยู่แล้ว");
}

// 3) Secrets — push everything in .dev.vars via `secret bulk` (no value is echoed) -
if (!existsSync(".dev.vars")) die(".dev.vars ไม่พบ — ใส่ DEYE_APP_SECRET / DEYE_PASSWORD / APP_PIN / TMD_TOKEN ก่อน");
const secrets = {};
for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
  const mm = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (mm) secrets[mm[1]] = mm[2].replace(/^["']|["']$/g, "");
}
if (!Object.keys(secrets).length) die("ไม่พบ secret ใน .dev.vars");
const tmp = ".secrets.tmp.json";
writeFileSync(tmp, JSON.stringify(secrets));
try {
  log(`ตั้งค่า secret ${Object.keys(secrets).length} ตัว (${Object.keys(secrets).join(", ")})...`);
  show(`${W} secret bulk ${tmp}`);
  ok("ตั้งค่า secret แล้ว");
} finally {
  rmSync(tmp, { force: true });
}

// 4) Build + deploy ----------------------------------------------------------
log("build + deploy...");
show("npm run deploy");
console.log("\n\x1b[32m✓ เสร็จ! แอพขึ้น Cloudflare Workers แล้ว — เปิด URL ที่ wrangler แสดงด้านบนได้เลย\x1b[0m");
console.log("  อัปเดตครั้งต่อไป: \x1b[36mnpm run deploy\x1b[0m   ·   ดู log: \x1b[36mnpm run tail\x1b[0m");
