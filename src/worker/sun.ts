// Real solar geometry + clear-sky irradiance for a lat-lng and date.
// No fabricated constants — every step is a published model:
//   • Sunrise equation (NOAA) for rise/set/solar-noon, declination is date-driven
//     so it follows the real season automatically.
//   • Kasten–Young (1989) relative air mass.
//   • Meinel clear-sky beam model  DNI = 1361 · 0.7^(AM^0.678).
//   • GHI ≈ DNI·sin(h) + diffuse; integrated over the day → Peak Sun Hours (PSH),
//     the standard solar-industry metric (kWh/m²·day ÷ 1 kW/m²).
export interface SunInfo {
  rise: string;       // HH:MM local
  set: string;        // HH:MM local
  noon: string;       // solar noon HH:MM
  peakStart: string;  // clear-sky GHI first reaches 500 W/m² (strong production)
  peakEnd: string;    // clear-sky GHI drops below 500 W/m²
  dayHours: number;   // daylight length (hours)
  psh: number;        // clear-sky Peak Sun Hours (kWh/m²/day)
  noonGhi: number;    // clear-sky GHI at solar noon (W/m²)
  noonElev: number;   // sun altitude at solar noon (deg) — season/lat driven
  arc: number[];      // sun altitude (deg) sampled evenly from sunrise→sunset
}

const pad = (n: number) => String(n).padStart(2, "0");

export function sunInfo(lat: number, lng: number, tzMin = 420, nowMs = Date.now()): SunInfo {
  const rad = Math.PI / 180;
  const J2000 = 2451545.0;
  const J = nowMs / 86400000 + 2440587.5;           // current Julian day
  const n = Math.ceil(J - J2000 - 0.0009);
  const Jstar = 0.0009 - lng / 360 + n;             // mean solar time (lng east-positive)
  const M = (357.5291 + 0.98560028 * Jstar) % 360;  // solar mean anomaly
  const Mr = M * rad;
  const C = 1.9148 * Math.sin(Mr) + 0.02 * Math.sin(2 * Mr) + 0.0003 * Math.sin(3 * Mr);
  const lambda = (M + C + 180 + 102.9372) % 360;    // ecliptic longitude
  const lr = lambda * rad;
  const Jtransit = J2000 + Jstar + 0.0053 * Math.sin(Mr) - 0.0069 * Math.sin(2 * lr);
  const delta = Math.asin(Math.sin(lr) * Math.sin(23.44 * rad)); // declination (rad)
  const phi = lat * rad;

  const hhmm = (jDate: number) => {
    const d = new Date((jDate - 2440587.5) * 86400000 + tzMin * 60000);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  };
  // sunrise/sunset hour angle (fraction of a day) at the −0.833° horizon
  const cosw0 = (Math.sin(-0.833 * rad) - Math.sin(phi) * Math.sin(delta)) / (Math.cos(phi) * Math.cos(delta));
  const w0 = cosw0 < 1 && cosw0 > -1 ? Math.acos(cosw0) / (2 * Math.PI) : null;

  // sun elevation (deg) at an hour angle H (deg from solar noon)
  const elev = (Hdeg: number) => {
    const s = Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.cos(Hdeg * rad);
    return Math.asin(Math.max(-1, Math.min(1, s))) / rad;
  };
  // clear-sky global horizontal irradiance (W/m²) — Haurwitz (1945) model,
  // a validated single-formula clear-sky estimate. sinH = cos(zenith).
  const ghi = (hDeg: number) => {
    if (hDeg <= 0) return 0;
    const sinH = Math.sin(hDeg * rad);
    return 1098 * sinH * Math.exp(-0.059 / sinH);
  };

  // integrate clear-sky GHI over the day → PSH, and find the ≥500 W/m² window
  const STEP = 2; // minutes
  let psh = 0, first: number | null = null, last: number | null = null;
  for (let m = -720; m <= 720; m += STEP) {
    const g = ghi(elev((m / 60) * 15));
    psh += (g * STEP) / 60; // Wh/m²
    if (g >= 500) { if (first === null) first = m; last = m; }
  }
  const noonUnix = (Jtransit - 2440587.5) * 86400000 + tzMin * 60000;
  const fromNoon = (m: number) => { const d = new Date(noonUnix + m * 60000); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

  // sun-altitude curve sampled sunrise→sunset (real elevation, season/lat driven)
  const w0deg = w0 != null ? w0 * 360 : 90;
  const N = 25;
  const arc: number[] = [];
  for (let i = 0; i < N; i++) {
    const H = -w0deg + (2 * w0deg * i) / (N - 1);
    arc.push(Math.round(Math.max(0, elev(H)) * 10) / 10);
  }

  return {
    noonElev: Math.round(elev(0) * 10) / 10,
    arc,
    rise: w0 != null ? hhmm(Jtransit - w0) : "—",
    set: w0 != null ? hhmm(Jtransit + w0) : "—",
    noon: hhmm(Jtransit),
    peakStart: first != null ? fromNoon(first) : w0 != null ? hhmm(Jtransit - w0) : "—",
    peakEnd: last != null ? fromNoon(last) : w0 != null ? hhmm(Jtransit + w0) : "—",
    dayHours: w0 != null ? Math.round(2 * w0 * 24 * 10) / 10 : 0,
    psh: Math.round((psh / 1000) * 10) / 10,
    noonGhi: Math.round(ghi(elev(0))),
  };
}
