import { describe, it, expect } from "vitest";
import { skyPhase, sunPos, siteMinutes, feelsLike, skyWx } from "../weather";

// 2026-10-08 12:05 Bangkok = 05:05Z. The Date's local zone must not matter.
const at = (bkkHHMM: string) => { const [h, m] = bkkHHMM.split(":").map(Number); return new Date(Date.UTC(2026, 9, 8, h - 7, m)); };
const SUN = { rise: "06:07", set: "18:03", arc: [0, 30, 60, 30, 0] };

describe("sky — site (Bangkok) clock, never the viewer's", () => {
  it("siteMinutes reads UTC+7 regardless of the runtime TZ", () => {
    expect(siteMinutes(at("00:00"))).toBe(0);
    expect(siteMinutes(at("12:05"))).toBe(12 * 60 + 5);
    expect(siteMinutes(at("23:59"))).toBe(23 * 60 + 59);
  });
  it("phases from sunrise/sunset", () => {
    expect(skyPhase(at("03:00"), SUN.rise, SUN.set)).toBe("night");
    expect(skyPhase(at("06:20"), SUN.rise, SUN.set)).toBe("dawn");
    expect(skyPhase(at("12:00"), SUN.rise, SUN.set)).toBe("day");
    expect(skyPhase(at("17:15"), SUN.rise, SUN.set)).toBe("golden");
    expect(skyPhase(at("18:10"), SUN.rise, SUN.set)).toBe("dusk");
    expect(skyPhase(at("19:00"), SUN.rise, SUN.set)).toBe("night");
  });
  it("sun on its arc: noon at the top, down outside rise→set", () => {
    const noon = sunPos(at("12:05"), SUN)!;
    expect(noon.x).toBeCloseTo(0.5, 2); expect(noon.elev).toBeCloseTo(60, 0);
    expect(sunPos(at("05:00"), SUN)).toBeNull();
    expect(sunPos(at("19:00"), SUN)).toBeNull();
  });
});

describe("sky — invalid rise/set never becomes 00:00", () => {
  it("placeholder '—' → no sun, clock-default phases", () => {
    expect(sunPos(at("12:00"), { rise: "—", set: "18:00", arc: SUN.arc })).toBeNull();
    expect(sunPos(at("12:00"), { rise: "06:00", set: "" })).toBeNull();
    expect(skyPhase(at("03:00"), "—", "18:00")).toBe("night");
    expect(skyPhase(at("12:00"), "—", "—")).toBe("day");
    expect(skyPhase(at("12:00"), "25:00", "18:00")).toBe("day");
  });
});

describe("feelsLike / skyWx", () => {
  it("heat index only when warm and humid", () => {
    expect(feelsLike(25, 90)).toBe(25);
    expect(feelsLike(32, 30)).toBe(32);
    expect(feelsLike(32, 70)).toBeGreaterThan(38);
    expect(feelsLike(32, 70)).toBeLessThan(42);
  });
  it("TMD codes → sky weather", () => {
    expect([1, 2, 3, 5, 8, 12].map(skyWx)).toEqual(["clear", "partly", "cloud", "rain", "storm", "clear"]);
  });
});
