import { describe, it, expect } from "vitest";
import { learnSky, accuracySummary, SKY_PRIOR_WEIGHT, SKY_HALF_LIFE_DAYS } from "../skylearn";
import { DEFAULT_SKY } from "../forecast";

describe("learnSky — site sky factors shrunk toward the regional prior", () => {
  it("no observations → exactly the prior", () => {
    const l = learnSky([]);
    expect(l.sky).toEqual(DEFAULT_SKY); expect(l.days).toBe(0);
  });
  it("a single day barely moves the factor; many days converge on the site's median", () => {
    const one = learnSky([{ cond: 3, ratio: 0.8 }]);
    expect(one.sky[3]).toBeCloseTo((0.8 + SKY_PRIOR_WEIGHT * 0.52) / (1 + SKY_PRIOR_WEIGHT));
    const many = learnSky(Array.from({ length: 30 }, () => ({ cond: 3, ratio: 0.7 })));
    expect(many.sky[3]).toBeGreaterThan(0.68); expect(many.sky[3]).toBeLessThan(0.7);
  });
  it("median, not mean: one freak day can't swing it; bounded to [0.05, 1]", () => {
    const l = learnSky([...Array.from({ length: 9 }, () => ({ cond: 1, ratio: 0.8 })), { cond: 1, ratio: 5 }]);
    expect(l.sky[1]).toBeLessThanOrEqual(1); expect(l.sky[1]).toBeCloseTo(0.8, 1);
    expect(learnSky(Array.from({ length: 20 }, () => ({ cond: 7, ratio: 0 }))).sky[7]).toBeGreaterThanOrEqual(0.05);
  });
  it("unobserved conditions keep the prior; junk rows ignored", () => {
    const l = learnSky([{ cond: 2, ratio: 0.6 }, { cond: NaN, ratio: 0.5 }, { cond: 2, ratio: -1 }]);
    expect(l.sky[7]).toBe(DEFAULT_SKY[7]); expect(l.samples[2]).toBe(1);
  });
  it("recent days outweigh old ones: a season's shift moves the factor", () => {
    // 10 rainy-season days long ago at 0.4, then 6 recent days at 0.8 under the same code
    const old = Array.from({ length: 10 }, (_, i) => ({ cond: 4, ratio: 0.4, ageDays: 40 + i }));
    const recent = Array.from({ length: 6 }, (_, i) => ({ cond: 4, ratio: 0.8, ageDays: i }));
    expect(learnSky([...old, ...recent]).sky[4]).toBeGreaterThan(0.7);
    // equal weights (no half-life) keep the old majority
    expect(learnSky([...old, ...recent], DEFAULT_SKY, SKY_PRIOR_WEIGHT, 0).sky[4]).toBeLessThan(0.45);
  });
  it("a day one half-life old counts half", () => {
    const l = learnSky([{ cond: 3, ratio: 0.9, ageDays: SKY_HALF_LIFE_DAYS }]);
    expect(l.sky[3]).toBeCloseTo((0.5 * 0.9 + SKY_PRIOR_WEIGHT * 0.52) / (0.5 + SKY_PRIOR_WEIGHT));
  });
});

describe("accuracySummary", () => {
  it("score = 100 − WAPE (Σ|err| ÷ Σactual); bias signed", () => {
    const a = accuracySummary([{ day: "a", predicted: 45, actual: 50 }, { day: "b", predicted: 55, actual: 50 }]);
    expect(a.n).toBe(2); expect(a.score).toBe(90); expect(a.bias).toBeCloseTo(0); expect(a.mae).toBeCloseTo(5);
  });
  it("one near-empty day can't zero a month of good days (WAPE, not mean APE)", () => {
    const good = Array.from({ length: 10 }, (_, i) => ({ day: `d${i}`, predicted: 30, actual: 30 }));
    const a = accuracySummary([...good, { day: "x", predicted: 25, actual: 2.1 }]);
    expect(a.score).toBeGreaterThan(90); // mean APE would have scored 0
  });
  it("ignores days with no real production; empty → nulls", () => {
    expect(accuracySummary([{ day: "a", predicted: 10, actual: 0 }]).score).toBeNull();
  });
});
