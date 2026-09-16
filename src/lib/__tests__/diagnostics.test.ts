import { describe, it, expect } from "vitest";
import { analyzeDevice } from "../diagnostics";
import type { DeviceData } from "../api";

const mk = (o: Record<string, number>): DeviceData[] =>
  Object.entries(o).map(([key, v]) => ({ key, value: String(v), unit: "" }));

const warns = (l: DeviceData[], nominal = {}, ctx = {}) => analyzeDevice(l, nominal, ctx).filter((i) => i.tone === "warn");

describe("analyzeDevice — silent when healthy (the core contract)", () => {
  it("balanced healthy site produces NO findings at all", () => {
    const list = mk({
      RatedPower: 12000, LoadPhasePowerA: 800, LoadPhasePowerB: 850, LoadPhasePowerC: 780,
      GridVoltageL1: 231, GridVoltageL2: 229, GridVoltageL3: 232, GridFrequency: 50.0,
      BatteryCurrent1: 10, BatteryCurrent2: 11, SOC: 80,
    });
    expect(analyzeDevice(list, { v: 230, hz: 50 }, { activeBatteryChannels: [1, 2] })).toEqual([]);
  });
  it("empty data → silence, never a guess", () => {
    expect(analyzeDevice([], { v: 230 })).toEqual([]);
  });
});

describe("phase imbalance — relative to the inverter's per-phase rating", () => {
  it("the real-life false positive: 1.5 kW on one phase of a 12 kW inverter (37 % of phase) → silent", () => {
    const home = mk({ RatedPower: 12000, LoadPhasePowerA: 1491, LoadPhasePowerB: 665, LoadPhasePowerC: 318 });
    expect(analyzeDevice(home).filter((i) => i.title.includes("ไม่สมดุล"))).toEqual([]);
  });
  it("warns when the heavy phase is near its rating (≥80 %) and badly imbalanced", () => {
    const heavy = mk({ RatedPower: 12000, LoadPhasePowerA: 3500, LoadPhasePowerB: 400, LoadPhasePowerC: 300 });
    expect(warns(heavy).some((w) => w.title.includes("ไม่สมดุล"))).toBe(true);
  });
  it("50–80 % of phase rating → info, not warn", () => {
    const mid = mk({ RatedPower: 12000, LoadPhasePowerA: 2500, LoadPhasePowerB: 300, LoadPhasePowerC: 250 });
    const f = analyzeDevice(mid).filter((i) => i.title.includes("ไม่สมดุล"));
    expect(f).toHaveLength(1); expect(f[0].tone).toBe("info");
  });
  it("no RatedPower → no baseline → silent (never inferred)", () => {
    expect(analyzeDevice(mk({ LoadPhasePowerA: 3500, LoadPhasePowerB: 400, LoadPhasePowerC: 300 }))).toEqual([]);
  });
});

describe("grid nominal — configured-or-silent (never inferred from the reading)", () => {
  const sagged = mk({ GridVoltageL1: 200, GridVoltageL2: 201, GridVoltageL3: 199 });
  it("site-wide sag WITHOUT a configured nominal stays silent (no self-defeating inference)", () => {
    expect(warns(sagged)).toEqual([]);
  });
  it("same sag WITH nominal 230 → brownout warning", () => {
    expect(warns(sagged, { v: 230 }).length).toBeGreaterThan(0);
  });
  it("nominal configured + healthy voltage → silent", () => {
    expect(warns(mk({ GridVoltageL1: 230 }), { v: 230 })).toEqual([]);
  });
});

describe("battery channel sharing — only channels known (from history) to carry current", () => {
  const snap = mk({ BatteryCurrent1: -107.8, BatteryCurrent2: 0, BatteryPower: -5600, SOC: 60 });
  it("the real-life false positive: channel 2 is a placeholder that never carried current → silent", () => {
    expect(warns(snap, {}, { activeBatteryChannels: [1] })).toEqual([]);
  });
  it("no history yet → silent (unknown ≠ fault)", () => {
    expect(warns(snap)).toEqual([]);
  });
  it("a channel that DID carry current and now sits idle while the other works → warn", () => {
    const w = warns(mk({ BatteryCurrent1: 40, BatteryCurrent2: 0.3, BatteryPower: 2000, SOC: 60 }), {}, { activeBatteryChannels: [1, 2] });
    expect(w.some((x) => x.title.includes("แชร์โหลด"))).toBe(true);
  });
});
