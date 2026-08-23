import { describe, it, expect } from "vitest";
import { analyzeDevice } from "../diagnostics";
import type { DeviceData } from "../api";

const mk = (o: Record<string, number>): DeviceData[] =>
  Object.entries(o).map(([key, v]) => ({ key, value: String(v), unit: "" }));

const warns = (l: DeviceData[], nominal = {}) => analyzeDevice(l, nominal).filter((i) => i.tone === "warn");

describe("analyzeDevice — silent when healthy (the core contract)", () => {
  it("balanced healthy site produces NO findings at all", () => {
    const list = mk({
      LoadPhasePowerA: 800, LoadPhasePowerB: 850, LoadPhasePowerC: 780,
      GridVoltageL1: 231, GridVoltageL2: 229, GridVoltageL3: 232, GridFrequency: 50.0,
      BatteryCurrent1: 10, BatteryCurrent2: 11, SOC: 80,
    });
    expect(analyzeDevice(list, { v: 230, hz: 50 })).toEqual([]);
  });
  it("empty data → silence, never a guess", () => {
    expect(analyzeDevice([], { v: 230 })).toEqual([]);
  });
});

describe("phase imbalance", () => {
  it("warns only when the imbalance carries real power (≥2 kW total)", () => {
    const heavy = mk({ LoadPhasePowerA: 2500, LoadPhasePowerB: 300, LoadPhasePowerC: 250 });
    expect(warns(heavy).some((w) => w.title.includes("ไม่สมดุล"))).toBe(true);
    // same shape at kettle-scale power: info at most, no warn
    const light = mk({ LoadPhasePowerA: 700, LoadPhasePowerB: 80, LoadPhasePowerC: 70 });
    expect(warns(light)).toEqual([]);
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

describe("battery channel sharing (relative check — needs no baseline)", () => {
  it("one channel carrying everything → warn", () => {
    const w = warns(mk({ BatteryCurrent1: 40, BatteryCurrent2: 0.3, BatteryPower: 2000, SOC: 60 }));
    expect(w.some((x) => x.title.includes("แชร์โหลด") || x.title.includes("ช่อง"))).toBe(true);
  });
});
