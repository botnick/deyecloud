type P = { className?: string };

/* ---------- line icons (inherit currentColor) ---------- */
const s = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconSun = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M19 5l-1.4 1.4M6.4 17.6 5 19" /></svg>
);
export const IconHouse = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const IconBattery = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s}><rect x="2" y="7" width="18" height="10" rx="3" /><path d="M22 10v4" /></svg>
);
export const IconGrid = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s}><path d="M4 4h16M4 20h16M8 4l-2 16M16 4l2 16M4 12h16" /></svg>
);
export const IconRefresh = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v5h-5" /></svg>
);
export const IconChevron = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2.4}><path d="m9 6 6 6-6 6" /></svg>
);
export const IconBack = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2.4}><path d="M20 12H4M10 6l-6 6 6 6" /></svg>
);
export const IconCheck = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2.6}><path d="M20 6 9 17l-5-5" /></svg>
);
export const IconAlert = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4.5M12 17h.01" /></svg>
);

/* ---------- bottom-nav icons ---------- */
export const NavHome = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
);
export const NavToday = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2}><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" /></svg>
);
export const NavWeather = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2}><circle cx="8" cy="9" r="3.2" /><path d="M8 1.5v1.5M8 15v1.5M1.5 9H3M13 9h1.5M3.4 4.4l1 1M11.6 4.4l-1 1" /><path d="M12 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6-1.5A3.8 3.8 0 0 1 22 18H12Z" /></svg>
);
export const NavHistory = (p: P) => (
  <svg viewBox="0 0 24 24" className={p.className} {...s} strokeWidth={2}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
);
