// Learn the site's own sky factors from day-ahead forecasts vs. actual production.
//
// The forecast is  kWh ≈ capKw × PSH × sky[cond].  capKw is already calibrated from
// clear days (lib/calib.ts); the sky factors were fixed regional constants. Every
// completed day gives one observation  ratio_d = actual / (capKw × PSH)  under the
// TMD condition that was forecast for it — so per condition we can replace the
// constant with what THIS site really does under that forecast (which also folds
// in the local forecaster's bias). Estimator: median per cond, shrunk toward the
// prior with pseudo-count K so a couple of freak days can't swing it:
//     factor = (n·median + K·prior) / (n + K)
// Conditions never observed keep the prior. Bounded to [0.05, 1] — a factor > 1
// would mean "more than a clear sky", i.e. capKw is stale, not the sky.
import { DEFAULT_SKY, skyFactor } from "./forecast";

export const SKY_PRIOR_WEIGHT = 3;
export interface SkyObs { cond: number; ratio: number; }
export interface LearnedSky { sky: Record<number, number>; samples: Record<number, number>; days: number; }

export function learnSky(obs: SkyObs[], prior: Record<number, number> = DEFAULT_SKY, k = SKY_PRIOR_WEIGHT): LearnedSky {
  const by = new Map<number, number[]>();
  for (const o of obs) {
    if (!Number.isFinite(o.ratio) || o.ratio < 0 || !Number.isFinite(o.cond)) continue;
    (by.get(o.cond) || by.set(o.cond, []).get(o.cond)!).push(Math.min(1.2, o.ratio));
  }
  const sky: Record<number, number> = { ...prior };
  const samples: Record<number, number> = {};
  let days = 0;
  for (const [cond, arr] of by) {
    arr.sort((a, b) => a - b);
    const median = arr[Math.floor(arr.length / 2)];
    const p = skyFactor(cond, prior);
    sky[cond] = Math.max(0.05, Math.min(1, (arr.length * median + k * p) / (arr.length + k)));
    samples[cond] = arr.length;
    days += arr.length;
  }
  return { sky, samples, days };
}

// Headline accuracy over evaluated days: MAPE-style score and signed bias.
export interface AccRow { day: string; predicted: number; actual: number; }
export interface Accuracy { n: number; score: number | null; bias: number | null; mae: number | null; }
export function accuracySummary(rows: AccRow[]): Accuracy {
  const r = rows.filter((x) => Number.isFinite(x.predicted) && Number.isFinite(x.actual) && x.actual > 0.5);
  if (!r.length) return { n: 0, score: null, bias: null, mae: null };
  let ape = 0, err = 0, abs = 0;
  for (const x of r) { const e = x.predicted - x.actual; ape += Math.abs(e) / x.actual; err += e; abs += Math.abs(e); }
  return { n: r.length, score: Math.round(Math.max(0, 1 - ape / r.length) * 100), bias: err / r.length, mae: abs / r.length };
}
