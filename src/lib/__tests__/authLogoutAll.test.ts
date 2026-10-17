import { describe, it, expect, vi, afterEach } from "vitest";
// @ts-ignore — node:sqlite (Node ≥22) has no type declarations in this project
import { DatabaseSync } from "node:sqlite";

// Real Worker app over an in-memory SQLite stand-in for D1 (auth paths only).
// Each fixture is a separate Worker isolate (fresh module state); pass `db` to share D1.
async function fixture(db = new DatabaseSync(":memory:")) {
  vi.resetModules();
  let failEpoch = false;
  const DB = {
    prepare(sql: string) {
      const bind = (...args: any[]): any => ({
        bind,
        async first() {
          if (failEpoch && sql.includes("auth_epoch")) throw new Error("synthetic D1 failure");
          return db.prepare(sql).get(...args) ?? null;
        },
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
  const login = async () => {
    const r = await req("/api/login", null, "POST", { pin: env.APP_PIN });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")!.split(";")[0];
  };
  const authed = async (cookie: string) => ((await (await req("/api/session", cookie)).json()) as any).authed as boolean;
  return { db, req, login, authed, failEpoch: (v: boolean) => { failEpoch = v; } };
}

let clock = 1_800_000_000_000;
afterEach(() => { vi.restoreAllMocks(); });
const tick = (ms: number) => { clock += ms; };

describe("log everyone out (POST /api/_logout_all)", () => {
  it("voids existing sessions, clears the caller, and new PIN logins work", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const f = await fixture();
    const a = await f.login(), b = await f.login();
    tick(10_000);
    const r = await f.req("/api/_logout_all", a, "POST");
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toMatch(/Max-Age=0/);
    expect(await f.authed(a)).toBe(false);
    expect(await f.authed(b)).toBe(false);
    expect((await f.req("/api/settings", b)).status).toBe(401);
    const fresh = await f.login();
    expect(await f.authed(fresh)).toBe(true);
    expect((await f.req("/api/_logout_all", null, "POST")).status).toBe(401);
  });

  it("also voids a cookie issued in the same second as the logout", async () => {
    clock = 1_800_000_200_100;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const f = await fixture();
    const c = await f.login();
    tick(700); // same unix second
    expect((await f.req("/api/_logout_all", c, "POST")).status).toBe(200);
    expect(await f.authed(c)).toBe(false);
    const fresh = await f.login(); // still the same second — must work
    expect(await f.authed(fresh)).toBe(true);
  });

  it("a failed epoch read never revives a revoked session", async () => {
    clock = 1_800_000_400_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const f = await fixture();
    const c = await f.login();
    tick(10_000);
    await f.req("/api/_logout_all", c, "POST");
    tick(60_001); // cache expired
    f.failEpoch(true);
    expect(await f.authed(c)).toBe(false);
    f.failEpoch(false);
    expect(await f.authed(c)).toBe(false);
  });

  it("a warm isolate whose epoch refresh fails stops trusting its stale copy", async () => {
    clock = 1_800_000_600_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const a = await fixture();
    const b = await fixture(a.db); // sibling isolate, same D1
    const c = await a.login();
    expect(await a.authed(c)).toBe(true); // A caches epoch 0
    tick(1_000);
    await b.req("/api/_logout_all", null, "POST"); // unauthenticated → refused
    const op = await b.login();
    expect((await b.req("/api/_logout_all", op, "POST")).status).toBe(200); // B bumps to 1
    tick(60_001);
    a.failEpoch(true);
    expect(await a.authed(c)).toBe(false);
    tick(86_400_000);
    expect((await a.req("/api/settings", c)).status).toBe(401);
    a.failEpoch(false);
    expect(await a.authed(c)).toBe(false);
  });

  it("a login made after another isolate's logout is accepted right away", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const a = await fixture();
    const b = await fixture(a.db);
    const old = await a.login();
    expect(await a.authed(old)).toBe(true); // A caches epoch 0
    expect((await b.req("/api/_logout_all", await b.login(), "POST")).status).toBe(200);
    const fresh = await b.login(); // epoch 1
    expect(await a.authed(fresh)).toBe(true); // within A's cache minute
    expect(await a.authed(old)).toBe(false);
  });

  it("fails closed when the epoch was never readable", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const f = await fixture();
    const c = await f.login();
    // fresh isolate, D1 down: nothing cached → no access
    const g = await fixture();
    g.failEpoch(true);
    expect(await g.authed(c)).toBe(false);
  });

  it("cookies in the old two-part format are void", async () => {
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const f = await fixture();
    expect(await f.authed(`deye_auth=${Math.floor(clock / 1000)}.${"a".repeat(64)}`)).toBe(false);
  });
});

describe("client: an open app returns to the PIN screen", () => {
  it("a 401 from a data call signals sign-out; a wrong-PIN 401 does not", async () => {
    const win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("fetch", async () => new Response('{"error":"unauthorized"}', { status: 401, headers: { "content-type": "application/json" } }));
    const api = await import("../api");
    let n = 0;
    win.addEventListener(api.SIGNED_OUT, () => n++);
    await api.postLogin("0000");
    expect(n).toBe(0);
    await api.getStations();
    expect(n).toBe(1);
    vi.unstubAllGlobals();
  });
});
