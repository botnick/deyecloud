// Shared domain constants — single source of truth so the tariff/CO₂ figures
// never drift between the realtime view and the history analysis.
//   • ELECTRICITY_RATE — Thai residential average ~4.4 THB/kWh (progressive
//     tariff + Ft, approx 2026). Used to estimate baht saved.
//   • CO2_PER_KWH — Thailand grid emission factor ~0.5 kg CO₂/kWh (TGO/อบก.).
export const ELECTRICITY_RATE = 4.4;
export const CO2_PER_KWH = 0.5;
