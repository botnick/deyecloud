import { describe, it, expect } from "vitest";
import { isFrozenReading, observedAtOf } from "../freeze";

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
