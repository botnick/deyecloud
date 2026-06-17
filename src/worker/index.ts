// Cloudflare Worker (Hono) — API for the Deye Open API behind a PIN, history in
// D1, realtime polling on a cron schedule. The SPA is served via the ASSETS
// binding (configured by @cloudflare/vite-plugin).
import { Hono } from "hono";
import { getLatest, getHistory, internalGet, listStations, getStationMeta, listDevices, deviceLatest, deviceMeasurePoints, type Env } from "./deye";
import { sunInfo } from "./sun";

// --- Auto-migrate: tables build themselves on first use (no setup step) --
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`,
  `CREATE TABLE IF NOT EXISTS samples (ts INTEGER PRIMARY KEY, gen_power REAL, use_power REAL, grid_power REAL, batt_power REAL, soc REAL, gen_today REAL, use_today REAL)`,
  `CREATE TABLE IF NOT EXISTS daily (day TEXT PRIMARY KEY, gen REAL, use REAL, buy REAL, sell REAL, charge REAL, discharge REAL)`,
  `CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts)`,
];
let schemaReady = false;
async function ensureSchema(env: Env) {
  if (schemaReady) return;
  for (const stmt of SCHEMA) await env.DB.prepare(stmt).run();
  schemaReady = true;
}

// --- Auth (PIN -> signed cookie) ---------------------------------------
async function authToken(env: Env): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.APP_PIN || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("deye-monitor-v1"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function getCookie(req: Request, name: string): string | null {
  const m = (req.headers.get("Cookie") || "").match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? m[1] : null;
}
async function isAuthed(req: Request, env: Env): Promise<boolean> {
  if (!env.APP_PIN) return true;
  return getCookie(req, "deye_auth") === (await authToken(env));
}

// --- Cron poll ---------------------------------------------------------
async function pollAndStore(env: Env) {
  const l = await getLatest(env);
  const ts = Math.floor(Date.now() / 60000) * 60;
  await env.DB.prepare(
    `INSERT INTO samples (ts, gen_power, use_power, grid_power, batt_power, soc, gen_today, use_today) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(ts) DO UPDATE SET gen_power=excluded.gen_power, use_power=excluded.use_power, grid_power=excluded.grid_power,
       batt_power=excluded.batt_power, soc=excluded.soc, gen_today=excluded.gen_today, use_today=excluded.use_today`
  ).bind(ts, l.genPower, l.usePower, l.gridPower, l.battPower, l.soc, l.genToday, l.useToday).run();

  const day = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO daily (day, gen, use, buy, sell, charge, discharge) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET gen=excluded.gen, use=excluded.use, buy=excluded.buy, sell=excluded.sell, charge=excluded.charge, discharge=excluded.discharge`
  ).bind(day, l.genToday, l.useToday, l.buyToday, l.sellToday, l.chargeToday, l.dischargeToday).run();
  return l;
}

