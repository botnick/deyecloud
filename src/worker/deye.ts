// Deye Cloud Open API client (https://developer.deyecloud.com)
// Read-only: token, station list, station latest, station history.

export interface Env {
  ASSETS: Fetcher;
  DB: any; // D1Database
  DEYE_BASE_URL: string;
  DEYE_APP_ID: string;
  DEYE_APP_SECRET: string;
  DEYE_EMAIL: string;
  DEYE_PASSWORD: string;
  DEYE_COMPANY_ID?: string;
  DEYE_STATION_ID?: string;
  WEATHER_LAT?: string;
  WEATHER_LON?: string;
  WEATHER_PLACE?: string;
  TMD_BASE?: string;
  TMD_TOKEN?: string;
  CONTACT_EMAIL?: string;
  APP_PIN?: string;
  // Grid nominals for the health checks. Optional and deliberately NOT defaulted:
  // they must describe the site independently of what the inverter is measuring,
  // otherwise a site-wide sag redefines "normal" and hides itself. Unset simply
  // disables the absolute voltage/frequency alarms. e.g. "230" and "50".
  GRID_NOMINAL_V?: string;
  GRID_NOMINAL_HZ?: string;
  // Outbound alerts (see alerts.ts). All optional; unset = no alerts.
  ALERT_WEBHOOK_URL?: string;   // Discord-compatible webhook
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ALERT_SOC_MIN?: string;       // e.g. "20" — battery-low alert threshold (%)
  ALERT_REPEAT_MIN?: string;    // re-send an ongoing alert every N minutes (default 360)
}

// Day key in Thailand local time (UTC+7, no DST). Deye reports "today" energy in
// station-local time and Thai users' clocks are UTC+7, so day boundaries must roll
// at Thai midnight — a plain UTC date would roll at 07:00 local and mis-attribute
// the early-morning hours to the previous day.
export function bkkDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3600 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function metaGet(env: Env, k: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT v FROM meta WHERE k = ?").bind(k).first();
  return row ? row.v : null;
}
async function metaSet(env: Env, k: string, v: string | number) {
  await env.DB.prepare(
    "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v"
  ).bind(k, String(v)).run();
}

// ----- Token lifecycle -----
// Deye tokens last ~60 days; refresh when <1 day remains. Three layers:
//   1. isolate memory  — avoids 2 D1 reads on every API call (hot path)
//   2. D1 meta         — shared across isolates / survives restarts
//   3. login           — POST /account/token with the password. This is the ONLY
//      call that can burn the account's lockout counter ("Incorrect password,
//      N attempt remaining"), so it is guarded by an exponential hold recorded in
//      D1: a wrong secret after a rotation must NOT be retried every cron tick.
// Errors from the login guard carry a marker so batch callers (backfill) can stop
// walking their loop instead of paying the guard's D1 reads once per item.
export const DEYE_AUTH_HOLD = "DEYE_AUTH_HOLD";
function authHoldError(msg: string): Error { const e: any = new Error(msg); e.code = DEYE_AUTH_HOLD; return e; }
export const isAuthHold = (e: any) => !!e && e.code === DEYE_AUTH_HOLD;
// An error envelope that names auth as the reason (token/appId/credentials).
export const isAuthEnvelope = (d: any) =>
  !!d && (d.code === 1006 || d.code === 2002 || /^2101/.test(String(d.code || "")) || /auth|token/i.test(String(d.msg || "")));
let memTok: { token: string; exp: number; at: number } | null = null;
let loginInflight: Promise<string> | null = null; // single-flight: concurrent callers share one login
const LOGIN_HOLD_BASE_S = 60;          // first hold after a failed login
const LOGIN_HOLD_MAX_S = 6 * 3600;     // ceiling; also applied when Deye says ≤2 attempts remain
const MIN_RELOGIN_AGE_S = 600;         // a token this young is not the problem — don't re-login on an error retry
const loginHoldFor = (fails: number, remaining: number | null) =>
  remaining != null && remaining <= 2 ? LOGIN_HOLD_MAX_S : Math.min(LOGIN_HOLD_MAX_S, LOGIN_HOLD_BASE_S * 2 ** Math.max(0, fails - 1));

