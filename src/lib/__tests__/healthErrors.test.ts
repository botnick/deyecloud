import { describe, it, expect, vi } from "vitest";
// @ts-expect-error — node:sqlite (Node ≥22) has no type declarations in this project
import { DatabaseSync } from "node:sqlite";

// /api/_health is public (uptime monitors). Upstream error text may carry account or endpoint
// details, so it is shown only to an operator: a configured PIN plus a valid session.
const SECRET = "account 0812345678 locked at https://eu1-developer.deyecloud.com";

async function fixture(pin: string | undefined) {
  vi.resetModules();
  const db = new DatabaseSync(":memory:");
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
  const env: any = { DB, ASSETS: { fetch: async () => new Response("x") }, ...(pin ? { APP_PIN: pin } : {}) };
  const req = (path: string, cookie?: string | null, method = "GET", body?: any) =>
    worker.fetch(new Request("https://t.invalid" + path, {
      method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) }, body: body && JSON.stringify(body),
    }), env, { waitUntil() {} }) as Promise<Response>;
  await req("/api/_health"); // creates the schema
  const now = Math.floor(Date.now() / 1000);
  const put = (k: string, v: string) => db.prepare("INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").run(k, v);
  put("last_poll_error", JSON.stringify({ at: now, msg: SECRET }));
  put("deye_login_fails", "2");
  put("deye_login_fail_at", String(now));
  put("deye_login_fail_msg", SECRET);
  db.prepare("INSERT INTO samples (ts) VALUES (?)").run(now); // the summary line needs a sample
  const health = async (cookie?: string | null) => (await (await req("/api/_health", cookie)).text());
  const login = async () => {
    const r = await req("/api/login", null, "POST", { pin });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  return { health, login };
}

describe("/api/_health error text", () => {
  it("no PIN configured: nobody gets the raw error text", async () => {
    const f = await fixture(undefined);
    const t = await f.health();
    expect(t).not.toContain(SECRET);
    expect(JSON.parse(t).summary).toContain("error ล่าสุด");
    expect(JSON.parse(t).lastPollError).toBeTruthy(); // that an error happened is still shown
  });
  it("PIN configured, guest: no raw error text", async () => {
    const f = await fixture("462817");
    expect(await f.health()).not.toContain(SECRET);
  });
  it("PIN configured, signed in: full error text", async () => {
    const f = await fixture("462817");
    const j = JSON.parse(await f.health(await f.login()));
    expect(j.lastPollError.msg).toBe(SECRET);
    expect(j.deyeLogin.lastError).toBe(SECRET);
    expect(j.summary).toContain(SECRET);
  });
});
