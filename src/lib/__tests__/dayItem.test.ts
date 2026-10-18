import { describe, it, expect, vi, afterEach } from "vitest";
// @ts-ignore — node:sqlite (Node ≥22) has no type declarations in this project
import { DatabaseSync } from "node:sqlite";
// @ts-ignore — no node type declarations in this project
import { readFileSync } from "node:fs";
import { dayItem } from "../../worker/deye";

const item = (y: number, m: number, d: number, gen: number) => ({ year: y, month: m, day: d, generationValue: gen, consumptionValue: 40, purchaseValue: 20 });

describe("dayItem — Deye day totals for the day asked for", () => {
  it("picks the item stamped with that day", () => {
    expect(dayItem({ stationDataItems: [item(2026, 10, 3, 9), item(2026, 10, 4, 17)] }, "2026-10-03")?.generationValue).toBe(9);
  });
  it("an empty day does not borrow the next day's totals", () => {
    expect(dayItem({ stationDataItems: [item(2026, 10, 4, 17)] }, "2026-10-03")).toBeNull();
  });
  it("no items / no response → null; undated items keep the first-item fallback", () => {
    expect(dayItem({ stationDataItems: [] }, "2026-10-03")).toBeNull();
    expect(dayItem(null, "2026-10-03")).toBeNull();
    expect(dayItem({ stationDataItems: [{ generationValue: 5 }] }, "2026-10-03")?.generationValue).toBe(5);
  });
});

// POST /api/_purge_day over the real Worker app, with Deye's history call stubbed.
async function fixture(deyeItems: any, envelope?: any) {
  vi.resetModules();
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../../../schema.sql", import.meta.url), "utf8"));
  vi.doMock("../../worker/deye", async (orig) => ({ ...(await orig<any>()), getHistory: async () => envelope !== undefined ? envelope : { success: true, stationDataItems: deyeItems } }));
  const DB = {
    prepare(sql: string) {
      const bind = (...args: any[]): any => ({
        bind,
        async first() { return db.prepare(sql).get(...args) ?? null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return { meta: db.prepare(sql).run(...args) }; },
      });
      return bind();
    },
    async batch(stmts: any[]) { const out = []; for (const s of stmts) out.push(await s.run()); return out; },
  };
  const worker = (await import("../../worker/index")).default as any;
  const env = { DB, APP_PIN: "462817", ASSETS: { fetch: async () => new Response("x") } };
  const req = (path: string, cookie?: string | null, method = "GET", body?: any) =>
    worker.fetch(new Request("https://t.invalid" + path, {
      method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body && JSON.stringify(body),
    }), env, { waitUntil() {} }) as Promise<Response>;
  const r = await req("/api/login", null, "POST", { pin: env.APP_PIN });
  const cookie = r.headers.get("set-cookie")!.split(";")[0];
  db.prepare("INSERT INTO daily (day, gen, use, buy) VALUES ('2026-10-03', 17, 43.6, 19.6), ('2026-10-04', 17, 43.6, 19.6)").run();
  db.prepare("INSERT INTO meta (k, v) VALUES ('totals_cache', '{}'), ('hist_v3_month_2026-10-01', '{}')").run();
  return { db, post: (q: string, ck: string | null = cookie) => req("/api/_purge_day" + q, ck, "POST") };
}

afterEach(() => { vi.doUnmock("../../worker/deye"); vi.restoreAllMocks(); });

describe("POST /api/_purge_day", () => {
  it("dry run, then deletes a row Deye has no record for and drops the caches", async () => {
    const f = await fixture([item(2026, 10, 4, 17)]);
    const dry = await (await f.post("?day=2026-10-03")).json() as any;
    expect(dry.dryRun).toBe(true);
    expect(f.db.prepare("SELECT COUNT(*) c FROM daily").get().c).toBe(2);
    const r = await (await f.post("?day=2026-10-03&confirm=1")).json() as any;
    expect(r.ok).toBe(true);
    expect(f.db.prepare("SELECT day FROM daily").all().map((x: any) => x.day)).toEqual(["2026-10-04"]);
    expect(f.db.prepare("SELECT COUNT(*) c FROM meta WHERE k IN ('totals_cache','hist_v3_month_2026-10-01')").get().c).toBe(0);
  });

  it("refuses when Deye still has totals for the day", async () => {
    const f = await fixture([item(2026, 10, 4, 17)]);
    const r = await f.post("?day=2026-10-04&confirm=1");
    expect(r.status).toBe(409);
    expect(f.db.prepare("SELECT COUNT(*) c FROM daily").get().c).toBe(2);
  });

  it("rejects bad or non-past days and anonymous callers", async () => {
    const f = await fixture([]);
    expect((await f.post("?day=2026-02-31")).status).toBe(400);
    expect((await f.post("?day=2999-01-01")).status).toBe(400);
    expect((await f.post("?day=2026-10-03&confirm=1", null)).status).toBe(401);
    expect(f.db.prepare("SELECT COUNT(*) c FROM daily").get().c).toBe(2);
  });

  it("never deletes on an answer it cannot read", async () => {
    for (const env of [{}, { success: true }, { success: true, stationDataItems: {} }, { success: true, stationDataItems: [{ year: 2026, generationValue: 17 }] }, { stationDataItems: [] }]) {
      const f = await fixture(null, env);
      const r = await f.post("?day=2026-10-03&confirm=1");
      expect(r.status).toBe(502);
      expect(f.db.prepare("SELECT COUNT(*) c FROM daily").get().c).toBe(2);
    }
  });
});
