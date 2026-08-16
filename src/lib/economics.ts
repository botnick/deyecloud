import type { Settings } from "./settings";
import { CO2_PER_KWH } from "./config";

// Any period's energy totals — day totals, or summed month/year/lifetime roll-ups.
export interface PeriodTotals { use?: number; buy?: number; sell?: number; gen?: number; }

// ฿ saved in a period = energy you used but didn't buy (covered by solar/battery)
// × your tariff, plus income from energy exported to the grid × your sell rate.
// Single source of truth — reused by Home, History sections, and Lifetime so the
// money figure can never drift between views.
export function savingsOf(t: PeriodTotals, s: Settings): number {
  const selfUsed = Math.max(0, (t.use || 0) - (t.buy || 0));
  return selfUsed * s.rate + (t.sell || 0) * s.sellRate;
}

// CO₂ (kg) avoided ≈ all solar energy produced × the grid emission factor.
export const co2Of = (genKwh: number): number => Math.max(0, genKwh) * CO2_PER_KWH;

// A mature tree absorbs ~21 kg CO₂/year → a friendly trees-equivalent for the stat.
export const treesOf = (co2Kg: number): number => co2Kg / 21;

// ฿ formatted with thousands separators (no decimals — money figures are large).
export const baht = (n: number): string => "฿" + Math.round(Math.max(0, n)).toLocaleString("th-TH");
