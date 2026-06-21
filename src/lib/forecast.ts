import type { Weather, WeatherDay } from "./api";

// Expected PV production for a forecast day, in kWh (หน่วย). Self-calibrating and
// unit-safe:
//   energy ≈ effectiveCapacity(kWp) × clear-sky PSH(h) × skyFactor(by cloud cond)
// • effectiveCapacity = the station's installed kWp, or — when the station never
//   reported it — the best PV power the system has actually produced (peakPower).
//   So it adapts to any real array size with zero hard-coding.
// • clear-sky PSH (peak-sun-hours) is astronomical (from the weather payload's sun
//   info); it changes slowly across a week, so today's value is a fine baseline.
// • skyFactor folds the cloud derate + typical system losses (PR ~0.8) into one
//   factor per sky condition — keyed on the same TMD cond codes used everywhere.
const SKY: Record<number, number> = {
  1: 0.80, 2: 0.72, 12: 0.80, // แจ่มใส / มีเมฆบางส่วน / ร้อนจัด(โปร่ง)
  3: 0.52,                      // เมฆเป็นส่วนมาก
  4: 0.40, 9: 0.40, 10: 0.42, 11: 0.42, // เมฆมาก / หนาว
  5: 0.30, 6: 0.22, 7: 0.15, 8: 0.18,   // ฝนเล็ก→หนัก / ฟ้าคะนอง
};
const skyFactor = (cond: number) => SKY[cond] ?? 0.5;

// Installed kWp if known, else derived from the highest PV watts ever produced.
export function effectiveCapacityKw(capacity?: number | null, peakPowerW?: number | null): number {
  if (capacity && capacity > 0) return capacity;
  if (peakPowerW && peakPowerW > 0) return peakPowerW / 1000;
  return 0;
}

export function forecastDayKwh(day: WeatherDay, pshClear: number, capKw: number): number {
  if (!capKw || !pshClear) return 0;
  return capKw * pshClear * skyFactor(day.cond);
}

// Expected production (kWh) within one hour: panels track the sun, so output ≈
// installed kWp × the clear-sky irradiance fraction sin(sun elevation) × the
// hour's sky factor. Zero when the sun is down.
export function hourlyKwh(elevDeg: number, cond: number, capKw: number): number {
  if (!capKw || elevDeg <= 0) return 0;
  return capKw * Math.sin((elevDeg * Math.PI) / 180) * skyFactor(cond);
}

export interface ForecastItem { time: string; kwh: number; }

// Forecast kWh for each day the weather payload covers (today included).
// Returns [] when capacity is unknown so callers can simply hide the estimate.
export function forecast(weather: Weather | null, capKw: number): ForecastItem[] {
  if (!weather || !capKw) return [];
  const psh = Math.max(3, Math.min(7, weather.sun?.psh || 5)); // clamp to a sane Thai range
  return (weather.daily || []).map((d) => ({ time: d.time, kwh: forecastDayKwh(d, psh, capKw) }));
}
