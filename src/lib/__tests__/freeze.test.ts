import { describe, it, expect } from "vitest";
import { isFrozenReading, observedAtOf, composeObservedAt } from "../freeze";

const NOW = 1_790_000_000, STALE = 720;
describe("isFrozenReading — freshness of the value source, independent of monotonicity", () => {
  it("fresh reading → stored", () => expect(isFrozenReading(NOW - 60, NOW, STALE).frozen).toBe(false));
  it("exactly at the window edge → still stored", () => expect(isFrozenReading(NOW - STALE, NOW, STALE).frozen).toBe(false));
  it("4-day-old reading → frozen, even if it 'advanced' by 5 min since last poll", () => {
    const r = isFrozenReading(NOW - 4 * 86400 + 300, NOW, STALE);
    expect(r.frozen).toBe(true); expect(r.reason).toContain("min ago");
  });
  it("no observation timestamp → cannot prove freshness → frozen", () => {
    expect(isFrozenReading(null, NOW, STALE).frozen).toBe(true);
    expect(isFrozenReading(0, NOW, STALE).frozen).toBe(true);
  });
});

describe("observedAtOf — oldest contributing source bounds freshness", () => {
  const S = 1_790_000_000, D = 1_789_650_000; // station fresh, device 4 days old
  it("full inverter override → device time only", () => expect(observedAtOf([{ used: false, ts: S }, { used: true, ts: D }])).toBe(D));
  it("no override (device contributed nothing) → station time only", () => expect(observedAtOf([{ used: true, ts: S }, { used: false, ts: null }])).toBe(S));
  it("partial override → the OLDER of both (4-day-old device drags a fresh station record to stale)", () => {
    expect(observedAtOf([{ used: true, ts: S }, { used: true, ts: D }])).toBe(D);
  });
  it("a contributing source without a timestamp → unprovable (null)", () => {
    expect(observedAtOf([{ used: true, ts: S }, { used: true, ts: null }])).toBeNull();
  });
  it("nothing contributed → null", () => expect(observedAtOf([{ used: false, ts: S }])).toBeNull());
});

describe("composeObservedAt — actual Latest composition cases", () => {
  const S = 1_790_000_000, OLD = 1_789_650_000; // fresh vs 4 days old
  const full = (ts: number, extra: Partial<import("../freeze").InvFlow> = {}) => ({ genPower: 4000, usePower: 900, gridPower: -3000, battPower: 100, soc: 75, observedAt: ts, ...extra });
  it("old station + fresh inverter with ALL 4 powers + SOC, NO lifetime point → fresh (lifetime is not instantaneous)", () => {
    expect(composeObservedAt(full(S), OLD, true)).toBe(S);
  });
  it("old station + fresh inverter powers, SOC absent on BOTH → fresh (absent SOC contributes nothing)", () => {
    expect(composeObservedAt(full(S, { soc: undefined }), OLD, false)).toBe(S);
  });
  it("old station + fresh inverter powers, SOC absent on inverter but known on station → station contributes → old", () => {
    expect(composeObservedAt(full(S, { soc: undefined }), OLD, true)).toBe(OLD);
  });
  it("fresh station + 4-day-old device that only has SOC → device contributes → old", () => {
    expect(composeObservedAt({ soc: 75, observedAt: OLD }, S, true)).toBe(OLD);
  });
  it("fresh station + device with no mapped field (e.g. only BatteryRatedCapacity) → station only → fresh", () => {
    expect(composeObservedAt({ observedAt: null }, S, true)).toBe(S);
    expect(composeObservedAt(null, S, true)).toBe(S);
  });
  it("zero values are real contributions (gen 0 at night from the inverter counts as inverter-sourced)", () => {
    expect(composeObservedAt(full(S, { genPower: 0, gridPower: 0, battPower: 0 }), OLD, true)).toBe(S);
  });
  it("partial override with a timestamp-less device → unprovable", () => {
    expect(composeObservedAt({ genPower: 4000, observedAt: null }, S, true)).toBeNull();
  });
});
