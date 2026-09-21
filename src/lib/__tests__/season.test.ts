import { describe, it, expect } from "vitest";
import { monthStats, bestWorst, seasonSummary, yearOverYear, projectYear, daysInMonth } from "../season";

const rows = (o: Record<number, number>, y = 2026) => Object.entries(o).map(([m, gen]) => ({ month: `${y}-${String(m).padStart(2, "0")}`, gen }));
const TODAY = "2026-09-21";

describe("monthStats", () => {
  it("normalises to kWh/day; running month uses completed days and is flagged partial; future months null", () => {
    const s = monthStats(rows({ 8: 1550, 9: 800 }), 2026, TODAY);
    expect(s[7].perDay).toBeCloseTo(50); expect(s[7].partial).toBe(false);
    expect(s[8].days).toBe(20); expect(s[8].perDay).toBeCloseTo(40); expect(s[8].partial).toBe(true);
    expect(s[9].perDay).toBeNull(); expect(s[0].perDay).toBeNull();
  });
  it("daysInMonth handles leap years", () => { expect(daysInMonth(2028, 2)).toBe(29); expect(daysInMonth(2026, 2)).toBe(28); });
});

describe("bestWorst / seasons", () => {
  it("picks completed months only; seasons weight by days", () => {
    const s = monthStats(rows({ 3: 1860, 4: 1500, 7: 1240, 8: 1240, 9: 900 }), 2026, TODAY); // Mar 60/d, Apr 50/d, Jul 40, Aug 40
    const bw = bestWorst(s)!;
    expect(bw.best.m).toBe(3); expect(bw.worst.m).toBe(7);
    const se = seasonSummary(s);
    expect(se.find((x) => x.season === "hot")!.perDay).toBeCloseTo(3360 / 61);
    expect(se.find((x) => x.season === "cool")!.perDay).toBeNull();
  });
});

describe("yearOverYear", () => {
  it("compares only months both years have, excluding the running month", () => {
    const cur = monthStats(rows({ 7: 1240, 8: 1550, 9: 800 }), 2026, TODAY);
    const prev = monthStats(rows({ 7: 1240, 8: 1240, 12: 1000 }, 2025), 2025, TODAY);
    const y = yearOverYear(cur, prev)!;
    expect(y.months).toBe(2);
    expect(y.pct).toBe(Math.round(((40 + 50) - (40 + 40)) / 80 * 100));
  });
});

describe("projectYear", () => {
  const psh = [4.6, 5.2, 5.8, 6.0, 5.6, 5.2, 5.0, 5.0, 4.9, 4.8, 4.6, 4.4];
  it("actual so far + last-year months where known, else PSH-scaled observed rate", () => {
    const cur = monthStats(rows({ 7: 1240, 8: 1550, 9: 800 }), 2026, TODAY); // Jul 40/d, Aug 50/d, Sep partial 40/d
    const prev = monthStats(rows({ 10: 1395 }, 2025), 2025, TODAY);            // Oct last year 45/d
    const p = projectYear(cur, prev, psh, 2026, TODAY)!;
    expect(p.actual).toBeCloseTo(1240 + 1550 + 800);
    expect(p.basis.fromLastYear).toBe(1);       // Oct
    expect(p.basis.fromGeometry).toBe(3);       // Sep rest, Nov, Dec
    const obsPerDay = (1240 + 1550) / 62, obsPsh = (5.0 + 5.0) / 2;
    const expected = 45 * 31 + obsPerDay * (4.9 / obsPsh) * 10 + obsPerDay * (4.6 / obsPsh) * 30 + obsPerDay * (4.4 / obsPsh) * 31;
    expect(p.estimated).toBeCloseTo(expected, 0);
  });
  it("null until a full month is observed", () => {
    expect(projectYear(monthStats(rows({ 9: 800 }), 2026, TODAY), null, psh, 2026, TODAY)).toBeNull();
  });
});
