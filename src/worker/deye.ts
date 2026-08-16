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

// Obtain (and cache) an access token. Deye tokens last ~60 days; refresh when <1 day remains.
async function getToken(env: Env, force = false): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (!force) {
    const cached = await metaGet(env, "deye_token");
    const exp = parseInt((await metaGet(env, "deye_token_exp")) || "0", 10);
    if (cached && exp > now + 86400) return cached;
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
  if (!token) throw new Error(`Deye token failed: ${JSON.stringify(data)}`);

  const ttl = data.expiresIn ? Number(data.expiresIn) : 5184000;
  await metaSet(env, "deye_token", token);
  await metaSet(env, "deye_token_exp", String(now + ttl));
  return token;
}

async function apiPost(env: Env, path: string, payload: any): Promise<any> {
  let token = await getToken(env);
  const call = (t: string) =>
    fetch(`${env.DEYE_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "bearer " + t },
      body: JSON.stringify(payload || {}),
      signal: AbortSignal.timeout(15000), // never hang the cron/request on a slow Deye
    }).then((r) => r.json() as Promise<any>);

  let data = await call(token);
  // Refresh + retry once on ANY auth/error envelope. Deye surfaces a bad token in
  // (at least) two shapes, neither carrying code:1006:
  //   • expired token  → HTTP 500 `{status:500, exception:"...UndeclaredThrowable..."}`
  //   • invalid token   → `{success:false, code:"2101019", msg:"auth invalid token"}`
  // Without this a long-lived bad token makes the whole app silently serve zeros
  // until the cache is cleared by hand. The retry is once and only fires on error.
  const authFailed =
    data &&
    ((typeof data.status === "number" && data.status >= 400) || // expired → HTTP 500 envelope
      data.code === 1006 ||
      data.code === 2002 ||
      /auth|token/i.test(String(data.msg || ""))); // invalid → msg:"auth invalid token"
  if (authFailed) {
    token = await getToken(env, true);
    data = await call(token);
  }
  return data;
}

async function getStationId(env: Env): Promise<string> {
  // Explicit config wins over the discovered cache, so changing DEYE_STATION_ID
  // takes effect immediately instead of being shadowed by a stale cached id.
  if (env.DEYE_STATION_ID) return String(env.DEYE_STATION_ID);
  const cached = await metaGet(env, "station_id");
  if (cached) return cached;
  const s = await getStationMeta(env);
  if (s && s.id) { await metaSet(env, "station_id", String(s.id)); return String(s.id); }
  return "";
}

export interface Latest {
  genPower: number; usePower: number; gridPower: number; battPower: number; soc: number;
  genToday: number; useToday: number; buyToday: number; sellToday: number;
  chargeToday: number; dischargeToday: number; genTotal: number;
  battStatus: string; gridStatus: string; warningStatus: string;
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
async function getDayTotals(env: Env, stationId: string): Promise<any> {
  const today = bkkDay();
  const tmr = bkkDay(1);
  const res = await apiPost(env, "/station/history", { stationId: Number(stationId), granularity: 2, startAt: today, endAt: tmr });
  return (res.stationDataItems && res.stationDataItems[0]) || {};
}

async function getLatestOpen(env: Env, stationId?: string): Promise<Latest> {
  const id = stationId || (await getStationId(env));
  const [latestRes, t] = await Promise.all([
    apiPost(env, "/station/latest", { stationId: Number(id) }),
    getDayTotals(env, id).catch(() => ({})),
  ]);
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
  const useToday = n(t.consumptionValue);
  const buyToday = n(t.purchaseValue);
  const selfSuff = useToday > 0 ? Math.max(0, Math.min(100, (1 - buyToday / useToday) * 100)) : 0;

  const out: Latest = {
    // accept the common field-name variants across Deye regions/models
    genPower: n(d.generationPower ?? d.pvPower),
    usePower: n(d.consumptionPower ?? d.loadPower),
    gridPower: wire,
    battPower: batt,
    soc: n(d.batterySOC ?? d.batterySoc ?? d.soc),
    genToday: n(t.generationValue),
    useToday,
    buyToday,
    sellToday: n(t.gridValue),
    chargeToday: n(t.chargeValue),
    dischargeToday: n(t.dischargeValue),
    genTotal: n(t.generationTotal),
    battStatus: batt > 20 ? "DISCHARGE" : batt < -20 ? "CHARGE" : "STATIC",
    gridStatus: wire >= 0 ? "PURCHASE" : "REVERSE",
    warningStatus: "NORMAL",
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
