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

// Observation time of a record assembled from several sources: the OLDEST
// contributing source bounds its freshness, and one contributor without a
// timestamp makes the whole record unprovable (null). Non-contributing sources
// (a device snapshot that overrode nothing) are ignored.
export function observedAtOf(contributors: { used: boolean; ts: number | null }[]): number | null {
  const used = contributors.filter((c) => c.used);
  if (!used.length) return null;
  if (used.some((c) => c.ts == null || !Number.isFinite(c.ts) || c.ts <= 0)) return null;
  return Math.min(...used.map((c) => c.ts as number));
}

// Provenance of the INSTANTANEOUS fields of a Latest record (gen/use/grid/batt
// power + SOC). Lifetime/day-energy fields have their own (history) provenance
// and never gate instantaneous freshness. SOC that neither source reported is
// stored NULL and contributes nothing.
export interface InvFlow { genPower?: number; usePower?: number; gridPower?: number; battPower?: number; soc?: number; observedAt: number | null }
export function composeObservedAt(inv: InvFlow | null, stationTs: number | null, stationSocKnown: boolean): number | null {
  const powers = ["genPower", "usePower", "gridPower", "battPower"] as const;
  const invHas = (k: keyof InvFlow) => !!inv && (inv as any)[k] != null;
  const fromInverter = !!inv && (powers.some(invHas) || invHas("soc"));
  const socFromStation = !invHas("soc") && stationSocKnown;
  const fromStation = !inv || powers.some((k) => !invHas(k)) || socFromStation;
  return observedAtOf([
    { used: fromStation, ts: stationTs },
    { used: fromInverter, ts: inv ? inv.observedAt : null },
  ]);
}
