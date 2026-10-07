// TMD condition codes 1-12 -> Thai text + glass icon name
export const COND: Record<number, [string, string]> = {
  1: ["ท้องฟ้าแจ่มใส", "sun"], 2: ["มีเมฆบางส่วน", "partly"], 3: ["เมฆเป็นส่วนมาก", "cloud"], 4: ["มีเมฆมาก", "cloud"],
  5: ["ฝนตกเล็กน้อย", "rain"], 6: ["ฝนปานกลาง", "rain"], 7: ["ฝนตกหนัก", "rain"], 8: ["ฝนฟ้าคะนอง", "storm"],
  9: ["อากาศหนาวจัด", "cloud"], 10: ["อากาศหนาว", "cloud"], 11: ["อากาศเย็น", "cloud"], 12: ["อากาศร้อนจัด", "sun"],
};
export const isNightAt = (t: string | number) => { const h = new Date(t).getHours(); return h < 6 || h >= 18; };
export const isNightNow = () => { const h = new Date().getHours(); return h < 6 || h >= 18; };

export const condText = (c: number, night = false) => {
  if (night && (c === 1 || c === 12)) return "ท้องฟ้าโปร่ง";
  return (COND[c] || ["ไม่มีข้อมูล", "cloud"])[0];
};
export const DAYLBL = ["วันนี้", "พรุ่งนี้", "มะรืนนี้"];
export const shortDate = (t: string) => new Date(t).toLocaleDateString("th-TH", { weekday: "short" });

// Solar potential from shortwave radiation (W/m²) or fall back to condition
export function solarInfo(cond: number, sw?: number | null): { pct: number; label: string } {
  let p = sw == null ? null : Math.max(0, Math.min(100, Math.round(((sw - 350) / 300) * 100)));
  if (p == null) p = [1, 2, 12].includes(cond) ? 85 : cond === 3 ? 55 : [4, 9, 10, 11].includes(cond) ? 40 : 20;
  return { pct: p, label: p >= 70 ? "ดีมาก" : p >= 45 ? "ดี" : p >= 25 ? "ปานกลาง" : "น้อย" };
}

// "Feels like" (heat index, NOAA Rothfusz) — only meaningful when it's warm and humid;
// otherwise the air temperature is what you feel. Thailand is mostly in this range.
export function feelsLike(t: number, rh: number): number {
  if (!(t >= 27 && rh >= 40)) return t;
  const f = t * 9 / 5 + 32;
  const hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 6.83783e-3 * f * f
    - 5.481717e-2 * rh * rh + 1.22874e-3 * f * f * rh + 8.5282e-4 * f * rh * rh - 1.99e-6 * f * f * rh * rh;
  return (hi - 32) * 5 / 9;
}

// Sky phase from the location's real sunrise/sunset ("HH:MM", local) — falls back to the clock.
export type SkyPhase = "night" | "dawn" | "day" | "golden" | "dusk";
const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
export function skyPhase(now: Date, rise?: string, set?: string): SkyPhase {
  const t = now.getHours() * 60 + now.getMinutes();
  const r = rise ? hm(rise) : 6 * 60, s = set ? hm(set) : 18 * 60;
  if (t < r - 35 || t >= s + 30) return "night";
  if (t < r + 40) return "dawn";
  if (t >= s) return "dusk";
  if (t >= s - 75) return "golden";
  return "day";
}
// Sun position on today's arc: x 0..1 across the sky, elevation in degrees (0 when down).
export function sunPos(now: Date, sun?: { rise?: string; set?: string; arc?: number[] }): { x: number; elev: number } | null {
  if (!sun?.rise || !sun?.set) return null;
  const r = hm(sun.rise), s = hm(sun.set), t = now.getHours() * 60 + now.getMinutes();
  if (s <= r || t < r || t > s) return null;
  const x = (t - r) / (s - r);
  const arc = sun.arc || [];
  if (arc.length < 2) return { x, elev: Math.sin(Math.PI * x) * 60 };
  const i = x * (arc.length - 1), lo = Math.floor(i), hi = Math.min(arc.length - 1, lo + 1);
  return { x, elev: arc[lo] + (arc[hi] - arc[lo]) * (i - lo) };
}
export type SkyWx = "clear" | "partly" | "cloud" | "rain" | "storm";
export const skyWx = (c: number): SkyWx =>
  c === 8 ? "storm" : c >= 5 && c <= 7 ? "rain" : c === 2 ? "partly" : c === 1 || c === 12 ? "clear" : "cloud";
