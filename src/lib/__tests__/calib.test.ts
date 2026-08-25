import { describe, it, expect } from "vitest";
import { calibKwFrom, CALIB_MIN_DAYS, CALIB_CLEAR_FACTOR } from "../calib";
import { forecastDayKwh } from "../forecast";

// A site whose real clear-day yield is 49 kWh at psh 5.6 → per-sun-hour 8.75,
// equivalent capacity 8.75/0.8 ≈ 10.9 kWp — regardless of nameplate.
const day = (gen: number, psh = 5.6) => ({ gen, psh });

it("CALIB_CLEAR_FACTOR stays in lockstep with the forecast's clear-sky factor", () => {
  // forecastDayKwh(clear, psh=1, cap=1) IS the sky factor the calibration divides by
  expect(forecastDayKwh({ cond: 1 } as any, 1, 1)).toBeCloseTo(CALIB_CLEAR_FACTOR);
});

describe("calibKwFrom", () => {
  it("median of top-quartile clear days → equivalent kWp", () => {
    const rows = [
      // clear-ish days
      day(49.6), day(48.7), day(50.1), day(47.9),
      // cloudy days (must NOT drag the calibration down)
      day(30), day(22), day(18), day(25), day(28), day(15), day(33), day(20),
    ];
    const c = calibKwFrom(rows);
    expect(c.days).toBe(12);
    const perSunHour = c.kw * CALIB_CLEAR_FACTOR;
    expect(perSunHour).toBeGreaterThan(48 / 5.6);
    expect(perSunHour).toBeLessThan(51 / 5.6);
  });
  it("robust to one freak spike day", () => {
    const rows = [day(120 /* meter glitch */), day(49), day(50), day(48), day(47), day(46), day(45), day(44)];
    const c = calibKwFrom(rows);
    expect(c.kw * CALIB_CLEAR_FACTOR).toBeLessThan(51 / 5.6); // spike trimmed by median-of-top-quartile
  });
  it("unavailable (0) below the minimum-history gate — callers keep fallbacks", () => {
    const c = calibKwFrom(Array.from({ length: CALIB_MIN_DAYS - 1 }, () => day(49)));
    expect(c.kw).toBe(0);
    expect(c.days).toBe(CALIB_MIN_DAYS - 1);
  });
  it("ignores zero-production and bogus-psh rows", () => {
    const c = calibKwFrom([day(0), { gen: 49, psh: 0 }, day(49)]);
    expect(c.days).toBe(1);
    expect(c.kw).toBe(0);
  });
  it("round-trips with the forecast: clear-day prediction ≈ observed clear-day gen", () => {
    const rows = Array.from({ length: 10 }, (_, i) => day(49 - i)); // best ≈ 49
    const c = calibKwFrom(rows);
    const predictedClearDay = c.kw * 5.6 * CALIB_CLEAR_FACTOR; // forecastDayKwh(cond=1)
    expect(Math.abs(predictedClearDay - 48)).toBeLessThan(2);
  });
});
