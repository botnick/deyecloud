// Reading-freshness gate — pure, unit-tested.
//
// When the site's data logger drops off Deye Cloud, /station/latest and
// /device/latest keep answering with the LAST reading they have (same watts,
// same SOC, same timestamp) for hours or days. Storing that every 5 minutes
// fabricates a flat multi-day "production curve" (observed 2026-09-18→22:
// PV 2,631 W × 96 h). A reading is evidence about NOW only if the timestamp of
// the source that produced its values is inside the stale window — freshness is
// judged on its own, never on whether the timestamp moved since last time (a
// 4-day-old reading that "advances" by 5 min is still 4 days old), and a missing
// timestamp cannot prove freshness at all.
export interface FreezeCheck { frozen: boolean; reason: string | null }
export function isFrozenReading(observedAt: number | null, nowS: number, staleS: number): FreezeCheck {
  if (observedAt == null || !Number.isFinite(observedAt) || observedAt <= 0) return { frozen: true, reason: "source gave no observation timestamp" };
  const age = nowS - observedAt;
  if (age > staleS) return { frozen: true, reason: `reading observed ${Math.round(age / 60)} min ago (${new Date(observedAt * 1000).toISOString()})` };
  return { frozen: false, reason: null };
}