// --- Weather: TMD NWP (primary) + Open-Meteo (fallback), cached 30 min --
async function getWeather(env: Env): Promise<any> {
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k='weather_cache2'").first();
  if (row) {
    try { const c = JSON.parse((row as any).v); if (Date.now() - c._at < 30 * 60 * 1000 && c.data && (c.data.error || (c.data.sun && c.data.sun.arc))) return c.data; } catch {}
  }
  const meta = await getStationMeta(env).catch(() => null);
  const lat = String(meta && meta.lat != null ? meta.lat : env.WEATHER_LAT);
  const lng = String(meta && meta.lng != null ? meta.lng : env.WEATHER_LON);
  const place = (meta && (meta.address || meta.name)) || env.WEATHER_PLACE || "";
  let data = await fetchTMD(env, lat, lng, place).catch(() => null);
  if (!data || data.temp == null) {
    const fb = await fetchOpenMeteo(env, lat, lng, place).catch(() => null);
    if (fb && fb.temp != null) data = fb;
  }
  if (!data) data = { error: "weather unavailable" };
  if (data && data.temp != null) data.sun = sunInfo(Number(lat), Number(lng));
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('weather_cache2',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify({ _at: Date.now(), data })).run();
  return data;
}
async function fetchTMD(env: Env, lat: string, lng: string, place: string): Promise<any> {
  if (!env.TMD_TOKEN) return null;
  const base = env.TMD_BASE || "https://data.tmd.go.th/nwpapi/v1/forecast/location";
  const q = `lat=${lat}&lon=${lng}`;
  const opt = { headers: { accept: "application/json", authorization: "Bearer " + env.TMD_TOKEN } };
  const [h, d] = await Promise.all([
    fetch(`${base}/hourly/at?${q}&fields=tc,rh,cond,rain,ws10m&duration=12`, opt).then((r) => r.json() as Promise<any>),
    fetch(`${base}/daily/at?${q}&fields=tc_max,tc_min,rh,cond,rain,swdown&duration=7`, opt).then((r) => r.json() as Promise<any>),
  ]);
  const hf = (h.WeatherForecasts || [])[0]?.forecasts || [];
  const cur = hf[0]?.data || {};
  if (cur.tc == null) return null;
  return {
    source: "tmd", place: place || "พื้นที่ของคุณ",
    temp: cur.tc, humidity: cur.rh, cond: cur.cond, rain: cur.rain,
    wind: cur.ws10m != null ? Math.round(cur.ws10m * 3.6) : null,
    hourly: hf.map((f: any) => ({ time: f.time, tc: f.data.tc, cond: f.data.cond, rain: f.data.rain })),
    daily: ((d.WeatherForecasts || [])[0]?.forecasts || []).map((f: any) => ({ time: f.time, ...f.data })),
  };
}
const wmoToCond = (w: number): number =>
  w === 0 ? 1 : w <= 2 ? 2 : w === 3 ? 4 : w <= 48 ? 4 : w <= 57 ? 5 : w <= 65 ? 6 : w <= 67 ? 7 : w <= 77 ? 4 : w <= 81 ? 6 : w <= 82 ? 7 : w <= 86 ? 4 : 8;
async function fetchOpenMeteo(env: Env, lat: string, lng: string, place: string): Promise<any> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&hourly=temperature_2m,weather_code,precipitation` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,shortwave_radiation_sum` +
    `&timezone=Asia%2FBangkok&forecast_days=7`;
  const j: any = await fetch(url).then((r) => r.json());
  const c = j.current || {};
  const now = Date.now() - 3600 * 1000;
  const H = j.hourly || {};
  const hourly = (H.time || [])
    .map((t: string, i: number) => ({ time: t, tc: H.temperature_2m[i], cond: wmoToCond(H.weather_code[i]), rain: H.precipitation[i] }))
    .filter((x: any) => new Date(x.time).getTime() >= now).slice(0, 12);
  const D = j.daily || {};
  const daily = (D.time || []).map((t: string, i: number) => ({
    time: t, tc_max: D.temperature_2m_max[i], tc_min: D.temperature_2m_min[i],
    cond: wmoToCond(D.weather_code[i]), rain: D.precipitation_sum[i],
    swdown: D.shortwave_radiation_sum ? Math.round((D.shortwave_radiation_sum[i] || 0) * 11.57) : null,
  }));
  return {
    source: "open-meteo", place: place || "พื้นที่ของคุณ",
    temp: c.temperature_2m, humidity: c.relative_humidity_2m, cond: wmoToCond(c.weather_code), rain: 0,
    wind: c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null, hourly, daily,
  };
}

// ===================== Hono app =====================
const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => { await ensureSchema(c.env); await next(); });

app.post("/api/login", async (c) => {
  const env = c.env;
  const { pin } = await c.req.json().catch(() => ({ pin: undefined }));
  if (!env.APP_PIN || pin === env.APP_PIN) {
    const tok = await authToken(env);
    const secure = new URL(c.req.url).protocol === "https:" ? "; Secure" : "";
    c.header("Set-Cookie", `deye_auth=${tok}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=31536000`);
    return c.json({ ok: true });
  }
  return c.json({ ok: false, error: "PIN ไม่ถูกต้อง" }, 401);
});

