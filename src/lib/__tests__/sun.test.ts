import { describe, it, expect, vi } from "vitest";
import { sunInfo } from "../../worker/sun";
import { bkkHour, bkkClock, bkkToday } from "../format";

// Bangkok, fixed dates — NOAA/Haurwitz outputs must stay inside tight physical
// bands. A silent numeric regression here is exactly what these tests exist for.
const BKK = { lat: 13.75, lng: 100.5 };
const atUTC = (iso: string) => new Date(iso).getTime();
const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

describe("sunInfo (Bangkok)", () => {
  it("equinox (2026-03-20): ~12h day, rise/set near 06:00/18:00 local", () => {
    const s = sunInfo(BKK.lat, BKK.lng, 420, atUTC("2026-03-20T05:00:00Z"));
    expect(s.dayHours).toBeGreaterThan(11.7);
    expect(s.dayHours).toBeLessThan(12.4);
    expect(Math.abs(mins(s.rise) - 6 * 60)).toBeLessThan(35);
    expect(Math.abs(mins(s.set) - 18 * 60)).toBeLessThan(35);
  });
  it("august: PSH in the physical clear-sky band, noon sun high", () => {
    const s = sunInfo(BKK.lat, BKK.lng, 420, atUTC("2026-08-23T05:00:00Z"));
    expect(s.psh).toBeGreaterThan(4);
    expect(s.psh).toBeLessThan(8);
    expect(s.noonElev).toBeGreaterThan(60);
    expect(s.noonGhi).toBeGreaterThan(700);
    expect(s.noonGhi).toBeLessThan(1100);
  });
  it("peak window sits inside daylight and brackets solar noon", () => {
    const s = sunInfo(BKK.lat, BKK.lng, 420, atUTC("2026-08-23T05:00:00Z"));
    expect(mins(s.peakStart)).toBeGreaterThan(mins(s.rise));
    expect(mins(s.peakEnd)).toBeLessThan(mins(s.set));
    expect(mins(s.peakStart)).toBeLessThan(mins(s.noon));
    expect(mins(s.peakEnd)).toBeGreaterThan(mins(s.noon));
  });
  it("december day is shorter than june day (season follows declination)", () => {
    const dec = sunInfo(BKK.lat, BKK.lng, 420, atUTC("2026-12-21T05:00:00Z"));
    const jun = sunInfo(BKK.lat, BKK.lng, 420, atUTC("2026-06-21T05:00:00Z"));
    expect(dec.dayHours).toBeLessThan(jun.dayHours);
  });
});

describe("Bangkok clock helpers (viewer-timezone independence)", () => {
  it("bkkClock renders +07:00 wall time from a UTC timestamp", () => {
    // 2026-08-23T05:30:00Z = 12:30 Bangkok
    expect(bkkClock(atUTC("2026-08-23T05:30:00Z") / 1000)).toBe("12:30");
  });
  it("bkkHour crosses midnight correctly", () => {
    // 17:30Z = 00:30 BKK next day
    expect(bkkHour(atUTC("2026-08-23T17:30:00Z") / 1000)).toBeCloseTo(0.5);
  });
  it("bkkToday straddles the BKK day boundary at a month end (fake clock)", () => {
    vi.useFakeTimers();
    try {
      // 2026-08-31T16:30:00Z = 23:30 BKK Aug 31 — still the 31st in Bangkok
      vi.setSystemTime(new Date("2026-08-31T16:30:00Z"));
      expect(bkkToday()).toBe("2026-08-31");
      // one hour later, 17:30Z = 00:30 BKK Sep 1 — Bangkok has rolled the month
      vi.setSystemTime(new Date("2026-08-31T17:30:00Z"));
      expect(bkkToday()).toBe("2026-09-01");
    } finally { vi.useRealTimers(); }
  });
});
