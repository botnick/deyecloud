import { describe, it, expect } from "vitest";
import { savingsOf, savingsLabel, co2Of, treesOf } from "../economics";
import { DEFAULT_SETTINGS } from "../settings";
import { CO2_PER_KWH } from "../config";

const S = { ...DEFAULT_SETTINGS, rate: 5, sellRate: 2, co2Factor: 0.5 };

describe("savingsOf (signed — the actual period bill delta)", () => {
  it("self-used energy × rate + export × sellRate", () => {
    // use 10, buy 4 → 6 self-used × 5฿ = 30฿, plus 2 kWh sold × 2฿ = 4฿
    expect(savingsOf({ use: 10, buy: 4, sell: 2 }, S)).toBe(34);
  });
  it("goes NEGATIVE when the grid supplied more than the house used (night battery charge)", () => {
    expect(savingsOf({ use: 5, buy: 8, sell: 0 }, S)).toBe(-15);
  });
  it("missing fields count as zero", () => {
    expect(savingsOf({}, S)).toBe(0);
  });
});

describe("savingsLabel", () => {
  it("positive → ประหยัด wording", () => {
    const r = savingsLabel(120);
    expect(r.negative).toBe(false);
    expect(r.text).toBe("฿120");
  });
  it("negative → ค่าไฟเพิ่มสุทธิ with magnitude", () => {
    const r = savingsLabel(-75);
    expect(r.negative).toBe(true);
    expect(r.label).toBe("ค่าไฟเพิ่มสุทธิ");
    expect(r.text).toBe("−฿75");
  });
  it("−0.4฿ rounding noise stays positive-labelled", () => {
    expect(savingsLabel(-0.4).negative).toBe(false);
  });
});

describe("co2Of", () => {
  it("uses the user's factor when given", () => {
    expect(co2Of(100, { co2Factor: 0.42 })).toBeCloseTo(42);
  });
  it("falls back to the shared default without settings", () => {
    expect(co2Of(10)).toBeCloseTo(10 * CO2_PER_KWH);
  });
  it("never returns negative", () => {
    expect(co2Of(-5, { co2Factor: 0.5 })).toBe(0);
  });
});

it("treesOf: 21 kg CO2 ≈ 1 tree-year", () => {
  expect(treesOf(42)).toBeCloseTo(2);
});
