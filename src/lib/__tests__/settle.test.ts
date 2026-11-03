import { describe, it, expect } from "vitest";
// @ts-expect-error — node:sqlite (Node ≥22) has no type declarations in this project
import { DatabaseSync } from "node:sqlite";
import { settleYesterday, SETTLE_RETRY_S } from "../../worker/settle";

function mk() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)");
  const DB = {
    prepare(sql: string) {
      const bind = (...a: any[]): any => ({ bind, async first() { return db.prepare(sql).get(...a) ?? null; }, async run() { return db.prepare(sql).run(...a); } });
      return bind();
    },
  };
  return { db, DB };
}
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);

describe("settle yesterday's totals", () => {
  it("month end: missing after midnight, retried hourly, final once Deye answers in the morning", async () => {
    const { DB } = mk();
    const asked: string[] = [];
    let published = false;
    const refill = async (d: string) => { asked.push(d); return published; };
    const t0 = at("2026-11-01T00:05:00+07:00");
    expect(await settleYesterday(DB, t0, refill)).toBe("missing");
    expect(await settleYesterday(DB, t0 + 600, refill)).toBe("wait");
    expect(await settleYesterday(DB, t0 + SETTLE_RETRY_S, refill)).toBe("missing");
    published = true;
    expect(await settleYesterday(DB, at("2026-11-01T07:41:00+07:00"), refill)).toBe("refreshed"); // before 08:00: not final yet
    expect(await settleYesterday(DB, at("2026-11-01T08:45:00+07:00"), refill)).toBe("settled");
    expect(await settleYesterday(DB, at("2026-11-01T15:00:00+07:00"), refill)).toBe("done");
    expect(new Set(asked)).toEqual(new Set(["2026-10-31"]));
    expect(asked.length).toBe(4);
  });

  it("moves on to the next day at Bangkok midnight", async () => {
    const { DB } = mk();
    const asked: string[] = [];
    const refill = async (d: string) => { asked.push(d); return true; };
    expect(await settleYesterday(DB, at("2026-11-02T09:00:00+07:00"), refill)).toBe("settled");
    expect(await settleYesterday(DB, at("2026-11-02T23:55:00+07:00"), refill)).toBe("done");
    expect(await settleYesterday(DB, at("2026-11-03T00:05:00+07:00"), refill)).toBe("refreshed");
    expect(await settleYesterday(DB, at("2026-11-03T03:05:00+07:00"), refill)).toBe("wait"); // got one; final read after 08:00
    expect(await settleYesterday(DB, at("2026-11-03T08:05:00+07:00"), refill)).toBe("settled");
    expect(asked).toEqual(["2026-11-01", "2026-11-02", "2026-11-02"]);
  });

  it("a failing refill counts as missing and is retried, never throws", async () => {
    const { DB } = mk();
    const refill = async () => { throw new Error("deye down"); };
    const t = at("2026-11-02T09:00:00+07:00");
    expect(await settleYesterday(DB, t, refill)).toBe("missing");
    expect(await settleYesterday(DB, t + SETTLE_RETRY_S, refill)).toBe("missing");
  });

  it("a corrupt state row is replaced", async () => {
    const { db, DB } = mk();
    db.prepare("INSERT INTO meta (k,v) VALUES ('settle_day','{oops')").run();
    expect(await settleYesterday(DB, at("2026-11-02T09:00:00+07:00"), async () => true)).toBe("settled");
  });
});
