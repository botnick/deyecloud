import { describe, it, expect } from "vitest";
import { clearSkyPsh, effectiveCapacityKw, forecastDayKwh, hourlyKwh, forecast } from "../forecast";

describe("effectiveCapacityKw", () => {
  it("prefers the station's installed kWp", () => expect(effectiveCapacityKw(5.5, 9000)).toBe(5.5));
  it("derives from peak watts when capacity is unknown", () => expect(effectiveCapacityKw(undefined, 8748)).toBeCloseTo(8.748));
  it("0 when neither is known (callers hide the estimate)", () => expect(effectiveCapacityKw(null, null)).toBe(0));
});

describe("clearSkyPsh", () => {
  it("passes through a real astronomical PSH", () => {
    expect(clearSkyPsh({ sun: { psh: 5.3 } } as any)).toBe(5.3);
  });
  it("0 (NOT a regional constant) when the weather payload lacks sun info", () => {
    expect(clearSkyPsh(null)).toBe(0);
    expect(clearSkyPsh({} as any)).toBe(0);
  });
});

describe("forecastDayKwh", () => {
  it("clear day ≈ cap × PSH × 0.80", () => expect(forecastDayKwh({ cond: 1 } as any, 5, 10)).toBeCloseTo(40));
  it("storm days derate hard (< 25% of clear)", () => {
    expect(forecastDayKwh({ cond: 7 } as any, 5, 10)).toBeLessThan(forecastDayKwh({ cond: 1 } as any, 5, 10) * 0.25);
  });
  it("0 without capacity or PSH", () => {
    expect(forecastDayKwh({ cond: 1 } as any, 0, 10)).toBe(0);
    expect(forecastDayKwh({ cond: 1 } as any, 5, 0)).toBe(0);
  });
});

describe("hourlyKwh", () => {
  it("0 when the sun is down", () => expect(hourlyKwh(-5, 1, 10)).toBe(0));
  it("scales with sin(elevation): 90° sun = 2× a 30° sun", () => {
    expect(hourlyKwh(90, 1, 10) / hourlyKwh(30, 1, 10)).toBeCloseTo(2);
  });
});

describe("forecast", () => {
  it("empty when PSH is unknown — never invents a constant", () => {
    expect(forecast({ daily: [{ time: "2026-08-23", cond: 1 }] } as any, 10)).toEqual([]);
  });
  it("one item per weather day when PSH + capacity exist", () => {
    const w = { sun: { psh: 5 }, daily: [{ time: "d1", cond: 1 }, { time: "d2", cond: 7 }] } as any;
    const f = forecast(w, 10);
    expect(f).toHaveLength(2);
    expect(f[0].kwh).toBeGreaterThan(f[1].kwh); // clear beats storm
  });
});