app.get("/api/session", async (c) => c.json({ authed: await isAuthed(c.req.raw, c.env) }));

// auth gate — applies to every /api/* route registered below
app.use("/api/*", async (c, next) => {
  if (!(await isAuthed(c.req.raw, c.env))) return c.json({ error: "unauthorized" }, 401);
  await next();
});

app.get("/api/stations", async (c) => c.json(await listStations(c.env)));
app.get("/api/station", async (c) => c.json(await getStationMeta(c.env)));

app.get("/api/latest", async (c) => {
  const env = c.env;
  const cached = await env.DB.prepare("SELECT v FROM meta WHERE k='latest_cache'").first();
  if (cached) { try { const cc = JSON.parse((cached as any).v); if (Date.now() - cc._at < 60 * 1000) return c.json(cc.data); } catch {} }
  const l = await getLatest(env);
  delete (l as any).raw;
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('latest_cache',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify({ _at: Date.now(), data: l })).run();
  return c.json(l);
});

app.get("/api/weather", async (c) => c.json(await getWeather(c.env)));

app.get("/api/device", async (c) => {
  const env = c.env;
  const cached = await env.DB.prepare("SELECT v FROM meta WHERE k='device_cache'").first();
  if (cached) { try { const cc = JSON.parse((cached as any).v); if (Date.now() - cc._at < 60 * 1000) return c.json(cc.data); } catch {} }
  const devs = await listDevices(env);
  const inv = devs.find((x: any) => /INVERTER|HYBRID|STORAGE/i.test(x.deviceType || "")) || devs.find((x: any) => x.deviceType !== "COLLECTOR") || devs[0];
  if (!inv) return c.json({ error: "no device" }, 404);
  const sn = inv.deviceSn || inv.sn;
  const res = await deviceLatest(env, [String(sn)]);
  const dd = (res.deviceDataList && res.deviceDataList[0]) || {};
  const collector = devs.find((x: any) => x.deviceType === "COLLECTOR");
  const data = {
    sn, type: inv.deviceType, state: dd.deviceState,
    online: inv.connectStatus === 1 || dd.deviceState === 1,
    collectionTime: dd.collectionTime || inv.collectionTime,
    collectorSn: collector && collector.deviceSn,
    dataList: dd.dataList || [],
  };
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('device_cache',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify({ _at: Date.now(), data })).run();
  return c.json(data);
});

// History pulled LIVE from the Deye station/history API (frame curve for the day,
// daily totals for the month, monthly totals for the year) so charts have real
// data immediately — no waiting for the cron to accumulate. D1 is the fallback.
async function histFromD1(env: Env, range: string) {
  if (range === "day") {
    const start = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    const { results } = await env.DB.prepare("SELECT ts, gen_power, use_power, soc FROM samples WHERE ts>=? ORDER BY ts").bind(start).all();
    return { range, points: results, source: "d1" };
  }
  if (range === "month") {
    const ym = new Date().toISOString().slice(0, 7);
    const { results } = await env.DB.prepare("SELECT day, gen, use, buy, sell FROM daily WHERE day LIKE ? ORDER BY day").bind(ym + "%").all();
    return { range, points: results, source: "d1" };
  }
  const y = new Date().getFullYear();
  const { results } = await env.DB.prepare(
    `SELECT substr(day,1,7) AS month, SUM(gen) gen, SUM(use) use, SUM(buy) buy, SUM(sell) sell FROM daily WHERE day LIKE ? GROUP BY month ORDER BY month`
  ).bind(y + "%").all();
  return { range, points: results, source: "d1" };
}