async function readTokenFromDb(env: Env): Promise<{ token: string; exp: number; at: number } | null> {
  const [t, e, a] = await Promise.all([metaGet(env, "deye_token"), metaGet(env, "deye_token_exp"), metaGet(env, "deye_token_at")]);
  return t ? { token: t, exp: parseInt(e || "0", 10), at: parseInt(a || "0", 10) } : null;
}

// `rejected` = the token Deye just refused (apiPost's retry path). Order of
// preference: (1) memory, (2) D1 — another isolate may already have refreshed,
// (3) a real login — never for a token issued < MIN_RELOGIN_AGE_S ago (the error
// then isn't the token), never while a failure hold is active, and single-flight
// within the isolate.
// `explicitAuth` = Deye named the token as the problem (code 2101019 / "invalid
// token"); a generic ≥400 envelope is only *possibly* an expiry, so for that
// case a young token is left alone.
async function getToken(env: Env, rejected?: string, explicitAuth = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fresh = (t: { token: string; exp: number } | null) => !!t && t.exp > now + 86400 && t.token !== rejected;
  if (fresh(memTok)) return memTok!.token;
  const db = await readTokenFromDb(env);
  if (fresh(db)) { memTok = db; return db!.token; }
  if (rejected && !explicitAuth && db && db.token === rejected && now - db.at < MIN_RELOGIN_AGE_S) {
    throw authHoldError(`Deye rejected a token issued ${now - db.at}s ago — not re-logging in (upstream error, not auth)`);
  }
  if (!loginInflight) {
    loginInflight = login(env, now).finally(() => { loginInflight = null; });
  }
  return loginInflight;
}

async function login(env: Env, now: number): Promise<string> {
  // Honour a hold left by a previous failure.
  const [failsRaw, failAtRaw, failMsg] = await Promise.all([
    metaGet(env, "deye_login_fails"), metaGet(env, "deye_login_fail_at"), metaGet(env, "deye_login_fail_msg"),
  ]);
  const fails = Number(failsRaw) || 0;
  if (fails > 0) {
    const m = /(\d+)\s*attempt/i.exec(failMsg || "");
    const hold = loginHoldFor(fails, m ? Number(m[1]) : null);
    const left = Number(failAtRaw || 0) + hold - now;
    if (left > 0) throw authHoldError(`Deye login on hold ${left}s (${fails} failed attempt(s), last: ${failMsg || "?"}) — check DEYE_* secrets`);
  }

  const url = `${env.DEYE_BASE_URL}/account/token?appId=${env.DEYE_APP_ID}`;
  const body = {
    appSecret: env.DEYE_APP_SECRET,
    email: env.DEYE_EMAIL,
    password: await sha256Hex(env.DEYE_PASSWORD),
    companyId: env.DEYE_COMPANY_ID || "0", // most accounts are "0"; override per account
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000), // never hang the cron/request on a slow Deye
  });
  const data: any = await res.json();
  const token = data.token || data.accessToken;
  if (!token) {
    const msg = String(data.msg || data.message || data.code || res.status);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_login_fails',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(fails + 1)),
      env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_login_fail_at',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(now)),
      env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_login_fail_msg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(msg.slice(0, 200)),
    ]);
    throw authHoldError(`Deye token failed: ${msg}`);
  }

  const ttl = data.expiresIn ? Number(data.expiresIn) : 5184000;
  const stmts = [
    env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_token',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(token),
    env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_token_exp',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(now + ttl)),
    env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_token_at',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(now)),
  ];
  await env.DB.batch(stmts);
  memTok = { token, exp: now + ttl, at: now };
  // A login that *succeeds* does not prove the credentials are right for the API
  // (wrong region/account tokens are issued fine and then rejected). The failure
  // record is cleared only once a real API call succeeds with this token.
  if (fails > 0) loginFailsPending = true;
  return token;
}
let loginFailsPending = false;

