import { describe, it, expect } from "vitest";
import { dischargeSegments, batteryHealth } from "../battery";

// Synthetic pack: 20 kWh usable. A 6-hour discharge at 2 kW = 12 kWh should cost 60 % SOC.
const T0 = Math.floor(1_790_000_000 / 86400) * 86400 - 3600; // 23:00Z = 06:00 Bangkok, so a 6 h stretch stays inside one BKK day
function discharge(hours: number, kw: number, soc0: number, capKwh: number, t0 = T0) {
  const pts = []; const n = hours * 12; // 5-min samples
  for (let i = 0; i <= n; i++) { const h = i / 12; pts.push({ ts: t0 + i * 300, p: kw * 1000, soc: soc0 - (kw * h / capKwh) * 100 }); }
  return pts;
}

describe("dischargeSegments", () => {
  it("energy ÷ ΔSOC recovers the pack's capacity", () => {
    const segs = dischargeSegments(discharge(6, 2, 100, 20));
    expect(segs).toHaveLength(1);
    expect(segs[0].dSoc).toBeCloseTo(60, 0);
    expect(segs[0].capKwh).toBeCloseTo(20, 0);
  });
  it("a charge interruption or a data gap splits stretches; shallow stretches are dropped", () => {
    const a = discharge(2, 2, 100, 20);                    // 4 kWh, 20 % — counts
    const gap = a[a.length - 1].ts + 3600;                 // 1-hour hole
    const b = discharge(1, 2, 70, 20, gap);                 // 2 kWh, 10 % — too shallow
    const segs = dischargeSegments([...a, ...b]);
    expect(segs).toHaveLength(1);
  });
});

describe("batteryHealth", () => {
  it("SOH vs rated, cycles, DoD", () => {
    // 3 days, one 6 h discharge each at 2 kW from 95 % on an 18 kWh pack rated 20 kWh
    const pts = [0, 1, 2].flatMap((d) => discharge(6, 2, 95, 18, T0 + d * 86400));
    const h = batteryHealth(pts, 20, 3)!;
    expect(h).not.toBeNull();
    expect(h.capKwh).toBeCloseTo(18, 0);
    expect(h.soh).toBe(90);
    expect(h.dischargeKwh).toBeCloseTo(36, 0);
    expect(h.cycles).toBeCloseTo(1.8, 1);
    expect(h.dod.avg).toBe(67);
    expect(h.trend).toHaveLength(3);
  });
  it("no battery → null", () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ ts: T0 + i * 300, p: 0, soc: 0 }));
    expect(batteryHealth(pts, null, 1)).toBeNull();
  });
});
