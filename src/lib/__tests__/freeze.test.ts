import { describe, it, expect } from "vitest";
import { isFrozenReading } from "../freeze";

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