// A refreshed token was rejected again: the problem is not token age, and a
// login every call would be an unbounded, lockout-walking loop. Record it as a
// failure so the exponential hold takes over.
async function markRefreshUseless(env: Env, why: string) {
  const now = Math.floor(Date.now() / 1000);
  const fails = Number(await metaGet(env, "deye_login_fails")) || 0;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_login_fails',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(fails + 1)),
    env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_login_fail_at',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(String(now)),
    env.DB.prepare("INSERT INTO meta (k,v) VALUES ('deye_login_fail_msg',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(`token refreshed but still rejected: ${why}`.slice(0, 200)),
  ]);
  loginFailsPending = true;
}

// Login-health snapshot for /api/_health (never triggers a login).
export async function loginStatus(env: Env): Promise<{ fails: number; failAt: number | null; msg: string | null; holdUntil: number | null }> {
  const [failsRaw, failAtRaw, failMsg] = await Promise.all([
    metaGet(env, "deye_login_fails"), metaGet(env, "deye_login_fail_at"), metaGet(env, "deye_login_fail_msg"),
  ]);
  const fails = Number(failsRaw) || 0;
  if (!fails) return { fails: 0, failAt: null, msg: null, holdUntil: null };
  const m = /(\d+)\s*attempt/i.exec(failMsg || "");
  const failAt = Number(failAtRaw || 0);
  return { fails, failAt, msg: failMsg, holdUntil: failAt + loginHoldFor(fails, m ? Number(m[1]) : null) };
}

// Short in-isolate memo for idempotent read endpoints. One cron tick (and one app
// open) asks Deye for the same device list / device snapshot several times within
// seconds; each repeat costs a Deye call + a token read. Memoised per payload for a
// window far shorter than the 5-min poll, so nothing user-visible goes stale.
const MEMO_TTL_MS = 30_000;
const MEMO_PATHS = new Set(["/device/latest", "/station/device", "/station/list"]);
const memo = new Map<string, { at: number; p: Promise<any> }>();

async function apiPost(env: Env, path: string, payload: any): Promise<any> {
  if (!MEMO_PATHS.has(path)) return apiPostLive(env, path, payload);
  const k = path + " " + JSON.stringify(payload || {});
  const hit = memo.get(k);
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.p;
  const p = apiPostLive(env, path, payload);
  memo.set(k, { at: Date.now(), p });
  p.catch(() => memo.delete(k)); // never memoise a failure
  if (memo.size > 64) for (const [mk, mv] of memo) if (Date.now() - mv.at >= MEMO_TTL_MS) memo.delete(mk);
  return p;
}

