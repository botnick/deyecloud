// Learn the site's own sky factors from day-ahead forecasts vs. actual production.
//
// The forecast is  kWh ≈ capKw × PSH × sky[cond].  capKw is already calibrated from
// clear days (lib/calib.ts); the sky factors were fixed regional constants. Every
// completed day gives one observation  ratio_d = actual / (capKw × PSH)  under the
// TMD condition that was forecast for it — so per condition we can replace the
// constant with what THIS site really does under that forecast (which also folds
// in the local forecaster's bias). Estimator: weighted median per cond, shrunk
// toward the prior with pseudo-count K so a couple of freak days can't swing it:
//     factor = (W·median + K·prior) / (W + K),   W = Σ weights
// Each day's weight halves every SKY_HALF_LIFE_DAYS: what a forecast code means
// here drifts with the season (a rainy-season "cloudy" gave far less than an
// October "cloudy"), and equal weights let months-old days hold the factor back.
// Backtest on this site's 23 judged days (Sep–Oct 2026): score 70 → 74 %, bias
// −5.8 → −4.3 kWh/day versus equal weights.
// Conditions never observed keep the prior. Bounded to [0.05, 1] — a factor > 1
// would mean "more than a clear sky", i.e. capKw is stale, not the sky.
import { DEFAULT_SKY, skyFactor } from "./forecast";

export const SKY_PRIOR_WEIGHT = 1.5;
export const SKY_HALF_LIFE_DAYS = 14;
export interface SkyObs { cond: number; ratio: number; ageDays?: number; }
export interface LearnedSky { sky: Record<number, number>; samples: Record<number, number>; days: number; }

export function learnSky(obs: SkyObs[], prior: Record<number, number> = DEFAULT_SKY, k = SKY_PRIOR_WEIGHT, halfLife = SKY_HALF_LIFE_DAYS): LearnedSky {
  const by = new Map<number, { v: number; w: number }[]>();
  for (const o of obs) {
    if (!Number.isFinite(o.ratio) || o.ratio < 0 || !Number.isFinite(o.cond)) continue;
    const age = Number.isFinite(o.ageDays) ? Math.max(0, o.ageDays!) : 0;
    const w = halfLife > 0 ? Math.pow(0.5, age / halfLife) : 1;
    (by.get(o.cond) || by.set(o.cond, []).get(o.cond)!).push({ v: Math.min(1.2, o.ratio), w });
  }
  const sky: Record<number, number> = { ...prior };
  const samples: Record<number, number> = {};
  let days = 0;
  for (const [cond, arr] of by) {
    arr.sort((a, b) => a.v - b.v);
    const total = arr.reduce((a, x) => a + x.w, 0);
    let run = 0, median = arr[arr.length - 1].v;
    for (const x of arr) { run += x.w; if (run >= total / 2) { median = x.v; break; } }
    const p = skyFactor(cond, prior);
    sky[cond] = Math.max(0.05, Math.min(1, (total * median + k * p) / (total + k)));
    samples[cond] = arr.length;
    days += arr.length;
  }
  return { sky, samples, days };
}

// Headline accuracy over evaluated days: 100 − WAPE score, signed bias and MAE.
export interface AccRow { day: string; predicted: number; actual: number; }
export interface Accuracy { n: number; score: number | null; bias: number | null; mae: number | null; }
export function accuracySummary(rows: AccRow[]): Accuracy {
  const r = rows.filter((x) => Number.isFinite(x.predicted) && Number.isFinite(x.actual) && x.actual > 0.5);
  if (!r.length) return { n: 0, score: null, bias: null, mae: null };
  // Score is 100 − WAPE (Σ|error| ÷ Σactual): errors weighted by the energy at stake. A plain mean
  // of per-day % errors lets one near-empty day (2 kWh actual vs 25 forecast = 1,100 %) wipe out a
  // month of good days; WAPE is the standard production-forecast metric and has no such cliff.
  let err = 0, abs = 0, act = 0;
  for (const x of r) { const e = x.predicted - x.actual; err += e; abs += Math.abs(e); act += x.actual; }
  return { n: r.length, score: Math.round(Math.max(0, 1 - abs / act) * 100), bias: err / r.length, mae: abs / r.length };
}
