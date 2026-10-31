import { describe, it, expect } from "vitest";
import { dayRange } from "../../worker/deye";

// Deye answers a day-energy range that crosses into the next month with no items, so the
// month's last day must be asked inside its own month.
describe("dayRange", () => {
  it("mid-month: [day, day+1]", () => {
    expect(dayRange("2026-10-30")).toEqual(["2026-10-30", "2026-10-31"]);
  });
  it("first of the month stays forward", () => {
    expect(dayRange("2026-11-01")).toEqual(["2026-11-01", "2026-11-02"]);
  });
  it("last day of a month: [day-1, day], never into the next month", () => {
    expect(dayRange("2026-10-31")).toEqual(["2026-10-30", "2026-10-31"]);
    expect(dayRange("2026-09-30")).toEqual(["2026-09-29", "2026-09-30"]);
    expect(dayRange("2028-02-29")).toEqual(["2028-02-28", "2028-02-29"]);
    expect(dayRange("2026-12-31")).toEqual(["2026-12-30", "2026-12-31"]);
  });
});
