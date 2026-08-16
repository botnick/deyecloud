// Outbound alerts, evaluated by the 5-min cron. Nothing here is a Deye alarm —
// every rule is derived from what the poll already fetched (no extra Deye calls).
//
// Channels are opt-in via env; unset = silent. Discord-compatible webhook and/or
// Telegram bot. State (which alerts are active, when last sent, tick counters)
// lives in ONE meta row so a tick costs 1 read + 1 write.
//
// Rules — each is silent when it lacks the data it needs (never guesses):
//   offline        inverter not reporting (availability from buildDeviceData)
//   poll_failed    the cron itself could not read Deye for N consecutive ticks
//   no_production  ≈0 W PV inside the site's own clear-sky peak window, N ticks
//   grid_out       every grid phase reads < GRID_ABSENT_V while the house has load
//   soc_low        battery below ALERT_SOC_MIN (only if configured)
//   attention:*    a warn-level finding from analyzeDevice (one alert per finding)
// A cleared rule sends one "recovered" message; an active one repeats every
// ALERT_REPEAT_MIN (default 360) so a long outage isn't a single lost ping.
import type { Env } from "./deye";

export interface AlertEnv extends Env {
  ALERT_WEBHOOK_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  ALERT_SOC_MIN?: string;
  ALERT_REPEAT_MIN?: string;
}

const GRID_ABSENT_V = 50;        // no grid on earth sits this low while energised
const CONSECUTIVE_TICKS = 3;     // ~15 min at */5 — one bad sample is noise
const NO_PROD_FRACTION = 0.02;   // "≈0" = under 2 % of the array's known size

interface Cond { key: string; title: string; detail: string; active: boolean; }
interface AlertState { [key: string]: { since: number; lastSent: number; sent: boolean; ticks: number; title?: string } }

export const alertsConfigured = (env: AlertEnv) => !!(env.ALERT_WEBHOOK_URL || (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID));

async function loadState(env: Env): Promise<AlertState> {
  const row = (await env.DB.prepare("SELECT v FROM meta WHERE k='alert_state'").first()) as { v: string } | null;
  try { return row ? JSON.parse(row.v) : {}; } catch { return {}; }
}
async function saveState(env: Env, st: AlertState) {
  await env.DB.prepare("INSERT INTO meta (k,v) VALUES ('alert_state',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(st)).run();
}

// Delivery semantics are AT-LEAST-ONE channel: webhook and Telegram are redundant
// paths to the same person, so a 2xx from either commits the "sent" transition;
// per-channel retry would double-post the same alert on the surviving channel.
export const delivered = (r: { webhook?: number; telegram?: number }) =>
  [r.webhook, r.telegram].some((s) => typeof s === "number" && s >= 200 && s < 300);

export async function notify(env: AlertEnv, text: string): Promise<{ webhook?: number; telegram?: number }> {
  const out: { webhook?: number; telegram?: number } = {};
  const jobs: Promise<any>[] = [];
  if (env.ALERT_WEBHOOK_URL) {
    jobs.push(fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1900), username: "Solar Monitor" }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => { out.webhook = r.status; }).catch(() => { out.webhook = 0; }));
  }
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(10000),
    }).then((r) => { out.telegram = r.status; }).catch(() => { out.telegram = 0; }));
  }
  await Promise.all(jobs);
  return out;
}

const hhmm = (ms: number) => new Date(ms + 7 * 3600 * 1000).toISOString().slice(11, 16); // Thailand wall clock
const mins = (s: number) => (s >= 7200 ? `${Math.round(s / 3600)} ชม.` : `${Math.round(s / 60)} นาที`);
const keyOf = (title: string) => "attention:" + title.replace(/[\d.,%()\s]+/g, "").slice(0, 40);

