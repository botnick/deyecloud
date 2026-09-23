import { describe, it, expect } from "vitest";
import { analyze } from "../analysis";

describe("analyze — 'ตอนนี้' headline shows a real HH:MM clock (regression: 15.9666:00)", () => {
  it("renders Bangkok wall time, never a fractional hour", () => {
    // 2026-09-23T08:58:00Z = 15:58 Bangkok
    const l: any = { updatedAt: Date.parse("2026-09-23T08:58:00Z") / 1000, genPower: 2020, usePower: 1080, gridPower: 100, battPower: -950, soc: 90,
      genToday: 30.5, useToday: 33.6, buyToday: 13.5, sellToday: 0, chargeToday: 13.1, dischargeToday: 2.7, genTotal: 4000, battStatus: "CHARGE", gridStatus: "PURCHASE", warningStatus: "NORMAL", selfSufficiency: 60 };
    const head = analyze(l, 12).find((i) => i.title.startsWith("ตอนนี้"))!;
    expect(head.title).toMatch(/^ตอนนี้ 15:58 น\./);
    expect(head.title).not.toMatch(/\d+\.\d+:00/);
  });
});
