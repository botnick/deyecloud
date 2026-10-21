import { describe, it, expect } from "vitest";
// @ts-ignore — node:sqlite (Node ≥22) has no type declarations in this project
import { DatabaseSync } from "node:sqlite";
import { rememberGap, retryGap, GAP_RETRY_S, GAP_GIVE_UP_S } from "../../worker/gaps";

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT); CREATE TABLE samples (ts INTEGER PRIMARY KEY)");
  const DB = {
    prepare(sql: string) {
      const bind = (...a: any[]): any => ({ bind, async first() { return db.prepare(sql).get(...a) ?? null; }, async run() { return db.prepare(sql).run(...a); } });
      return bind();
    },
  };
  return { db, DB };
}
const T0 = 1792499700; // 2026-10-20 19:35 Bangkok
const gapFrom = T0, gapTo = T0 + 3600; // a one-hour hole: 11 missing 5-min samples

describe("pending data gap", () => {
  it("waits an hour, refills while empty, clears once filled", async () => {
    const { db, DB } = mk();
    await rememberGap(DB, gapFrom, gapTo, gapTo);
    const days: string[][] = [];
    const refill = async (a: string, b: string) => { days.push([a, b]); return { samplesWritten: 0 }; };
    expect(await retryGap(DB, gapTo + 60, refill)).toBe("wait");
    expect(await retryGap(DB, gapTo + GAP_RETRY_S, refill)).toBe("refilled");
    expect(days).toEqual([["2026-10-20", "2026-10-20"]]);
    expect(await retryGap(DB, gapTo + GAP_RETRY_S + 60, refill)).toBe("wait"); // next try only an hour later
    for (let t = gapFrom + 300; t < gapTo; t += 300) db.prepare("INSERT INTO samples (ts) VALUES (?)").run(t); // Deye uploaded the buffer
    expect(await retryGap(DB, gapTo + 2 * GAP_RETRY_S, refill)).toBe("filled");
    expect(db.prepare("SELECT COUNT(*) c FROM meta").get().c).toBe(0);
  });

  it("gives up after 24 h when Deye never has the data", async () => {
    const { db, DB } = mk();
    await rememberGap(DB, gapFrom, gapTo, gapTo);
    expect(await retryGap(DB, gapTo + GAP_GIVE_UP_S + 1, async () => ({ samplesWritten: 0 }))).toBe("gave-up");
    expect(db.prepare("SELECT COUNT(*) c FROM meta").get().c).toBe(0);
  });

  it("a second gap while one is pending widens it", async () => {
    const { db, DB } = mk();
    await rememberGap(DB, gapFrom, gapTo, gapTo);
    await rememberGap(DB, gapTo + 7200, gapTo + 9000, gapTo + 9000);
    const g = JSON.parse(db.prepare("SELECT v FROM meta").get().v);
    expect([g.from, g.to]).toEqual([gapFrom, gapTo + 9000]);
  });

  it("a refill error is retried later, not dropped", async () => {
    const { DB } = mk();
    await rememberGap(DB, gapFrom, gapTo, gapTo);
    expect(await retryGap(DB, gapTo + GAP_RETRY_S, async () => { throw new Error("deye down"); })).toBe("refilled");
    expect(await retryGap(DB, gapTo + 2 * GAP_RETRY_S, async () => null)).toBe("refilled");
  });
});

describe("pending gap older than the refill window", () => {
  it("retries only the reachable days, newest included", async () => {
    const { DB } = mk();
    const from = Date.parse("2026-10-19T12:00:00+07:00") / 1000, to = Date.parse("2026-10-21T12:00:00+07:00") / 1000;
    await rememberGap(DB, from, to, to);
    const asked: string[][] = [];
    const minFrom = Date.parse("2026-10-20T00:00:00+07:00") / 1000; // 2-day window at 21 Oct
    expect(await retryGap(DB, to + GAP_RETRY_S, async (a, b) => { asked.push([a, b]); return { samplesWritten: 0 }; }, minFrom)).toBe("refilled");
    expect(asked).toEqual([["2026-10-20", "2026-10-21"]]);
  });
});
