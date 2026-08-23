// Robust "effective array size" picker, shared by the worker (robustPeakW) and its
// unit tests so implementation and test can never drift.
//
// Nearest-rank p95 over peaks sorted DESC, but never index 0: with 7–19 samples
// floor(0.05·n) = 0 IS the raw MAX, which defeats the point — so the single
// highest sample is always trimmed once there are ≥2. A lifetime MAX is fragile:
// one spurious spike (clipping glitch, meter hiccup) would inflate every
// forecast forever.
export const PEAK_PERCENTILE = 0.95;
export function pickPeak(rowsDesc: { p: number }[]): number {
  if (rowsDesc.length < 2) return rowsDesc[0]?.p || 0;
  return rowsDesc[Math.min(rowsDesc.length - 1, Math.max(1, Math.floor((1 - PEAK_PERCENTILE) * rowsDesc.length)))].p;
}
