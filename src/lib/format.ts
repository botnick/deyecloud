export const fmtKwh = (v: number) => (Number(v) || 0).toFixed(1);
export const fmtPower = (w: number) => {
  const a = Math.abs(Number(w) || 0);
  return a < 1000 ? `${Math.round(a)} W` : `${(a / 1000).toFixed(2)} kW`;
};

// Data timestamps are the SITE's moments — render them on the Bangkok clock
// (see bkkClock below), not the viewer's locale.
export const timeStr = (ts: number) => bkkClock(ts || Date.now() / 1000);

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
};

// ---- Asia/Bangkok clock helpers (+07:00, no DST) ----
// Sample timestamps describe the SITE's day; every clock-of-day decision must use
// Bangkok wall time via UTC getters, never the viewer's locale — a user opening
// the app abroad must see the same hours the inverter lived through.
export const bkkDate = (tsSec: number) => new Date((tsSec + 7 * 3600) * 1000);
export const bkkHour = (tsSec: number) => bkkDate(tsSec).getUTCHours() + bkkDate(tsSec).getUTCMinutes() / 60;
export const bkkClock = (tsSec: number) => {
  const d = bkkDate(tsSec);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
export const bkkToday = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10); // YYYY-MM-DD