app.get("/api/history", async (c) => {
  const env = c.env;
  const range = c.req.query("range") || "day";
  if (!["day", "month", "year"].includes(range)) return c.json({ error: "bad range" }, 400);

  const p2 = (n: number) => String(n).padStart(2, "0");
  const dateStr = (c.req.query("date") || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const ref = new Date(dateStr + "T00:00:00Z");
  const y = ref.getUTCFullYear(), mo = ref.getUTCMonth() + 1;

  const ck = `hist_${range}_${dateStr}`;
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k=?").bind(ck).first();
  if (row) { try { const cc = JSON.parse((row as any).v); if (Date.now() - cc._at < 5 * 60 * 1000) return c.json(cc.data); } catch {} }

  let data: any;
  try {
    if (range === "day") {
      const res = await getHistory(env, 1, dateStr, dateStr);
      const points = (res.stationDataItems || []).filter((x: any) => x.timeStamp).map((x: any) => ({
        ts: x.timeStamp, gen_power: x.generationPower ?? 0, use_power: x.consumptionPower ?? 0,
        grid_power: x.wirePower ?? x.gridPower ?? 0, batt_power: x.batteryPower ?? 0, soc: x.batterySOC ?? null,
      }));
      data = { range, date: dateStr, points, source: "deye" };
    } else if (range === "month") {
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const res = await getHistory(env, 2, `${y}-${p2(mo)}-01`, `${y}-${p2(mo)}-${p2(last)}`);
      const points = (res.stationDataItems || []).map((x: any) => ({
        day: `${x.year}-${p2(x.month)}-${p2(x.day)}`, gen: x.generationValue ?? 0, use: x.consumptionValue ?? 0, buy: x.purchaseValue ?? 0, sell: x.gridValue ?? 0,
      }));
      data = { range, date: dateStr, points, source: "deye" };
    } else {
      const res = await getHistory(env, 3, `${y}-01`, `${y}-12`);
      const points = (res.stationDataItems || []).map((x: any) => ({
        month: `${x.year}-${p2(x.month)}`, gen: x.generationValue ?? 0, use: x.consumptionValue ?? 0, buy: x.purchaseValue ?? 0, sell: x.gridValue ?? 0,
      }));
      data = { range, date: dateStr, points, source: "deye" };
    }
    if (!data.points || !data.points.length) { const fb = await histFromD1(env, range); if (fb.points && fb.points.length) data = fb; }
  } catch {
    data = await histFromD1(env, range);
  }
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(ck, JSON.stringify({ _at: Date.now(), data })).run();
  return c.json(data);
});

// Generic allow-listed proxy (used only if a session token is configured).
app.get("/api/deye", async (c) => {
  const env = c.env;
  if (!env.DEYE_SESSION_TOKEN) return c.json({ error: "no session token" }, 503);
  const p = c.req.query("p") || "";
  if (!/^\/(maintain-s|operating-s|weather-s|dmm-s|message-s|user-s|power-s)\//.test(p)) return c.json({ error: "path not allowed" }, 400);
  return c.json(await internalGet(env, p));
});

app.get("/api/_debug", async (c) => c.json(await getLatest(c.env)));
app.get("/api/_hist", async (c) => {
  const env = c.env;
  const today = new Date().toISOString().slice(0, 10);
  const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return c.json({ day: await getHistory(env, 2, today, tmr), frame: await getHistory(env, 1, today, today) });
});
app.get("/api/_poll", async (c) => c.json(await pollAndStore(c.env)));
app.get("/api/_dev", async (c) => {
  const env = c.env;
  const devs = await listDevices(env);
  const inv = devs.find((x: any) => /INVERTER|HYBRID|STORAGE/i.test(x.deviceType || "")) || devs.find((x: any) => x.deviceType !== "COLLECTOR") || devs[0];
  const sn = inv && (inv.deviceSn || inv.sn);
  const mp = sn ? await deviceMeasurePoints(env, String(sn)).catch(() => null) : null;
  return c.json({ inverter: inv, measurePointsSample: mp });
});

app.onError((err, c) => c.json({ error: String(err && (err as any).message ? (err as any).message : err) }, 500));

// SPA fallback (most non-API requests are served by the assets layer first).
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch: app.fetch,
  async scheduled(_event: any, env: Env, ctx: { waitUntil(p: Promise<any>): void }) {
    ctx.waitUntil(ensureSchema(env).then(() => pollAndStore(env)).catch((e) => console.error("poll failed", e)));
  },
};
