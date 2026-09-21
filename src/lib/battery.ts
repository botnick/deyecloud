// Battery health from the 5-min samples the cron already stores — pure, unit-tested.
//
// Usable capacity is measured, not assumed: during a CONTINUOUS discharge stretch
// (battery power > minW, no charging, no data gap) the energy delivered divided by
// the SOC it cost is the pack's real kWh-per-100 %:
//     cap_kWh = Σ(P·dt) / ΔSOC × 100
// Discharge only — charge stretches include conversion losses and would overstate.
// Short/shallow stretches are noise (BMS SOC steps in 1 % increments), so a
// minimum ΔSOC is required. Per-day estimate = median of that day's stretches;
// "current capacity" = median of the last RECENT_DAYS daily estimates. Cycle count
// = lifetime discharge energy ÷ capacity (equivalent full cycles).
export interface SamplePt { ts: number; soc: number | null; p: number } // p = battery W, +discharge / −charge
export interface Segment { start: number; end: number; kwh: number; dSoc: number; capKwh: number }
export interface DayEstimate { day: string; capKwh: number; segments: number }
export interface BatteryHealth {
  days: number;                      // window analysed
  ratedKwh: number | null;           // from BMS rated Ah × nominal V when known
  capKwh: number | null;             // measured usable capacity (recent)
  soh: number | null;                // capKwh / ratedKwh, %
  cycles: number | null;             // equivalent full cycles in the window
  dischargeKwh: number;              // total delivered in the window
  dod: { avg: number | null; minSoc: number | null; lowDays: number }; // daily SOC swing / floor / days below 20 %
  trend: DayEstimate[];              // one point per day with a usable stretch
  firstCapKwh: number | null;        // median of the first RECENT_DAYS estimates (for "since start")
}
export const SEG_MIN_W = 100;
export const SEG_MIN_DSOC = 15;
export const SEG_MAX_GAP_S = 15 * 60;
export const RECENT_DAYS = 10;
const bkkDay = (ts: number) => new Date((ts + 7 * 3600) * 1000).toISOString().slice(0, 10);
const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export function dischargeSegments(pts: SamplePt[]): Segment[] {
  const out: Segment[] = [];
  let cur: { start: number; soc0: number; kwh: number; last: SamplePt } | null = null;
  const close = (at: SamplePt) => {
    if (cur) {
      const dSoc = cur.soc0 - (at.soc as number);
      if (dSoc >= SEG_MIN_DSOC && cur.kwh > 0) out.push({ start: cur.start, end: at.ts, kwh: cur.kwh, dSoc, capKwh: (cur.kwh / dSoc) * 100 });
    }
    cur = null;
  };
  for (const pt of pts) {
    if (pt.soc == null) { if (cur) close(cur.last); continue; }
    const discharging = pt.p > SEG_MIN_W;
    if (cur) {
      const gap = pt.ts - cur.last.ts;
      if (!discharging || gap > SEG_MAX_GAP_S || pt.soc > cur.last.soc!) { close(cur.last); if (discharging) cur = { start: pt.ts, soc0: pt.soc, kwh: 0, last: pt }; continue; }
      cur.kwh += ((cur.last.p + pt.p) / 2) * (gap / 3600) / 1000; // trapezoid Wh → kWh
      cur.last = pt;
    } else if (discharging) cur = { start: pt.ts, soc0: pt.soc, kwh: 0, last: pt };
  }
  if (cur) close((cur as any).last);
  return out;
}

export function batteryHealth(pts: SamplePt[], ratedKwh: number | null, days: number): BatteryHealth | null {
  const withSoc = pts.filter((p) => p.soc != null && p.soc > 0);
  if (withSoc.length < 50 || !pts.some((p) => Math.abs(p.p) > SEG_MIN_W)) return null; // no battery / no data
  const segs = dischargeSegments(pts);
  const byDay = new Map<string, number[]>();
  for (const s of segs) (byDay.get(bkkDay(s.end)) || byDay.set(bkkDay(s.end), []).get(bkkDay(s.end))!).push(s.capKwh);
  const trend: DayEstimate[] = [...byDay.entries()].map(([day, caps]) => ({ day, capKwh: median(caps)!, segments: caps.length })).sort((a, b) => a.day.localeCompare(b.day));
  const capKwh = median(trend.slice(-RECENT_DAYS).map((d) => d.capKwh));
  const firstCapKwh = trend.length >= RECENT_DAYS * 2 ? median(trend.slice(0, RECENT_DAYS).map((d) => d.capKwh)) : null;
  // lifetime discharge in window (all discharging samples, trapezoid)
  let dischargeKwh = 0;
  for (let i = 1; i < pts.length; i++) {
    const dt = pts[i].ts - pts[i - 1].ts; if (dt <= 0 || dt > SEG_MAX_GAP_S) continue;
    const a = Math.max(0, pts[i - 1].p), b = Math.max(0, pts[i].p);
    dischargeKwh += ((a + b) / 2) * (dt / 3600) / 1000;
  }
  // daily depth of discharge + floor
  const socByDay = new Map<string, number[]>();
  for (const p of withSoc) (socByDay.get(bkkDay(p.ts)) || socByDay.set(bkkDay(p.ts), []).get(bkkDay(p.ts))!).push(p.soc as number);
  const swings: number[] = []; let minSoc: number | null = null, lowDays = 0;
  for (const arr of socByDay.values()) { const mx = Math.max(...arr), mn = Math.min(...arr); swings.push(mx - mn); minSoc = minSoc == null ? mn : Math.min(minSoc, mn); if (mn < 20) lowDays++; }
  const basis = ratedKwh || capKwh;
  return {
    days, ratedKwh, capKwh, soh: ratedKwh && capKwh ? Math.round((capKwh / ratedKwh) * 100) : null,
    cycles: basis ? Math.round((dischargeKwh / basis) * 10) / 10 : null,
    dischargeKwh: Math.round(dischargeKwh * 10) / 10,
    dod: { avg: swings.length ? Math.round(swings.reduce((a, b) => a + b, 0) / swings.length) : null, minSoc, lowDays },
    trend, firstCapKwh,
  };
}
