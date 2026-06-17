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
  rain: number | null; wind: number | null; hourly: WeatherHour[]; daily: WeatherDay[]; sun?: SunInfo; error?: string;
}

export interface Station { id: number; name: string; capacity?: number; lat?: number; lng?: number; status?: string; address?: string; type?: string; }

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, { credentials: "same-origin", ...opts });
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
export const getDevice = () => api<Device>("/api/device");
export const getLatest = () => api<Latest>("/api/latest");
export const getWeather = () => api<Weather>("/api/weather");
export const getHistory = (range: string, date?: string) =>
  api<{ range: string; points: any[]; source?: string; date?: string }>("/api/history?range=" + range + (date ? "&date=" + date : ""));
