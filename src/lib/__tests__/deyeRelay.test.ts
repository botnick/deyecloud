import { describe, it, expect, vi, afterEach } from "vitest";

// Minimal D1 stand-in: just the meta table the token code touches.
function fakeDb() {
  const meta = new Map<string, string>();
  const stmt = (sql: string, args: any[] = []) => ({
    bind: (...a: any[]) => stmt(sql, a),
    first: async () => (/SELECT v FROM meta/.test(sql) && meta.has(args[0]) ? { v: meta.get(args[0]) } : null),
    run: async () => {
      if (/INSERT INTO meta/.test(sql)) { const m = /VALUES \('([a-z_]+)',\s*\?\)/.exec(sql); m ? meta.set(m[1], String(args[0])) : meta.set(args[0], String(args[1])); }
      return {};
    },
  });
  return { meta, prepare: (sql: string) => stmt(sql), batch: async (s: any[]) => { for (const x of s) await x.run(); return []; } };
}
const env = (db: any) => ({ DB: db, DEYE_BASE_URL: "https://deye.test/v1.0", DEYE_RELAY_URL: "https://relay.test", DEYE_APP_ID: "1", DEYE_APP_SECRET: "s", DEYE_EMAIL: "e", DEYE_PASSWORD: "p" }) as any;
const block = () => new Response("<html><title>ERROR: The request could not be satisfied</title></html>", { status: 403, headers: { "content-type": "text/html" } });
const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("Deye relay fallback", () => {
  it("a blocked call is retried through the relay with the derived key", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push(url);
      if (url.startsWith("https://deye.test")) return block();
      expect(init.headers["x-relay-key"]).toMatch(/^[0-9a-f]{64}$/);
      return url.includes("/account/token") ? json({ success: true, accessToken: "T", expiresIn: 5184000 }) : json({ success: true, deviceDataList: [] });
    }));
    const { deviceLatest } = await import("../../worker/deye");
    const d = await deviceLatest(env(fakeDb()), ["sn"]);
    expect(d.success).toBe(true);
    // first call tries Deye, then the relay; later calls stay on the relay (sticky)
    expect(calls).toEqual(["https://deye.test/v1.0/account/token?appId=1", "https://relay.test/account/token?appId=1", "https://relay.test/device/latest"]);
  });

  it("a relay outage during login does not start the credential hold", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("https://deye.test") ? block() : json({ success: false, code: "relay", msg: "relay: upstream unreachable" }, 502))));
    const { deviceLatest, isAuthHold } = await import("../../worker/deye");
    const db = fakeDb();
    const err = await deviceLatest(env(db), ["sn"]).then(() => null, (e) => e);
    expect(err).toBeTruthy();
    expect(isAuthHold(err)).toBe(false);
    expect(db.meta.has("deye_login_fails")).toBe(false);
  });
});
