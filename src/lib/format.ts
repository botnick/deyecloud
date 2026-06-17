export const fmtKw = (w: number) => {
  const v = (Number(w) || 0) / 1000;
  return Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1);
};
export const fmtKwh = (v: number) => (Number(v) || 0).toFixed(1);
export const fmtPower = (w: number) => {
  const a = Math.abs(Number(w) || 0);
  return a < 1000 ? `${Math.round(a)} W` : `${(a / 1000).toFixed(2)} kW`;
};
export const fmtPct = (v: number) => String(Math.round(Number(v) || 0));

export const timeStr = (ts: number) =>
  new Date((ts || Date.now() / 1000) * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
};
