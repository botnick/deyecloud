import { describe, it, expect } from "vitest";

// Mirror of robustPeakW's nearest-rank pick (src/worker/index.ts) — kept in sync
// by this test's comments; the worker function itself needs a D1 env. The
// property under test: the single highest sample is ALWAYS trimmed at n ≥ 2.
const PEAK_PERCENTILE = 0.95;
const pick = (rows: { p: number }[]) =>
  rows.length < 2 ? (rows[0]?.p || 0)
  : rows[Math.min(rows.length - 1, Math.max(1, Math.floor((1 - PEAK_PERCENTILE) * rows.length)))].p;

const desc = (...v: number[]) => v.sort((a, b) => b - a).map((p) => ({ p }));

describe("robust peak pick (nearest-rank p95, spike-trimmed)", () => {
  it("empty → 0, single sample → itself", () => {
    expect(pick([])).toBe(0);
    expect(pick(desc(8000))).toBe(8000);
  });
  it("n=7..19: one 20 kW spike among 8 kW days is trimmed (was the regression)", () => {
    expect(pick(desc(20000, 8100, 8000, 7900, 7800, 7700, 7600))).toBe(8100);
  });
  it("n=2: still trims the max", () => {
    expect(pick(desc(20000, 8000))).toBe(8000);
  });
  it("n=100: exact nearest-rank p95 (index 5)", () => {
    const rows = desc(...Array.from({ length: 100 }, (_, i) => 10000 - i * 10));
    expect(pick(rows)).toBe(rows[5].p);
  });
});
