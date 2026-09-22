// Frozen-reading detection — pure, unit-tested.
//
// When the site's data logger drops off Deye Cloud, /station/latest keeps
// answering with the LAST reading it has (same watts, same SOC, same
// lastUpdateTime) for hours or days. Storing that every 5 minutes fabricates a
// flat 4-day "production curve" (observed 2026-09-18→22: PV 2,631 W × 96 h).
// A reading is only new evidence if its device timestamp advanced past the one
// we last stored; if it hasn't and it is older than the stale window, the poll
// carries no information about the present and must not be written as a sample.
export interface FreezeCheck { frozen: boolean; reason: string | null }
export function isFrozenReading(readingTs: number, lastStoredReadingTs: number | null, nowS: number, staleS: number): FreezeCheck {
  if (!Number.isFinite(readingTs) || readingTs <= 0) return { frozen: false, reason: null }; // no device timestamp → cannot judge, keep old behaviour
  if (lastStoredReadingTs != null && readingTs <= lastStoredReadingTs && nowS - readingTs > staleS) {
    return { frozen: true, reason: `Deye reading unchanged since ${new Date(readingTs * 1000).toISOString()} (${Math.round((nowS - readingTs) / 60)} min)` };
  }
  return { frozen: false, reason: null };
}
