import { describe, it, expect } from "vitest";
import { parseMute, isMuted, inCoreWindow } from "../../worker/alerts";

describe("ALERT_MUTE parsing/matching", () => {
  it("exact keys and families", () => {
    const m = parseMute(" offline, deye: ,attention ");
    expect(m).toEqual(["offline", "deye:", "attention"]);
    expect(isMuted("offline", m)).toBe(true);
    expect(isMuted("deye:17813893661175966428136", m)).toBe(true);
    expect(isMuted("attention:โหลดเฟสไม่สมดุล", m)).toBe(true);
    expect(isMuted("no_production", m)).toBe(false);
    expect(isMuted("grid_out", m)).toBe(false);
  });
  it("empty/undefined mutes nothing", () => {
    expect(parseMute(undefined)).toEqual([]);
    expect(isMuted("offline", [])).toBe(false);
  });
});

describe("no_production core window", () => {
  it("trims one hour off both ends of the sun-peak window", () => {
    expect(inCoreWindow("10:00", "09:40", "15:10")).toBe(false); // first hour: haze/low sun
    expect(inCoreWindow("10:41", "09:40", "15:10")).toBe(true);
    expect(inCoreWindow("14:10", "09:40", "15:10")).toBe(true);
    expect(inCoreWindow("14:30", "09:40", "15:10")).toBe(false); // last hour
  });
  it("degenerate short windows never qualify", () => {
    expect(inCoreWindow("12:00", "11:30", "12:30")).toBe(false);
  });
});
