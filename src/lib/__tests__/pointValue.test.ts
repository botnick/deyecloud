import { describe, it, expect } from "vitest";
import { pointValue, toSec } from "../../worker/deye";

describe("pointValue — a reading is a finite number, nothing else", () => {
  it("absent forms → undefined (never 0)", () => {
    for (const v of [null, undefined, "", "   ", "N/A", "abc", NaN, Infinity]) expect(pointValue(v)).toBeUndefined();
  });
  it("numeric strings and numbers → numbers; a real 0 stays 0", () => {
    expect(pointValue("0")).toBe(0); expect(pointValue(0)).toBe(0);
    expect(pointValue("79")).toBe(79); expect(pointValue(" -107.8 ")).toBeCloseTo(-107.8);
  });
});

describe("toSec — Deye timestamps in s or ms, absent → null", () => {
  it("normalises", () => {
    expect(toSec(1_790_000_000)).toBe(1_790_000_000);
    expect(toSec("1790000000123")).toBe(1_790_000_000);
    expect(toSec("")).toBeNull(); expect(toSec(0)).toBeNull(); expect(toSec(undefined)).toBeNull();
  });
});
