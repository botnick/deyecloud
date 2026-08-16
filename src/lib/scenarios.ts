import type { Latest } from "./api";

// Mock states for testing the UI against every situation the live system rarely
// shows (export, charging, islanded/off-grid, low battery, fault, ...).
// Enabled via ?dev=1; never affects real data unless a scenario is picked.
const base: Latest = {
  genPower: 0, usePower: 0, gridPower: 0, battPower: 0, soc: 50,
  genToday: 0, useToday: 0, buyToday: 0, sellToday: 0, chargeToday: 0, dischargeToday: 0, genTotal: 0,
  battStatus: "STATIC", gridStatus: "PURCHASE", warningStatus: "NORMAL", selfSufficiency: 0,
  updatedAt: Math.floor(Date.now() / 1000),
};

export type Scenario = { key: string; name: string; latest: Latest };

export const SCENARIOS: Scenario[] = [
  { key: "peak", name: "กลางวัน · ผลิตเต็ม + ไฟย้อน + ชาร์จ", latest: { ...base, genPower: 9850, usePower: 1320, gridPower: -6900, battPower: -1600, soc: 82, battStatus: "CHARGE", gridStatus: "REVERSE", genToday: 41.2, useToday: 18.4, buyToday: 0.8, sellToday: 24.6, chargeToday: 9.1, dischargeToday: 2.3, selfSufficiency: 96 } },
  { key: "charging", name: "แดดดี · กำลังชาร์จแบต", latest: { ...base, genPower: 6200, usePower: 1500, gridPower: 0, battPower: -4500, soc: 47, battStatus: "CHARGE", genToday: 22, useToday: 9, buyToday: 0.5, chargeToday: 7, selfSufficiency: 94 } },
  { key: "discharge", name: "ไม่มีแดด · แบตจ่ายไฟ", latest: { ...base, genPower: 0, usePower: 2100, gridPower: 0, battPower: 2100, soc: 63, battStatus: "DISCHARGE", genToday: 15, useToday: 20, dischargeToday: 6, selfSufficiency: 80 } },
  { key: "offgrid", name: "ไฟดับ (ออฟกริด) · แบตจ่าย", latest: { ...base, genPower: 0, usePower: 1800, gridPower: 0, battPower: 1800, soc: 55, battStatus: "DISCHARGE", gridStatus: "OFFGRID", dischargeToday: 4, selfSufficiency: 100 } },
  { key: "buy", name: "กลางคืน · ซื้อไฟ (ปกติ)", latest: { ...base, genPower: 1, usePower: 2300, gridPower: 2300, soc: 20, gridStatus: "PURCHASE", genToday: 30.7, useToday: 41.6, buyToday: 7.6, selfSufficiency: 82 } },
  { key: "lowbatt", name: "แบตต่ำมาก · 5%", latest: { ...base, genPower: 0, usePower: 900, gridPower: 900, soc: 5, gridStatus: "PURCHASE", genToday: 12, useToday: 18, buyToday: 9, selfSufficiency: 50 } },
  { key: "fullbatt", name: "แบตเต็ม · 100% + ไฟย้อน", latest: { ...base, genPower: 7000, usePower: 1500, gridPower: -5500, soc: 100, gridStatus: "REVERSE", genToday: 38, useToday: 14, sellToday: 20, selfSufficiency: 98 } },
  { key: "fault", name: "มีการแจ้งเตือน (fault)", latest: { ...base, genPower: 0, usePower: 1200, gridPower: 1200, soc: 40, warningStatus: "ALARM", gridStatus: "PURCHASE", genToday: 8, useToday: 15, buyToday: 9 } },
  { key: "idle", name: "ทุกค่าเป็นศูนย์ (นิ่ง)", latest: { ...base, soc: 50 } },
];

export const scenarioByKey = (k: string | null) => (k ? SCENARIOS.find((s) => s.key === k) || null : null);