export interface EvalInput {
  latest: any | null;            // Latest (with warningReasons/availability applied) or null when the poll failed
  dev: any | null;               // buildDeviceData() result
  sun: { peakStart: string; peakEnd: string } | null;
  weatherCond?: number | null;   // TMD cond code of the current weather (5+ = rain) — gates no_production
  capacityW: number | null;      // installed kWp×1000, else peakPower — null = unknown
  stationName?: string;
  pollError?: string | null;     // set by the scheduled catch path
}
const RAINY_COND = 5; // TMD cond ≥5 = rain/thunder: near-zero PV is expected, not a fault

// Evaluate every rule against this tick, update state, send what changed.
export async function evaluateAlerts(env: AlertEnv, inp: EvalInput): Promise<void> {
  if (!alertsConfigured(env)) return;
  const now = Math.floor(Date.now() / 1000);
  const st = await loadState(env);
  const repeatS = (Number(env.ALERT_REPEAT_MIN) || 360) * 60;
  const conds: Cond[] = [];
  const l = inp.latest, dev = inp.dev;

  // poll_failed — counted across ticks in state, decided by the counter
  const pf = st.poll_failed || { since: now, lastSent: 0, sent: false, ticks: 0 };
  pf.ticks = inp.pollError ? pf.ticks + 1 : 0;
  if (inp.pollError && pf.ticks === 1) pf.since = now;
  st.poll_failed = pf;
  conds.push({ key: "poll_failed", title: "ดึงข้อมูลจาก Deye ไม่ได้", detail: inp.pollError ? `ล้มเหลวติดกัน ${pf.ticks} รอบ · ${inp.pollError}` : "", active: pf.ticks >= CONSECUTIVE_TICKS });

  if (dev && dev.availability) {
    conds.push({ key: "offline", title: "อินเวอร์เตอร์ออฟไลน์", detail: dev.availability.reason || "", active: dev.availability.status === "offline" });
  }

  if (l && inp.sun && inp.capacityW && inp.capacityW > 0) {
    const t = hhmm(Date.now());
    const inPeak = t >= inp.sun.peakStart && t <= inp.sun.peakEnd;
    const rainy = inp.weatherCond != null && inp.weatherCond >= RAINY_COND;
    const np = st.no_production || { since: now, lastSent: 0, sent: false, ticks: 0 };
    // Rain/thunder pauses the counter (doesn't reset it): a storm passing over a
    // dead array shouldn't clear the alarm, but it must not raise it either.
    const zero = inPeak && !rainy && Number(l.genPower) < inp.capacityW * NO_PROD_FRACTION;
    np.ticks = zero ? np.ticks + 1 : rainy && inPeak ? np.ticks : 0;
    if (zero && np.ticks === 1) np.since = now;
    st.no_production = np;
    conds.push({
      key: "no_production", title: "ช่วงกลางวันแต่ไม่ผลิตไฟเลย",
      detail: `ผลิต ${Math.round(Number(l.genPower))} W ในช่วงแดด (คำนวณจากตำแหน่งดวงอาทิตย์) ${inp.sun.peakStart}–${inp.sun.peakEnd} ฝนไม่ตก ติดกัน ${np.ticks} รอบ`,
      active: np.ticks >= CONSECUTIVE_TICKS,
    });
  }

  if (dev && Array.isArray(dev.dataList) && dev.dataList.length) {
    const num = (k: string) => { const r = dev.dataList.find((x: any) => x.key === k); const v = r ? Number(r.value) : NaN; return Number.isNaN(v) ? null : v; };
    const gv = ["GridVoltageL1", "GridVoltageL2", "GridVoltageL3"].map(num).filter((v): v is number => v != null);
    const load = num("TotalConsumptionPower");
    if (gv.length && load != null) {
      conds.push({ key: "grid_out", title: "ไฟกริดหาย (ไฟดับ)", detail: `แรงดันกริด ${gv.map((v) => v.toFixed(0)).join("/")} V ขณะโหลด ${Math.round(load)} W`, active: gv.every((v) => v < GRID_ABSENT_V) && load > 0 });
    }
  }

  // SOC from the inverter's own measure point when present (0 there is a real 0 %,
  // whereas Latest.soc is 0 when the field is simply missing).
  const socMin = Number(env.ALERT_SOC_MIN);
  if (env.ALERT_SOC_MIN && Number.isFinite(socMin) && socMin > 0) {
    const mp = dev && Array.isArray(dev.dataList) ? dev.dataList.find((x: any) => x.key === "BMSSOC" || x.key === "SOC") : null;
    const soc = mp ? Number(mp.value) : l && Number(l.soc) > 0 ? Number(l.soc) : NaN;
    if (Number.isFinite(soc)) conds.push({ key: "soc_low", title: `แบตต่ำกว่า ${socMin}%`, detail: `SOC ${Math.round(soc)}%`, active: soc < socMin });
  }

  // Deye's own alarm log — one condition per ongoing alarm, cleared when it ends.
  const seenAl = new Set<string>();
  for (const a of (dev && dev.alarms && dev.alarms.active) || []) {
    const k = "deye:" + a.alertId; seenAl.add(k);
    conds.push({ key: k, title: `${a.level >= 2 ? "Fault" : "Warning"} จากอินเวอร์เตอร์: ${a.name}`, detail: `เริ่ม ${hhmm(a.start * 1000)}${a.impact ? " · กระทบการทำงาน" : ""}`, active: true });
  }
  if (dev && dev.alarms) for (const k of Object.keys(st)) if (k.startsWith("deye:") && !seenAl.has(k)) conds.push({ key: k, title: st[k].title || k, detail: "", active: false });

  // attention:* — one condition per finding; findings that vanished are "cleared"
  const seenAtt = new Set<string>();
  for (const title of (dev && dev.attention) || []) {
    const k = keyOf(title); seenAtt.add(k);
    conds.push({ key: k, title, detail: "จากการวิเคราะห์ค่าจากเครื่อง (ไม่ใช่ alarm ของ Deye)", active: true });
  }
  for (const k of Object.keys(st)) if (k.startsWith("attention:") && !seenAtt.has(k)) conds.push({ key: k, title: st[k].title || k, detail: "", active: false });

  // Diff against state → messages. State transitions that mean "the user has been
  // told" are COMMITTED ONLY IF a channel actually accepted the message (2xx);
  // otherwise they are retried next tick. Tick counters are always persisted.
  const name = inp.stationName ? `[${inp.stationName}] ` : "";
  const msgs: string[] = [];
  const onDelivered: (() => void)[] = [];
  const isTransient = (k: string) => k.startsWith("attention:") || k.startsWith("deye:");
  for (const c of conds) {
    const s = st[c.key] || { since: now, lastSent: 0, sent: false, ticks: 0 };
    if (c.active) {
      if (!st[c.key] || (!s.sent && !s.since)) s.since = now;
      s.title = c.title;
      st[c.key] = s;
      if (!s.sent || now - s.lastSent >= repeatS) {
        msgs.push(`${s.sent ? "🔁" : "🚨"} ${name}${c.title}${c.detail ? `\n${c.detail}` : ""}${s.sent ? `\nยังไม่หาย · เริ่ม ${hhmm(s.since * 1000)} (${mins(now - s.since)})` : ""}`);
        onDelivered.push(() => { s.sent = true; s.lastSent = now; });
      }
    } else if (s.sent) {
      msgs.push(`✅ ${name}กลับมาปกติ: ${c.title} (นาน ${mins(now - s.since)})`);
      onDelivered.push(() => { if (isTransient(c.key)) delete st[c.key]; else st[c.key] = { since: 0, lastSent: 0, sent: false, ticks: 0 }; });
    } else if (c.key === "poll_failed" || c.key === "no_production") {
      st[c.key] = s; // keep tick counters
    }
  }
  if (msgs.length) {
    const r = await notify(env, msgs.join("\n\n"));
    if (delivered(r)) onDelivered.forEach((f) => f());
    else console.error("alert delivery failed", JSON.stringify(r), "— will retry next tick");
  }
  await saveState(env, st);
}
