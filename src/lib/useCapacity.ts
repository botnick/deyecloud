import { useEffect, useState } from "react";
import { getTotals } from "./api";
import { effectiveCapacityKw, DEFAULT_SKY, type SkyMap } from "./forecast";

// The forecast model for the PRIMARY station: effective kWp (calibrated →
// nameplate → robust peak) and the site-learned sky factors. /api/totals is one
// cheap cached call; on failure or a non-primary station the nameplate + the
// regional prior drive the forecast.
export interface ForecastModel { capKw: number; sky: SkyMap; skyDays: number; calibrated: boolean; }
export function useForecastModel(capacity?: number | null, primary = true): ForecastModel {
  const [t, setT] = useState<{ calibKw?: number; peakPower?: number; sky?: SkyMap; skyDays?: number } | null>(null);
  useEffect(() => {
    if (!primary) { setT(null); return; }
    let live = true;
    getTotals().then((x) => { if (live) setT(x); }).catch(() => {});
    return () => { live = false; };
  }, [primary]);
  if (!primary) return { capKw: effectiveCapacityKw(capacity, null), sky: DEFAULT_SKY, skyDays: 0, calibrated: false };
  const calibrated = !!(t && t.calibKw && t.calibKw > 0);
  return {
    capKw: calibrated ? t!.calibKw! : effectiveCapacityKw(capacity, t?.peakPower),
    sky: t && t.sky ? { ...DEFAULT_SKY, ...t.sky } : DEFAULT_SKY,
    skyDays: t?.skyDays || 0,
    calibrated,
  };
}
// Back-compat shim (capacity only).
export const useEffectiveCapacity = (capacity?: number | null, primary = true) => useForecastModel(capacity, primary).capKw;
