// Yesterday's day totals, re-read from Deye after midnight. The live poll stores Deye's running
// "today" figures, so the last minutes before midnight can be missing from the stored day, and on
// a month's last day Deye may publish nothing until the morning (2026-10-31 had no day item at
// 00:40 BKK, it was there by 07:41). This asks again at most hourly until Deye answers after
// SETTLE_FINAL_HOUR, when the day's figures are taken as final (an early answer is kept and
// re-read once after that hour: normally two reads a day). State in meta as {day, at, done}.
type DB = { prepare(sql: string): any };
export type SettleState = { day: string; at: number; got?: boolean; done: boolean };
export const SETTLE_RETRY_S = 3600, SETTLE_FINAL_HOUR = 8;
const bkkDay = (s: number) => new Date(s * 1000 + 7 * 3600000).toISOString().slice(0, 10);
const bkkHour = (s: number) => new Date(s * 1000 + 7 * 3600000).getUTCHours();

// refill(day) re-reads one day from Deye and returns whether its day totals came back.
export async function settleYesterday(db: DB, now: number, refill: (day: string) => Promise<boolean>) {
  const day = bkkDay(now - 86400);
  const r = (await db.prepare("SELECT v FROM meta WHERE k='settle_day'").first()) as { v: string } | null;
  let s: SettleState | null = null;
  if (r) { try { s = JSON.parse(r.v); } catch {} }
  if (s && s.day === day) {
    if (s.done) return "done";
    if (now - s.at < SETTLE_RETRY_S) return "wait";
    if (s.got && bkkHour(now) < SETTLE_FINAL_HOUR) return "wait"; // have a figure; the final read is after 08:00
  }
  const got = await refill(day).catch(() => false);
  const done = got && bkkHour(now) >= SETTLE_FINAL_HOUR;
  await db.prepare("INSERT INTO meta (k,v) VALUES ('settle_day',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v")
    .bind(JSON.stringify({ day, at: now, got, done } satisfies SettleState)).run();
  return got ? (done ? "settled" : "refreshed") : "missing";
}