async function apiPostLive(env: Env, path: string, payload: any): Promise<any> {
  let token = await getToken(env);
  const call = (t: string) =>
    fetch(`${env.DEYE_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "bearer " + t },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(15000), // never hang the cron/request on a slow Deye
    }).then((r) => r.json() as Promise<any>);

  let data = await call(token);
  // Refresh + retry once on an auth signal. Deye surfaces a bad token in (at
  // least) two shapes, neither carrying code:1006:
  //   • expired token  → HTTP 500 `{status:500, exception:"...UndeclaredThrowable..."}`
  //   • invalid token   → `{success:false, code:"2101019", msg:"auth invalid token"}`
  // Without this a long-lived bad token makes the whole app silently serve zeros
  // until the cache is cleared by hand. Generic ≥400 envelopes are still treated
  // as a possible expiry (that IS how expiry presents), but getToken(env,
  // rejected) only re-logs-in when the token is old enough to plausibly be the
  // cause, reuses a token another isolate refreshed, and is single-flight +
  // failure-held — so an unrelated Deye 500 storm cannot hammer the account.
  const isExplicitAuth = (d: any) =>
    !!d && (d.code === 1006 || d.code === 2002 || String(d.code) === "2101019" || /token/i.test(String(d.msg || "")));
  const isAuthFailed = (d: any) => isExplicitAuth(d) || (!!d && typeof d.status === "number" && d.status >= 400);
  if (isAuthFailed(data)) {
    const rejected = token;
    try { token = await getToken(env, rejected, isExplicitAuth(data)); }
    catch (e) { console.warn("deye: no token refresh for error envelope", (e as Error).message); return data; }
    data = await call(token);
    if (isAuthFailed(data) && token !== rejected && memTok && memTok.token === token && Math.floor(Date.now() / 1000) - memTok.at < MIN_RELOGIN_AGE_S) {
      // Fresh token, still rejected → not an expiry. Persist so the hold engages.
      await markRefreshUseless(env, `${data.code || data.status || ""} ${data.msg || ""}`.trim()).catch(() => {});
    }
  }
  const trulyOk = !!data && data.success !== false && !(typeof data.status === "number" && data.status >= 400);
  if (loginFailsPending && trulyOk) {
    loginFailsPending = false;
    await env.DB.prepare("DELETE FROM meta WHERE k IN ('deye_login_fails','deye_login_fail_at','deye_login_fail_msg')").run().catch(() => {});
  }
  return data;
}

let memStationId: string | null = null; // per-isolate — the station never changes mid-life
export async function getStationId(env: Env): Promise<string> {
  // Explicit config wins over the discovered cache, so changing DEYE_STATION_ID
  // takes effect immediately instead of being shadowed by a stale cached id.
  if (env.DEYE_STATION_ID) return String(env.DEYE_STATION_ID);
  if (memStationId) return memStationId;
  const cached = await metaGet(env, "station_id");
  if (cached) { memStationId = cached; return cached; }
  const s = await getStationMeta(env);
  if (s && s.id) { await metaSet(env, "station_id", String(s.id)); memStationId = String(s.id); return memStationId; }
  return "";
}

export interface Latest {
  genPower: number; usePower: number; gridPower: number; battPower: number; soc: number;
  genToday: number; useToday: number; buyToday: number; sellToday: number;
  chargeToday: number; dischargeToday: number; genTotal: number;
  battStatus: string; gridStatus: string; warningStatus: string;
  // false when Deye's day-history call failed: the *Today fields are then unknown
  // (0 placeholders) and must not be persisted as the day's totals.
  totalsOk: boolean;
  selfSufficiency: number; updatedAt: number; raw?: any;
}

export interface Station { id: number; name: string; capacity?: number; lat?: number; lng?: number; status?: string; address?: string; type?: string; }

// Page through a Deye list endpoint until every item is collected (no silent cap).
const PAGE_SIZE = 100;
async function pageAll(env: Env, path: string, base: any, pick: (d: any) => any[]): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= 100; page++) { // hard stop at 10k items — safety, not a real cap
    const d = await apiPost(env, path, { ...base, page, size: PAGE_SIZE });
    const items = pick(d) || [];
    all.push(...items);
    if (items.length < PAGE_SIZE) break;
  }
  return all;
}

// Discover stations the account can see — nothing is hardcoded; accept whichever
// field name the region returns for capacity/coords, and page through them all.
export async function listStations(env: Env): Promise<Station[]> {
  const list = await pageAll(env, "/station/list", {}, (d) => d.stationList || d.list || []);
  return list.map((s: any) => ({
    id: s.id || s.stationId, name: s.name,
    capacity: s.installedCapacity ?? s.capacity ?? s.totalCapacity ?? s.installPower,
    lat: s.locationLat ?? s.lat ?? s.latitude, lng: s.locationLng ?? s.lng ?? s.lon ?? s.longitude,
  }));
}

export async function getStationMeta(env: Env): Promise<Station> {
  // v2 key — drops any older cache that was stored before coords were mapped.
  const cached = await metaGet(env, "station_meta2");
  if (cached) { try { return JSON.parse(cached); } catch {} }
  const list = await listStations(env);
  const picked = (env.DEYE_STATION_ID ? list.find((x) => String(x.id) === String(env.DEYE_STATION_ID)) : null) || list[0] || ({} as Station);
  await metaSet(env, "station_meta2", JSON.stringify(picked));
  return picked;
}

// Open API is the only data source.
export async function getLatest(env: Env, stationId?: string): Promise<Latest> {
  return getLatestOpen(env, stationId);
}

const n = (v: any) => Number(v) || 0;

// Open API splits realtime power (/station/latest) from daily energy
// (/station/history granularity=day). Compose both into one Latest.
// null when the call failed or came back as an error envelope — callers must
// treat "no totals" as unknown, never as zero (a zero day would be written to D1).
async function getDayTotals(env: Env, stationId: string): Promise<any | null> {
  const today = bkkDay();
  const tmr = bkkDay(1);
  const res = await apiPost(env, "/station/history", { stationId: Number(stationId), granularity: 2, startAt: today, endAt: tmr });
  if (!res || res.success === false || (typeof res.status === "number" && res.status >= 400)) return null;
  return (res.stationDataItems && res.stationDataItems[0]) || null;
}

async function getLatestOpen(env: Env, stationId?: string): Promise<Latest> {
  const id = stationId || (await getStationId(env));
  const [latestRes, t] = await Promise.all([
    apiPost(env, "/station/latest", { stationId: Number(id) }),
    getDayTotals(env, id).catch(() => null),
  ]);
  const totalsOk = !!t;
  const tt = t || {};
  // Open API returns the realtime power fields at the TOP LEVEL of the response
  // (no stationDataItems/data wrapper), so fall back to latestRes itself. Throw
  // ONLY on a real error envelope (success:false / HTTP 4xx-5xx) so /api/latest
  // returns 5xx and the cron skips writing — a valid idle reading (success:true,
  // zero values) still passes through.
  const d = (latestRes.stationDataItems && latestRes.stationDataItems[0]) || latestRes.data || latestRes;
  if (latestRes && (latestRes.success === false || (typeof latestRes.status === "number" && latestRes.status >= 400))) {
    throw new Error("station/latest unavailable: " + JSON.stringify(latestRes).slice(0, 160));
  }

  const batt = n(d.batteryPower);            // + discharge, − charge
  const wire = n(d.wirePower ?? d.gridPower ?? d.purchasePower); // + buy, − reverse
  const useToday = n(tt.consumptionValue);
  const buyToday = n(tt.purchaseValue);
  const selfSuff = useToday > 0 ? Math.max(0, Math.min(100, (1 - buyToday / useToday) * 100)) : 0;

  const out: Latest = {
    // accept the common field-name variants across Deye regions/models
    genPower: n(d.generationPower ?? d.pvPower),
    usePower: n(d.consumptionPower ?? d.loadPower),
    gridPower: wire,
    battPower: batt,
    soc: n(d.batterySOC ?? d.batterySoc ?? d.soc),
    genToday: n(tt.generationValue),
    useToday,
    buyToday,
    sellToday: n(tt.gridValue),
    chargeToday: n(tt.chargeValue),
    dischargeToday: n(tt.dischargeValue),
    genTotal: n(tt.generationTotal),
    battStatus: batt > 20 ? "DISCHARGE" : batt < -20 ? "CHARGE" : "STATIC",
    gridStatus: wire >= 0 ? "PURCHASE" : "REVERSE",
    warningStatus: "NORMAL",
    totalsOk,
    selfSufficiency: selfSuff,
    updatedAt: n(d.lastUpdateTime) || Math.floor(Date.now() / 1000),
    raw: d,
  };

  // The home Power-Flow mirrors the Deye app, which reads the inverter's OWN live
  // measure points (these differ from the station aggregate). Override the five
  // instantaneous fields with inverter values when available; daily-energy totals
  // (genToday/useToday/…) stay from station/day-history. Best-effort: station
  // values stand if the device fetch fails. Sign conventions match the station
  // (verified live): battery −=charge/+=discharge, grid +=import/−=export.
  try {
    const inv = await getInverterFlow(env, id);
    if (inv) {
      if (inv.genPower != null) out.genPower = inv.genPower;
      if (inv.usePower != null) out.usePower = inv.usePower;
      if (inv.gridPower != null) { out.gridPower = inv.gridPower; out.gridStatus = inv.gridPower >= 0 ? "PURCHASE" : "REVERSE"; }
      if (inv.battPower != null) { out.battPower = inv.battPower; out.battStatus = inv.battPower > 20 ? "DISCHARGE" : inv.battPower < -20 ? "CHARGE" : "STATIC"; }
      if (inv.soc != null) out.soc = inv.soc;
      if (inv.genTotal != null) out.genTotal = inv.genTotal; // lifetime kWh (not in station API)
    }
  } catch {}
  return out;
}

// Pull the first inverter's live measure points and map the flow-relevant ones.
// SN is cached in D1 (per station) so the extra discovery call only runs once.
async function getInverterSn(env: Env, stationId: string): Promise<string> {
  const ck = "inv_sn_" + stationId;
  const cached = await metaGet(env, ck);
  if (cached) return cached;
  const devs = await listDevices(env, stationId);
  const inv =
    devs.find((x: any) => /INVERTER|HYBRID|STORAGE/i.test(x.deviceType || "")) ||
    devs.find((x: any) => x.deviceType !== "COLLECTOR") || devs[0];
  const sn = inv && (inv.deviceSn || inv.sn);
  if (sn) await metaSet(env, ck, String(sn));
  return sn ? String(sn) : "";
}

async function getInverterFlow(
  env: Env,
  stationId: string
): Promise<{ genPower?: number; usePower?: number; gridPower?: number; battPower?: number; soc?: number; genTotal?: number } | null> {
  const sn = await getInverterSn(env, stationId);
  if (!sn) return null;
  const res = await deviceLatest(env, [sn]);
  const list = ((res.deviceDataList && res.deviceDataList[0]) || {}).dataList || [];
  if (!list.length) return null;
  const num = (k: string) => {
    const r = list.find((x: any) => x.key === k);
    const v = r ? Number(r.value) : NaN;
    return Number.isNaN(v) ? undefined : v;
  };
  return {
    genPower: num("TotalSolarPower"),
    usePower: num("TotalConsumptionPower"),
    gridPower: num("TotalGridPower"),
    battPower: num("BatteryPower"),
    soc: num("SOC"),
    genTotal: num("TotalActiveProduction"),
  };
}

export async function getHistory(env: Env, granularity: number, startAt: string, endAt: string, stationId?: string): Promise<any> {
  const id = stationId || (await getStationId(env));
  return apiPost(env, "/station/history", { stationId: Number(id), granularity, startAt, endAt });
}

// ----- Devices -----
export async function listDevices(env: Env, stationId?: string): Promise<any[]> {
  const id = stationId || (await getStationId(env));
  return pageAll(env, "/station/device", { stationIds: [Number(id)] }, (d) => d.deviceListItems || d.list || d.data || []);
}
export async function deviceLatest(env: Env, sns: string[]): Promise<any> {
  return apiPost(env, "/device/latest", { deviceList: sns });
}
export async function deviceMeasurePoints(env: Env, sn: string): Promise<any> {
  return apiPost(env, "/device/measurePoints", { deviceSn: sn });
}
