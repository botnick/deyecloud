import { useEffect, useState } from "react";
import { getTotals } from "./api";
import { effectiveCapacityKw } from "./forecast";

// Effective array size in kWp: the station's installed capacity, or — when the
// station never reported one — derived from the best PV power ever produced
// (peakPower from /api/totals, cheap + cached). Only fetched when actually needed.
export function useEffectiveCapacity(capacity?: number | null): number {
  const [peakW, setPeakW] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (capacity && capacity > 0) return;
    let live = true;
    getTotals().then((t) => { if (live) setPeakW(t.peakPower); }).catch(() => {});
    return () => { live = false; };
  }, [capacity]);
  return effectiveCapacityKw(capacity, peakW);
}
