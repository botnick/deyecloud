// Shared domain constants — single source of truth so the tariff/CO₂ figures
// never drift between the realtime view and the history analysis.
//   • ELECTRICITY_RATE — Thai residential average ~4.4 THB/kWh (progressive
//     tariff + Ft, approx 2026). Used to estimate baht saved.
//   • CO2_PER_KWH — Thailand grid emission factor ~0.5 kg CO₂/kWh (TGO/อบก.).
export const ELECTRICITY_RATE = 4.4;
export const CO2_PER_KWH = 0.5;
// Default ฿ paid per exported unit. Thai residential export usually pays little or
// nothing (varies by scheme), so default 0 = conservative; users set their own
// rate/cost in ตั้งค่า (the values here are only the fall-back defaults).
export const DEFAULT_SELL_RATE = 0;
