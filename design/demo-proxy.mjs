// Demo server: serves the built client and forwards /api/* to production unchanged
// (the viewer still logs in with the PIN — no cookie of ours is injected).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const ROOT = new URL("../dist/client/", import.meta.url).pathname;
const UP = process.env.UPSTREAM || "https://solarcell.botnick.me";
const PORT = +(process.env.PORT || 8799);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".json": "application/json", ".webmanifest": "application/manifest+json", ".ico": "image/x-icon" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/")) {
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : await new Promise((ok) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => ok(Buffer.concat(c))); });
    const r = await fetch(UP + url.pathname + url.search, { method: req.method, body, headers: { cookie: req.headers.cookie || "", "content-type": req.headers["content-type"] || "" }, redirect: "manual" });
    const h = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "content-length", "transfer-encoding"].includes(k)) h[k] = v; });
    const sc = r.headers.getSetCookie?.(); if (sc?.length) h["set-cookie"] = sc.map((c) => c.replace(/;\s*Domain=[^;]+/i, ""));
    res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = normalize(join(ROOT, url.pathname)); if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (p.endsWith("/")) p += "index.html";
  try { const b = await readFile(p); res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(200, { "content-type": TYPES[".html"] }); res.end(await readFile(join(ROOT, "index.html"))); }
}).listen(PORT, "127.0.0.1", () => console.log("demo on", PORT));
