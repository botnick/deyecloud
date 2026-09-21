import { describe, it, expect } from "vitest";
import { pointValue } from "../../worker/deye";

describe("pointValue — a reading is a finite number, nothing else", () => {
  it("absent forms → undefined (never 0)", () => {
    for (const v of [null, undefined, "", "   ", "N/A", "abc", NaN, Infinity]) expect(pointValue(v)).toBeUndefined();
  });
  it("numeric strings and numbers → numbers; a real 0 stays 0", () => {
    expect(pointValue("0")).toBe(0); expect(pointValue(0)).toBe(0);
    expect(pointValue("79")).toBe(79); expect(pointValue(" -107.8 ")).toBeCloseTo(-107.8);
  });
});
