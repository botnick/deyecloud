import { useEffect, useState } from "react";
import { getTotals } from "./api";
import { effectiveCapacityKw } from "./forecast";

// Effective array size in kWp for forecasts, best source first:
//   1. calibKw — measured from the site's own clear-day history (lib/calib.ts):
//      what the system actually delivers, absorbing tilt/shading/losses/clipping
//   2. the station's installed (nameplate) kWp
//   3. peakPower — best recent PV watts (robust p95)
// /api/totals is one cheap cached call; on failure the nameplate still works.
export function useEffectiveCapacity(capacity?: number | null): number {
  const [t, setT] = useState<{ calibKw?: number; peakPower?: number } | null>(null);
  useEffect(() => {
    let live = true;
    getTotals().then((x) => { if (live) setT(x); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (t && t.calibKw && t.calibKw > 0) return t.calibKw;
  return effectiveCapacityKw(capacity, t?.peakPower);
}
