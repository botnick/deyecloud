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
  DEYE_STATION_ID?: string;
  WEATHER_LAT: string;
  WEATHER_LON: string;
  WEATHER_PLACE?: string;
  TMD_BASE?: string;
  TMD_TOKEN?: string;
  APP_PIN?: string;
  // Internal dashboard API (uses a deyecloud.com login session token, ~60-day).
  // When set, this is the data source and no Deye password is needed.
  DEYE_SESSION_TOKEN?: string;
  DEYE_INTERNAL_BASE?: string;
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
    companyId: "0",
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  const cached = await metaGet(env, "station_id");
  if (cached) return cached;
  const s = await getStationMeta(env);
  if (s && s.id) { await metaSet(env, "station_id", String(s.id)); return String(s.id); }
  return env.DEYE_STATION_ID ? String(env.DEYE_STATION_ID) : "";
}

export interface Latest {
  genPower: number; usePower: number; gridPower: number; battPower: number; soc: number;
  genToday: number; useToday: number; buyToday: number; sellToday: number;
  chargeToday: number; dischargeToday: number; genTotal: number;
  battStatus: string; gridStatus: string; warningStatus: string;
  selfSufficiency: number; updatedAt: number; raw?: any;
}

// ----- Internal dashboard API (session token) -----
export async function internalGet(env: Env, path: string): Promise<any> {
  const base = env.DEYE_INTERNAL_BASE || "https://eu1.deyecloud.com";
  const r = await fetch(base + path, {
    headers: { Authorization: "Bearer " + env.DEYE_SESSION_TOKEN, Accept: "application/json, text/plain, */*" },
  });
  return r.json();
}
async function internalPost(env: Env, path: string, body: any): Promise<any> {
  const base = env.DEYE_INTERNAL_BASE || "https://eu1.deyecloud.com";
  const r = await fetch(base + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.DEYE_SESSION_TOKEN,
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  return r.json();
}

export interface Station { id: number; name: string; capacity?: number; lat?: number; lng?: number; status?: string; address?: string; type?: string; }

// Discover stations the account can see — nothing is hardcoded.
export async function listStations(env: Env): Promise<Station[]> {
  if (!passwordReady(env) && env.DEYE_SESSION_TOKEN) {
    const d = await internalPost(env, "/maintain-s/operating/station/v2/search?page=1&size=50&order.direction=ASC&order.property=name", {});
    return (d.data || []).map((x: any) => {
      const s = x.station || x;
      return { id: s.id, name: s.name, capacity: s.installedCapacity, lat: s.locationLat, lng: s.locationLng, status: s.networkStatus, address: s.locationAddress, type: s.gridInterconnectionType };
    });
  }
  const d = await apiPost(env, "/station/list", { page: 1, size: 10 });
  return (d.stationList || d.list || []).map((s: any) => ({ id: s.id || s.stationId, name: s.name, capacity: s.installedCapacity }));
}

export async function getStationMeta(env: Env): Promise<Station> {
  const cached = await metaGet(env, "station_meta");
  if (cached) { try { return JSON.parse(cached); } catch {} }
  const list = await listStations(env);
  const picked = (env.DEYE_STATION_ID ? list.find((x) => String(x.id) === String(env.DEYE_STATION_ID)) : null) || list[0] || ({} as Station);
  await metaSet(env, "station_meta", JSON.stringify(picked));
  return picked;
}

async function getLatestInternal(env: Env, stationId?: string): Promise<Latest> {
  const id = stationId || (await getStationId(env));
  const d: any = await internalGet(env, `/maintain-s/fast/system/${id}`);
  const wire = String(d.wireStatus || "").toUpperCase();
  const gridMag = Number(d.wirePower || d.buyPower || 0);
  return {
    genPower: Number(d.generationPower || 0),
    usePower: Number(d.usePower || 0),
    gridPower: wire.includes("PURCHASE") ? gridMag : -gridMag,
    battPower: Number(d.batteryPower || 0),
    soc: Number(d.batterySoc || 0),
    genToday: Number(d.generationValue || 0),
    useToday: Number(d.useValue || 0),
    buyToday: Number(d.buyValue || 0),
    sellToday: Number(d.gridValue || 0),
    chargeToday: Number(d.chargeValue || 0),
    dischargeToday: Number(d.dischargeValue || 0),
    genTotal: Number(d.generationUploadTotal || 0),
    battStatus: d.batteryStatus || "STATIC",
    gridStatus: d.wireStatus || "NORMAL",
    warningStatus: d.warningStatus || "NORMAL",
    selfSufficiency: Number(d.selfSufficiencyValue || 0),
    updatedAt: Number(d.lastUpdateTime || Math.floor(Date.now() / 1000)),
  };
}

function passwordReady(env: Env): boolean {
  return !!env.DEYE_PASSWORD && !env.DEYE_PASSWORD.startsWith("PUT_YOUR");
}

export async function getLatest(env: Env, stationId?: string): Promise<Latest> {
  // Open API is the configured primary; fall back to the session-token internal
  // API so the app keeps showing data until a real password is set.
  if (passwordReady(env)) {
    try { return await getLatestOpen(env, stationId); }
    catch (e) { if (!env.DEYE_SESSION_TOKEN) throw e; }
  }
  if (env.DEYE_SESSION_TOKEN) return getLatestInternal(env, stationId);
  return getLatestOpen(env, stationId);
}

const n = (v: any) => Number(v) || 0;

// Open API splits realtime power (/station/latest) from daily energy
// (/station/history granularity=day). Compose both into one Latest.
async function getDayTotals(env: Env, stationId: string): Promise<any> {
  const today = new Date().toISOString().slice(0, 10);
  const tmr = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
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

  return {
    genPower: n(d.generationPower),
    usePower: n(d.consumptionPower),
    gridPower: wire,
    battPower: batt,
    soc: n(d.batterySOC ?? d.batterySoc),
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
}

export async function getHistory(env: Env, granularity: number, startAt: string, endAt: string, stationId?: string): Promise<any> {
  const id = stationId || (await getStationId(env));
  return apiPost(env, "/station/history", { stationId: Number(id), granularity, startAt, endAt });
}

// ----- Devices -----
export async function listDevices(env: Env, stationId?: string): Promise<any[]> {
  const id = stationId || (await getStationId(env));
  if (passwordReady(env) || !env.DEYE_SESSION_TOKEN) {
    const d = await apiPost(env, "/station/device", { page: 1, size: 50, stationIds: [Number(id)] });
    return d.deviceListItems || d.list || d.data || [];
  }
  const d = await internalGet(env, `/maintain-s/power/deye/device/${id}/device-list?deviceType=INVERTER`);
  return d.deviceListItems || d.data || (Array.isArray(d) ? d : []);
}
export async function deviceLatest(env: Env, sns: string[]): Promise<any> {
  return apiPost(env, "/device/latest", { deviceList: sns });
}
export async function deviceMeasurePoints(env: Env, sn: string): Promise<any> {
  return apiPost(env, "/device/measurePoints", { deviceSn: sn });
}
