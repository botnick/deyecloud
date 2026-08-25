import { useEffect, useState } from "react";
import { getTotals } from "./api";
import { effectiveCapacityKw } from "./forecast";

// Effective array size in kWp for forecasts, best source first:
//   1. calibKw — measured from the site's own clear-day history (lib/calib.ts)
//   2. the station's installed (nameplate) kWp
//   3. peakPower — best recent PV watts (robust p95)
// CAVEAT: /api/totals (calibKw AND peakPower) is built from the PRIMARY station's
// history only — on any other station of a multi-station account both would be
// another site's numbers, so `primary:false` skips the fetch entirely and the
// nameplate alone drives the forecast there.
export function useEffectiveCapacity(capacity?: number | null, primary = true): number {
  const [t, setT] = useState<{ calibKw?: number; peakPower?: number } | null>(null);
  useEffect(() => {
    if (!primary) { setT(null); return; }
    let live = true;
    getTotals().then((x) => { if (live) setT(x); }).catch(() => {});
    return () => { live = false; };
  }, [primary]);
  if (!primary) return effectiveCapacityKw(capacity, null);
  if (t && t.calibKw && t.calibKw > 0) return t.calibKw;
  return effectiveCapacityKw(capacity, t?.peakPower);
}
