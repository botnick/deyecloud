import { describe, it, expect } from "vitest";
import { monthStats, bestWorst, seasonSummary, yearOverYear, projectYear, daysInMonth } from "../season";

// rows: {month: gen} with full coverage unless a [gen, days] tuple is given
const rows = (o: Record<number, number | [number, number]>, y = 2026) => Object.entries(o).map(([m, v]) => {
  const [gen, days] = Array.isArray(v) ? v : [v, daysInMonth(y, Number(m))];
  return { month: `${y}-${String(m).padStart(2, "0")}`, gen, days };
});
const TODAY = "2026-09-21";

describe("monthStats — coverage-aware rates", () => {
  it("rate over covered days; running month excludes today (numerator AND divisor)", () => {
    // Sep: 21 rows incl. today; 20 completed days × 40 + today 40 so far
    const s = monthStats(rows({ 8: 1240, 9: [840, 21] }), 2026, TODAY, 40);
    expect(s[7].perDay).toBeCloseTo(40); expect(s[7].complete).toBe(true);
    expect(s[8].running).toBe(true); expect(s[8].coverage).toBe(20); expect(s[8].perDay).toBeCloseTo(40);
    expect(s[9].perDay).toBeNull();
  });
  it("first of the month: no completed day → no rate (nothing invented)", () => {
    const s = monthStats(rows({ 9: [30, 1] }), 2026, "2026-09-01", 30);
    expect(s[8].perDay).toBeNull(); expect(s[8].coverage).toBe(0);
  });
  it("running month without todayGen → rate unknown, not guessed", () => {
    expect(monthStats(rows({ 9: [840, 21] }), 2026, TODAY, null)[8].perDay).toBeNull();
  });
  it("a past month with one stored day is NOT complete, but its rate is honest (over 1 day)", () => {
    const s = monthStats(rows({ 8: [40, 1] }), 2026, TODAY);
    expect(s[7].perDay).toBeCloseTo(40); expect(s[7].complete).toBe(false);
  });
  it("verified zero month (coverage>0, gen 0) keeps rate 0; absent month is null", () => {
    const s = monthStats(rows({ 7: 1240, 8: [0, 31] }), 2026, TODAY);
    expect(s[7].perDay).toBe(0); expect(s[7].complete).toBe(true);
    expect(s[5].perDay).toBeNull();
  });
});

describe("bestWorst / seasons / YoY use complete months only", () => {
  it("a verified-zero August is the worst month, not dropped", () => {
    const s = monthStats(rows({ 7: 1240, 8: [0, 31] }), 2026, TODAY);
    const bw = bestWorst(s)!; expect(bw.best.m).toBe(7); expect(bw.worst.m).toBe(8);
    expect(seasonSummary(s).find((x) => x.season === "rainy")!.days).toBe(62);
  });
  it("partial months are excluded from baselines", () => {
    const s = monthStats(rows({ 3: 1860, 4: 1500, 8: [40, 1] }), 2026, TODAY);
    expect(bestWorst(s)!.worst.m).toBe(4);
    expect(seasonSummary(s).find((x) => x.season === "rainy")!.perDay).toBeNull();
  });
  it("YoY only over months complete in BOTH years", () => {
    const cur = monthStats(rows({ 7: 1240, 8: 1550, 9: [800, 21] }), 2026, TODAY, 40);
    const prev = monthStats(rows({ 7: 1240, 8: [620, 15], 12: 1000 }, 2025), 2025, TODAY);
    const y = yearOverYear(cur, prev)!;
    expect(y.months).toBe(1); expect(y.pct).toBe(0);
  });
});

describe("projectYear — recorded actual + estimate strictly after today", () => {
  const psh = [4.6, 5.2, 5.8, 6.0, 5.6, 5.2, 5.0, 5.0, 4.9, 4.8, 4.6, 4.4];
  it("today's production is counted once (as recorded), remaining days start tomorrow", () => {
    const cur = monthStats(rows({ 8: 1240, 9: [840, 21] }), 2026, TODAY, 40); // Aug 40/d complete; Sep 20 days ×40 + today 40
    const p = projectYear(cur, null, psh, 2026, TODAY)!;
    expect(p.actual).toBeCloseTo(2080);
    const obs = 40, ratio = (m: number) => psh[m - 1] / psh[7];
    const expected = obs * ratio(9) * (30 - 21) + obs * ratio(10) * 31 + obs * ratio(11) * 30 + obs * ratio(12) * 31;
    expect(p.estimated).toBeCloseTo(expected, 0);
    expect(p.total).toBeCloseTo(2080 + expected, 0);
  });
  it("a one-day August (mid-month install) is not a baseline: projection waits for a complete month", () => {
    const cur = monthStats(rows({ 8: [40, 1], 9: [800, 21] }), 2026, TODAY, 40);
    expect(projectYear(cur, null, psh, 2026, TODAY)).toBeNull();
  });
  it("last year's month is used only when complete", () => {
    const cur = monthStats(rows({ 8: 1240, 9: [840, 21] }), 2026, TODAY, 40);
    const prev = monthStats(rows({ 10: [450, 10], 11: 1350 }, 2025), 2025, TODAY); // Oct partial (ignored), Nov complete 45/d
    const p = projectYear(cur, prev, psh, 2026, TODAY)!;
    expect(p.basis.fromLastYear).toBe(1); expect(p.basis.fromGeometry).toBe(3);
  });
});
