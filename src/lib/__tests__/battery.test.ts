import { describe, it, expect } from "vitest";
import { dischargeSegments, batteryHealth, sohIdentity, batteryEta, batteryCard } from "../battery";

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
  it("a missing-SOC sample stored as 0 mid-discharge is UNKNOWN: no fabricated capacity loss", () => {
    // 59 samples at 80 % / 2 kW discharging, then one bogus 0 % (old ingestion) → no ΔSOC=80 segment
    const pts = Array.from({ length: 59 }, (_, i) => ({ ts: T0 + i * 300, p: 2000, soc: 80 }));
    pts.push({ ts: T0 + 59 * 300, p: 2000, soc: 0 });
    const h = batteryHealth(pts, 20, 1);
    expect(h === null || h.capKwh === null).toBe(true);
    if (h) { expect(h.dod.minSoc).toBe(80); expect(h.coverage.unknownSoc).toBe(1); }
  });
  it("a genuine gradual run to 0 % counts (segment AND DoD floor)", () => {
    const pts = discharge(10, 2, 100, 20); // 20 kWh over 10 h → exactly 0 %
    const h = batteryHealth(pts, 20, 1)!;
    expect(h.capKwh).toBeCloseTo(20, 0); expect(h.dod.minSoc).toBeCloseTo(0, 0); expect(h.dod.lowDays).toBe(1);
  });
  it("no battery → null", () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ ts: T0 + i * 300, p: 0, soc: 0 }));
    expect(batteryHealth(pts, null, 1)).toBeNull();
  });
});

describe("sohIdentity — per-pack SOH only for a positively identified sole SN", () => {
  it("no known topology → unknown", () => expect(sohIdentity("A", [])).toEqual({ ok: false, reason: "unknown" }));
  it("no snapshot SN → unknown even with one known", () => expect(sohIdentity(null, ["A"])).toEqual({ ok: false, reason: "unknown" }));
  it("sole known SN that is NOT the rated one → mismatch", () => expect(sohIdentity("A", ["B"])).toEqual({ ok: false, reason: "mismatch" }));
  it("several known SNs (even if old) → multi", () => expect(sohIdentity("A", ["A", "B"])).toEqual({ ok: false, reason: "multi" }));
  it("sole matching SN → ok", () => expect(sohIdentity("A", ["A", "A"])).toEqual({ ok: true }));
});

describe("floorSoc (learned discharge cut-off)", () => {
  it("is the low percentile of daily minimums, not a single odd dip", () => {
    const pts: { ts: number; p: number; soc: number }[] = [];
    // 10 days, each bottoming out at 20 % except one that dips to 12 % and one stuck at 53 %
    for (let d = 0; d < 10; d++) {
      const floor = d === 3 ? 12 : d === 7 ? 53 : 20;
      for (let i = 0; i < 288; i++) pts.push({ ts: T0 + d * 86400 + i * 300, p: i % 2 ? 500 : -500, soc: floor + Math.abs(144 - i) * 0.3 });
    }
    expect(batteryHealth(pts, null, 10)!.floorSoc).toBe(20);
  });
});

describe("batteryEta", () => {
  const now = 1_790_000_000;
  it("discharging: usable above the floor ÷ current draw", () => {
    const e = batteryEta({ soc: 60, floor: 20, capKwh: 30, watts: 2000, now });
    expect(e).toMatchObject({ kind: "empty" });
    if (e?.kind !== "empty") throw 0;
    expect(e.kwhLeft).toBeCloseTo(12);
    expect(e.hours).toBeCloseTo(6);
    expect(e.at).toBe(now + 6 * 3600);
  });
  it("charging: time to 100 %", () => {
    const e = batteryEta({ soc: 50, floor: 20, capKwh: 30, watts: -3000, now });
    expect(e).toMatchObject({ kind: "full" });
    if (e?.kind !== "full") throw 0;
    expect(e.hours).toBeCloseTo(5);
  });
  it("at the floor, idle, already full, or unknown capacity", () => {
    expect(batteryEta({ soc: 20, floor: 20, capKwh: 30, watts: 900, now })).toEqual({ kind: "floor" });
    expect(batteryEta({ soc: 60, floor: 20, capKwh: 30, watts: 80, now })).toBeNull();
    expect(batteryEta({ soc: 100, floor: 20, capKwh: 30, watts: -900, now })).toBeNull();
    expect(batteryEta({ soc: 60, floor: 20, capKwh: 0, watts: 900, now })).toBeNull();
  });
  it("absurdly long horizons are not shown", () => {
    expect(batteryEta({ soc: 90, floor: 20, capKwh: 30, watts: 160, now })).toBeNull(); // 131 h
  });
});

describe("batteryCard (what the home battery card may claim)", () => {
  const now = 1_790_000_000;
  const base = { capKwh: 33, floorSoc: 20, now };
  it("unknown SOC (0 placeholder) while power flows: shown, but no %, floor or time", () => {
    const c = batteryCard({ ...base, soc: 0, socKnown: false, watts: 1500 });
    expect(c.show).toBe(true); expect(c.soc).toBeNull(); expect(c.eta).toBeNull(); expect(c.floor).toBeNull();
  });
  it("unknown SOC and idle: hidden", () => {
    expect(batteryCard({ ...base, soc: 0, socKnown: false, watts: 0 }).show).toBe(false);
  });
  it("a known real 0 % while idle is still a battery", () => {
    const c = batteryCard({ ...base, soc: 0, socKnown: true, watts: 0 });
    expect(c.show).toBe(true); expect(c.soc).toBe(0);
  });
  it("no measured capacity or no learned floor → no time (never nameplate / single minimum)", () => {
    expect(batteryCard({ ...base, capKwh: null, soc: 60, socKnown: true, watts: 2000 }).eta).toBeNull();
    expect(batteryCard({ ...base, floorSoc: null, soc: 60, socKnown: true, watts: 2000 }).eta).toBeNull();
    expect(batteryCard({ ...base, floorSoc: undefined, soc: 60, socKnown: true, watts: 2000 }).eta).toBeNull();
  });
  it("measured capacity + learned floor → time to the floor", () => {
    expect(batteryCard({ ...base, soc: 60, socKnown: true, watts: 2000 }).eta).toMatchObject({ kind: "empty" });
  });
});
