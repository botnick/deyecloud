import { describe, it, expect } from "vitest";
// The REAL picker the worker uses (src/lib/peak.ts) — no mirrored copy to drift.
import { pickPeak as pick } from "../peak";

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
