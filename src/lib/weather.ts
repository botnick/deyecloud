// TMD condition codes 1-12 -> Thai text + glass icon name
export const COND: Record<number, [string, string]> = {
  1: ["ท้องฟ้าแจ่มใส", "sun"], 2: ["มีเมฆบางส่วน", "partly"], 3: ["เมฆเป็นส่วนมาก", "cloud"], 4: ["มีเมฆมาก", "cloud"],
  5: ["ฝนตกเล็กน้อย", "rain"], 6: ["ฝนปานกลาง", "rain"], 7: ["ฝนตกหนัก", "rain"], 8: ["ฝนฟ้าคะนอง", "storm"],
  9: ["อากาศหนาวจัด", "cloud"], 10: ["อากาศหนาว", "cloud"], 11: ["อากาศเย็น", "cloud"], 12: ["อากาศร้อนจัด", "sun"],
};
export const isNightAt = (t: string | number) => { const h = new Date(t).getHours(); return h < 6 || h >= 18; };
export const isNightNow = () => { const h = new Date().getHours(); return h < 6 || h >= 18; };

export const condText = (c: number, night = false) => {
  if (night && (c === 1 || c === 12)) return "ท้องฟ้าโปร่ง";
  return (COND[c] || ["ไม่มีข้อมูล", "cloud"])[0];
};
export const DAYLBL = ["วันนี้", "พรุ่งนี้", "มะรืนนี้"];
export const shortDate = (t: string) => new Date(t).toLocaleDateString("th-TH", { weekday: "short" });

// Solar potential from shortwave radiation (W/m²) or fall back to condition
export function solarInfo(cond: number, sw?: number | null): { pct: number; label: string } {
  let p = sw == null ? null : Math.max(0, Math.min(100, Math.round(((sw - 350) / 300) * 100)));
  if (p == null) p = [1, 2, 12].includes(cond) ? 85 : cond === 3 ? 55 : [4, 9, 10, 11].includes(cond) ? 40 : 20;
  return { pct: p, label: p >= 70 ? "ดีมาก" : p >= 45 ? "ดี" : p >= 25 ? "ปานกลาง" : "น้อย" };
}
