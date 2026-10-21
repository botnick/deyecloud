// Pending data gap, kept in meta as {from, to, at, until}: the newest sample before the gap,
// the first one after it, the last refill attempt and when to give up (24 h). The logger often
// uploads its buffer minutes or hours after it reconnects, so the first refill can find nothing.
type DB = { prepare(sql: string): any };
export type PendingGap = { from: number; to: number; at: number; until: number };
export const GAP_RETRY_S = 3600, GAP_GIVE_UP_S = 24 * 3600, GAP_FILLED = 0.9;
const bkkDay = (s: number) => new Date(s * 1000 + 7 * 3600000).toISOString().slice(0, 10);
const save = (db: DB, g: PendingGap) =>
  db.prepare("INSERT INTO meta (k,v) VALUES ('pending_gap',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(g)).run();
const drop = (db: DB) => db.prepare("DELETE FROM meta WHERE k='pending_gap'").run();

export async function rememberGap(db: DB, from: number, to: number, now = Math.floor(Date.now() / 1000)) {
  const r = (await db.prepare("SELECT v FROM meta WHERE k='pending_gap'").first()) as { v: string } | null;
  let g: PendingGap = { from, to, at: now, until: now + GAP_GIVE_UP_S };
  if (r) { try { const p = JSON.parse(r.v) as PendingGap; g = { ...g, from: Math.min(p.from, from), to: Math.max(p.to, to) }; } catch {} }
  await save(db, g);
}

// One cheap meta read per tick; at most hourly a primary-key range count and, while the gap
// is still mostly empty, a refill of the days it touches. Returns what it did (for tests/logs).
export async function retryGap(db: DB, now: number, refill: (fromDay: string, toDay: string) => Promise<{ samplesWritten: number } | null>) {
  const r = (await db.prepare("SELECT v FROM meta WHERE k='pending_gap'").first()) as { v: string } | null;
  if (!r) return "none";
  let g: PendingGap;
  try { g = JSON.parse(r.v); } catch { await drop(db); return "dropped"; }
  if (now - g.at < GAP_RETRY_S) return "wait";
  const want = Math.max(1, Math.floor((g.to - g.from) / 300) - 1);
  const have = ((await db.prepare("SELECT COUNT(*) c FROM samples WHERE ts > ? AND ts < ?").bind(g.from, g.to).first()) as { c: number } | null)?.c || 0;
  if (have >= want * GAP_FILLED) { await drop(db); console.log(`gap retry: ${have}/${want} samples present, done`); return "filled"; }
  if (now > g.until) {
    await drop(db);
    console.warn(`gap retry: giving up after 24 h, ${have}/${want} samples for ${new Date(g.from * 1000).toISOString()}..${new Date(g.to * 1000).toISOString()} (Deye has none)`);
    return "gave-up";
  }
  const res = await refill(bkkDay(g.from), bkkDay(g.to)).catch(() => null);
  await save(db, { ...g, at: now });
  console.log(`gap retry: had ${have}/${want}, refill wrote ${res ? res.samplesWritten : "nothing (error)"}`);
  return "refilled";
}
