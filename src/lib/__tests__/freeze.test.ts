import { describe, it, expect } from "vitest";
import { isFrozenReading } from "../freeze";

const NOW = 1_790_000_000, STALE = 720;
describe("isFrozenReading", () => {
  it("first ever poll: nothing stored → not frozen", () => expect(isFrozenReading(NOW - 60, null, NOW, STALE).frozen).toBe(false));
  it("reading advanced → not frozen even if old-ish", () => expect(isFrozenReading(NOW - 600, NOW - 900, NOW, STALE).frozen).toBe(false));
  it("same reading, still within the stale window → not frozen yet (one slow upload is fine)", () => {
    expect(isFrozenReading(NOW - 600, NOW - 600, NOW, STALE).frozen).toBe(false);
  });
  it("same reading and older than the window → FROZEN", () => {
    const r = isFrozenReading(NOW - 3600, NOW - 3600, NOW, STALE);
    expect(r.frozen).toBe(true); expect(r.reason).toContain("60 min");
  });
  it("no device timestamp → cannot judge → not frozen", () => expect(isFrozenReading(0, NOW - 3600, NOW, STALE).frozen).toBe(false));
});
