// Self-calibration of the production forecast against the site's OWN history.
//
// The physics chain (kWp × clear-sky PSH × sky factor) predicts a *theoretical*
// system; real arrays differ — tilt/azimuth, shading, wiring, inverter clipping,
// dust, heat — so the forecast must be anchored to measured output, not to the
// nameplate. Method: over recent daily totals, the yield-per-sun-hour
// r_d = gen_d / psh_d is highest on the clearest days; the median of the top
// quartile ≈ the site's real clear-sky yield (kWh per PSH-hour). Dividing by the
// clear-sky factor the forecast will multiply back (SKY[1]) turns it into an
// *equivalent capacity* that drops into every existing formula unchanged.
//
// Median-of-top-quartile, not max: robust to a single freak day in both
// directions. Needs at least MIN_DAYS producing days, else calibration is
// reported as unavailable (0) and callers keep the nameplate/peak fallbacks —
// never a guess.
export const CALIB_MIN_DAYS = 7;
export const CALIB_CLEAR_FACTOR = 0.80; // must equal SKY[1] in forecast.ts

export interface CalibInput { gen: number; psh: number; }
export interface Calib { kw: number; days: number; }

export function calibKwFrom(rows: CalibInput[], clearFactor = CALIB_CLEAR_FACTOR): Calib {
  const r = rows.filter((x) => x.gen > 0.1 && x.psh > 0.5).map((x) => x.gen / x.psh).sort((a, b) => b - a);
  if (r.length < CALIB_MIN_DAYS) return { kw: 0, days: r.length };
  const top = r.slice(0, Math.max(3, Math.ceil(r.length / 4)));
  const median = top[Math.floor(top.length / 2)];
  return { kw: median / clearFactor, days: r.length };
}
