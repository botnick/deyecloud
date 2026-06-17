export interface Latest {
  genPower: number; usePower: number; gridPower: number; battPower: number; soc: number;
  genToday: number; useToday: number; buyToday: number; sellToday: number;
  chargeToday: number; dischargeToday: number; genTotal: number;
  battStatus: string; gridStatus: string; warningStatus: string;
  selfSufficiency: number; updatedAt: number; error?: string;
}

export interface WeatherDay { time: string; tc_max: number; tc_min: number; cond: number; rain: number; rh?: number; swdown?: number | null; }
export interface WeatherHour { time: string; tc: number; cond: number; rain: number; }
export interface SunInfo { rise: string; set: string; noon: string; peakStart: string; peakEnd: string; dayHours: number; psh: number; noonGhi: number; noonElev: number; arc: number[]; }
export interface Weather {
  source: string; place: string; temp: number; humidity: number; cond: number;
  rain: number | null; wind: number | null; uv?: number | null; hourly: WeatherHour[]; daily: WeatherDay[]; sun?: SunInfo; error?: string;
}

export interface Station { id: number; name: string; capacity?: number; lat?: number; lng?: number; status?: string; address?: string; type?: string; }

/** Thrown when the server can't reach the backend (Deye unreachable → 5xx). */
export class ApiError extends Error {
  constructor(public status: number) { super("HTTP " + status); }
}
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  // Network failure rejects the fetch itself; a 5xx means our Worker reached
  // the client but Deye was unreachable. Both surface as a thrown error so the
  // UI can show the offline banner. 4xx (e.g. login 401) passes through as JSON.
  const r = await fetch(path, { credentials: "same-origin", ...opts });
  if (r.status >= 500) throw new ApiError(r.status);
  return r.json() as Promise<T>;
}

export const getSession = () => api<{ authed: boolean }>("/api/session");
export const postLogin = (pin: string) =>
  api<{ ok: boolean; error?: string }>("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
export interface DeviceData { key: string; value: string; unit: string; }
export interface Device { sn: string; type: string; online: boolean; collectionTime: number; collectorSn?: string; dataList: DeviceData[]; error?: string; }

export const getStation = () => api<Station>("/api/station");
export const getStations = () => api<Station[]>("/api/stations");
// `station` is sent only for multi-station accounts; omitting it keeps the
// single-station path identical (server falls back to the default station).
export const getDevice = (station?: number | null) => api<Device>("/api/device" + (station != null ? "?station=" + station : ""));
export const getLatest = (station?: number | null) => api<Latest>("/api/latest" + (station != null ? "?station=" + station : ""));
export const getWeather = () => api<Weather>("/api/weather");
export interface HistTotals { gen: number; use: number; buy: number; sell: number; charge: number; discharge: number; }
export const getHistory = (range: string, date?: string, station?: number | null) =>
  api<{ range: string; points: any[]; totals?: HistTotals | null; source?: string; date?: string }>(
    "/api/history?range=" + range + (date ? "&date=" + date : "") + (station != null ? "&station=" + station : ""));
