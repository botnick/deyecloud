import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateAlerts } from "../../worker/alerts";

// State-sequence tests for the alert engine: a fake D1 holding the single
// alert_state row, a fake webhook capturing what would have been sent, and a
// fake clock (12:00 Bangkok = 05:00Z, inside the sun-peak core window).
function harness(initial: any = {}, extraEnv: Record<string, string> = {}) {
  let stored = JSON.stringify(initial);
  const DB = {
    prepare: (sql: string) => ({
      first: async () => (sql.includes("alert_state") ? { v: stored } : null),
      bind: (v: string) => ({ run: async () => { stored = v; return {}; } }),
      all: async () => ({ results: [] }),
      run: async () => ({}),
    }),
  };
  const sent: string[] = [];
  globalThis.fetch = vi.fn(async (_url: any, init: any) => { sent.push(JSON.parse(init.body).content); return { status: 204 } as any; }) as any;
  const env = { DB, ALERT_WEBHOOK_URL: "http://hook.test/x", ALERT_REPEAT_MIN: "1", ...extraEnv } as any;
  return { env, sent, state: () => JSON.parse(stored), take: () => sent.splice(0) };
}
const SUN = { peakStart: "09:40", peakEnd: "15:10" };
const online = (extra: any = {}) => ({ availability: { status: "online", reason: "" }, dataList: [], attention: [], alarms: { active: [], recent: [] }, ...extra });
const offline = () => online({ availability: { status: "offline", reason: "ข้อมูลเก่า" } });
const T0 = Date.parse("2026-09-14T05:00:00Z"); // 12:00 BKK
let t = T0;
const tick = (min = 5) => { t += min * 60000; vi.setSystemTime(t); };

beforeEach(() => { vi.useFakeTimers(); t = T0; vi.setSystemTime(t); });
afterEach(() => { vi.useRealTimers(); });

describe("offline — open incidents survive the counter migration", () => {
  it("legacy sent=true/ticks=0 state while STILL offline: no false recovery, no re-alert", async () => {
    // lastSent recent so this is not simply a due 🔁 repeat — we're testing the migration path
    // long repeat interval: a due 🔁 repeat is legitimate and not what this test is about
    const h = harness({ offline: { since: 1000, lastSent: Math.floor(T0 / 1000) - 30, sent: true, ticks: 0 } }, { ALERT_REPEAT_MIN: "360" });
    await evaluateAlerts(h.env, { latest: {}, dev: offline(), sun: null, capacityW: null });
    expect(h.take()).toEqual([]);
    expect(h.state().offline.sent).toBe(true);
    expect(h.state().offline.since).toBe(1000); // incident start preserved
    tick(); await evaluateAlerts(h.env, { latest: {}, dev: offline(), sun: null, capacityW: null });
    expect(h.take()).toEqual([]);
    // back online → exactly one recovery
    tick(); await evaluateAlerts(h.env, { latest: {}, dev: online(), sun: null, capacityW: null });
    const m = h.take(); expect(m).toHaveLength(1); expect(m[0]).toContain("กลับมาปกติ");
  });
  it("a NEW outage needs 3 consecutive ticks", async () => {
    const h = harness();
    for (let i = 0; i < 2; i++) { await evaluateAlerts(h.env, { latest: {}, dev: offline(), sun: null, capacityW: null }); tick(); }
    expect(h.take()).toEqual([]);
    await evaluateAlerts(h.env, { latest: {}, dev: offline(), sun: null, capacityW: null });
    expect(h.take()[0]).toContain("ออฟไลน์");
  });
});

describe("ALERT_MUTE forgets state even when the rule is not evaluable this tick", () => {
  it("muted during a poll failure, then unmuted: no stale counter fires", async () => {
    const h = harness({ offline: { since: 0, lastSent: 0, sent: false, ticks: 2 } }, { ALERT_MUTE: "offline" });
    await evaluateAlerts(h.env, { latest: null, dev: null, sun: null, capacityW: null, pollError: "boom" });
    expect(h.state().offline).toBeUndefined();
    delete h.env.ALERT_MUTE;
    tick(); await evaluateAlerts(h.env, { latest: {}, dev: offline(), sun: null, capacityW: null });
    expect(h.take()).toEqual([]);
    expect(h.state().offline.ticks).toBe(1);
  });
});

describe("no_production — evidence-gated, production clears regardless of sky", () => {
  const inp = (genPower: number, cond: number | null) => ({ latest: { genPower, soc: 50 }, dev: online(), sun: SUN, weatherCond: cond, capacityW: 10000 });
  it("4 clear-sky zero ticks raise; cloud/unknown neither repeats nor recovers; observed production recovers", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) { await evaluateAlerts(h.env, inp(0, 1)); tick(); }
    expect(h.take()).toEqual([]);
    await evaluateAlerts(h.env, inp(0, 1));
    expect(h.take()[0]).toContain("ไม่ผลิตไฟ");
    // unknown weather, still zero, past the repeat interval → silence (no repeat, no recovery)
    tick(10); await evaluateAlerts(h.env, inp(0, null));
    expect(h.take()).toEqual([]);
    expect(h.state().no_production.sent).toBe(true);
    // cloudy but producing 3 kW on a 10 kW array → recovery (not a repeat)
    tick(10); await evaluateAlerts(h.env, inp(3000, 3));
    const m = h.take(); expect(m).toHaveLength(1); expect(m[0]).toContain("กลับมาปกติ");
  });
  it("failed recovery delivery (503) then a clear zero tick: incident stays open, no false RECOVERED", async () => {
    const h = harness();
    for (let i = 0; i < 4; i++) { await evaluateAlerts(h.env, inp(0, 1)); tick(); }
    expect(h.take()[0]).toContain("ไม่ผลิตไฟ");
    // recovery attempt is NOT delivered → sent must stay latched
    const ok = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ status: 503 } as any)) as any;
    tick(); await evaluateAlerts(h.env, inp(3000, 3));
    globalThis.fetch = ok;
    expect(h.state().no_production.sent).toBe(true);
    // next clear-sky zero tick (ticks reset to 1): still open → no "recovered", no raise
    tick(); await evaluateAlerts(h.env, inp(0, 1));
    expect(h.take().filter((m) => m.includes("กลับมาปกติ"))).toEqual([]);
    expect(h.state().no_production.sent).toBe(true);
    // real production with a working webhook → exactly one recovery
    tick(); await evaluateAlerts(h.env, inp(3000, 3));
    const m = h.take(); expect(m).toHaveLength(1); expect(m[0]).toContain("กลับมาปกติ");
  });
  it("pending 4 ticks (unsent) under unknown weather does NOT raise", async () => {
    const h = harness({ no_production: { since: 0, lastSent: 0, sent: false, ticks: 4 } });
    await evaluateAlerts(h.env, inp(0, null));
    expect(h.take()).toEqual([]);
  });
  it("clear-sky repeat still works when evidence persists", async () => {
    const h = harness();
    for (let i = 0; i < 4; i++) { await evaluateAlerts(h.env, inp(0, 1)); tick(); }
    h.take();
    tick(10); await evaluateAlerts(h.env, inp(0, 1));
    expect(h.take()[0]).toContain("🔁");
  });
});
