#!/usr/bin/env node
/**
 * Deye relay — a tiny forwarder for when Deye's CloudFront refuses Cloudflare
 * Workers addresses (it 403s every Workers egress since 2026-10-15, whatever the
 * headers). Run it on any always-on machine whose address Deye accepts, publish
 * it over HTTPS, and set DEYE_RELAY_URL in wrangler.jsonc to that address: the
 * Worker still calls Deye directly first and only goes through here when it gets
 * the CloudFront block page.
 *
 *   node scripts/deye-relay.mjs            (DEYE_* from env or .dev.vars; PORT env, default 47812)
 *
 * Forwards POST /account/token, /station/*, /device/* to DEYE_BASE_URL and
 * nothing else. Callers must send x-relay-key = sha256("deye-relay:" + DEYE_APP_SECRET),
 * which the Worker derives from the secret it already holds — no new secret.
 * It never logs request or response bodies (they carry the password hash and tokens).
 */
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";

const readOpt = (rel) => { try { return readFileSync(new URL(rel, import.meta.url), "utf8"); } catch { return ""; } };
const vars = Object.fromEntries(
  readOpt("../.dev.vars").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const wr = readOpt("../wrangler.jsonc");
const BASE = process.env.DEYE_BASE_URL || vars.DEYE_BASE_URL || /"DEYE_BASE_URL":\s*"([^"]+)"/.exec(wr)?.[1];
const SECRET = process.env.DEYE_APP_SECRET || vars.DEYE_APP_SECRET;
if (!BASE || !SECRET) { console.error("deye-relay: DEYE_BASE_URL / DEYE_APP_SECRET missing"); process.exit(1); }
const KEY = Buffer.from(createHash("sha256").update("deye-relay:" + SECRET).digest("hex"));
const PORT = Number(process.env.PORT) || 47812;
const ALLOW = /^\/(account\/token|station\/[A-Za-z]+|device\/[A-Za-z]+)(\?[A-Za-z0-9=&_.-]*)?$/;
const MAX_BODY = 64 * 1024;

const keyOk = (k) => { const b = Buffer.from(String(k || "")); return b.length === KEY.length && timingSafeEqual(b, KEY); };

createServer((req, res) => {
  const end = (code, msg) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify({ success: false, code: "relay", msg: `relay: ${msg}` })); };
  if (req.method === "GET" && req.url === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
  if (req.method !== "POST" || !ALLOW.test(req.url || "")) return end(404, "not found");
  if (!keyOk(req.headers["x-relay-key"])) return end(401, "bad key");
  const chunks = []; let size = 0;
  req.on("data", (c) => { size += c.length; if (size > MAX_BODY) { req.destroy(); return; } chunks.push(c); });
  req.on("end", async () => {
    const t0 = Date.now();
    try {
      const up = await fetch(BASE + req.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) },
        body: Buffer.concat(chunks),
        signal: AbortSignal.timeout(15000),
      });
      const body = Buffer.from(await up.arrayBuffer());
      res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/json" });
      res.end(body);
      console.log(`${new Date().toISOString()} ${req.url.split("?")[0]} ${up.status} ${Date.now() - t0}ms`);
    } catch (e) {
      console.log(`${new Date().toISOString()} ${req.url.split("?")[0]} upstream error ${e.name}`);
      end(502, "upstream unreachable");
    }
  });
}).listen(PORT, "127.0.0.1", () => console.log(`deye-relay on 127.0.0.1:${PORT} → ${BASE}`));
