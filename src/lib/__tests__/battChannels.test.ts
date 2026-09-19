import { describe, it, expect } from "vitest";
import { observedChannelActivity, activeChannels, toSeconds } from "../../worker/battChannels";
import { analyzeDevice } from "../diagnostics";

const NOW = 1_800_000_000; // any epoch seconds
const MAX_AGE = 12 * 60;
const sample = (a: number, b: number) => [{ key: "BatteryCurrent1", value: String(a) }, { key: "BatteryCurrent2", value: String(b) }, { key: "BatteryPower", value: "2000" }];

describe("toSeconds — Deye timestamps come in s or ms", () => {
  it("normalises both units and rejects junk", () => {
    expect(toSeconds(1_800_000_000)).toBe(1_800_000_000);
    expect(toSeconds(1_800_000_000_123)).toBe(1_800_000_000);
    expect(toSeconds("1800000000")).toBe(1_800_000_000);
    expect(toSeconds(0)).toBeNull(); expect(toSeconds(undefined)).toBeNull(); expect(toSeconds("x")).toBeNull();
  });
});

describe("observedChannelActivity — only fresh samples from online devices teach", () => {
  it("fresh online sample: live channels keyed by the device's observation time, not now", () => {
    const obsT = NOW - 120;
    expect(observedChannelActivity(sample(40, 0), { collectionTime: obsT * 1000, deviceState: 1 }, NOW, MAX_AGE)).toEqual({ "1": obsT });
    expect(observedChannelActivity(sample(40, 40), { collectionTime: obsT, deviceState: 1 }, NOW, MAX_AGE)).toEqual({ "1": obsT, "2": obsT });
  });
  it("stale replay (31 days old) with 40 A / 40 A → inadmissible (null), teaches nothing", () => {
    expect(observedChannelActivity(sample(40, 40), { collectionTime: NOW - 31 * 86400, deviceState: 1 }, NOW, MAX_AGE)).toBeNull();
  });
  it("device offline (deviceState 3) → inadmissible even if fresh", () => {
    expect(observedChannelActivity(sample(40, 40), { collectionTime: NOW - 60, deviceState: 3 }, NOW, MAX_AGE)).toBeNull();
  });
  it("missing timestamp → inadmissible", () => {
    expect(observedChannelActivity(sample(40, 40), {}, NOW, MAX_AGE)).toBeNull();
  });
  it("sub-threshold current is not activity", () => {
    expect(observedChannelActivity(sample(0.4, 0), { collectionTime: NOW, deviceState: 1 }, NOW, MAX_AGE)).toEqual({});
  });
});

describe("activeChannels — a known channel never expires", () => {
  it("channels seen long ago are still known; no expiry maps to 'recovered'", () => {
    const seen = { "1": NOW - 10, "2": NOW - 400 * 86400 };
    expect(activeChannels(seen)).toEqual([1, 2]);
    // regression: ch2 known from long ago, STILL zero today while ch1 works → warning persists
    const snap = [{ key: "BatteryCurrent1", value: "40", unit: "A" }, { key: "BatteryCurrent2", value: "0", unit: "A" }, { key: "BatteryPower", value: "2000", unit: "W" }, { key: "SOC", value: "60", unit: "%" }];
    const w = analyzeDevice(snap, {}, { activeBatteryChannels: activeChannels(seen) }).filter((i) => i.tone === "warn");
    expect(w.some((x) => x.title.includes("แชร์โหลด"))).toBe(true);
  });
  it("empty/undefined history → no known channels (diagnostics stay silent)", () => {
    expect(activeChannels(undefined)).toEqual([]);
    expect(activeChannels({})).toEqual([]);
  });
});
