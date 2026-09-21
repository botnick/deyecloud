// Year-level insight math — pure, unit-tested. Inputs are the monthly roll-ups the
// History year view already has (this year + last year) plus the station's
// astronomical clear-sky PSH per month (from the worker, its own coordinates).
export interface MonthRow { month: string; gen: number; use?: number; buy?: number; sell?: number } // month "YYYY-MM"
export interface MonthStat { m: number; gen: number; days: number; perDay: number | null; partial: boolean }

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
// Thai seasons as presentation buckets (TMD's conventional split): ร้อน Mar–May,
// ฝน Jun–Oct, หนาว Nov–Feb — labels for grouping, not thresholds.
export const SEASON_OF: Record<number, "hot" | "rainy" | "cool"> = { 1: "cool", 2: "cool", 3: "hot", 4: "hot", 5: "hot", 6: "rainy", 7: "rainy", 8: "rainy", 9: "rainy", 10: "rainy", 11: "cool", 12: "cool" };
export const SEASON_TH = { hot: "ฤดูร้อน (มี.ค.–พ.ค.)", rainy: "ฤดูฝน (มิ.ย.–ต.ค.)", cool: "ฤดูหนาว (พ.ย.–ก.พ.)" } as const;

// Per-month production normalised to kWh/day. `today` (YYYY-MM-DD, BKK) marks the
// running month partial: its divisor is days elapsed so far, and it's flagged.
export function monthStats(rows: MonthRow[], year: number, today: string): MonthStat[] {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)), td = Number(today.slice(8, 10));
  const by = new Map(rows.map((r) => [Number(r.month.slice(5, 7)), r]));
  const out: MonthStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const r = by.get(m);
    const isCurrent = year === ty && m === tm;
    const future = year > ty || (year === ty && m > tm);
    const days = isCurrent ? Math.max(1, td - 1) : daysInMonth(year, m); // running month: completed days only
    const gen = r ? Number(r.gen) || 0 : 0;
    out.push({ m, gen, days, perDay: !future && r && gen > 0 ? gen / days : null, partial: isCurrent });
  }
  return out;
}

export function bestWorst(stats: MonthStat[]) {
  const have = stats.filter((s) => s.perDay != null && !s.partial);
  if (have.length < 2) return null;
  const best = have.reduce((a, b) => (b.perDay! > a.perDay! ? b : a));
  const worst = have.reduce((a, b) => (b.perDay! < a.perDay! ? b : a));
  return { best, worst };
}

export function seasonSummary(stats: MonthStat[]) {
  const acc: Record<string, { gen: number; days: number }> = { hot: { gen: 0, days: 0 }, rainy: { gen: 0, days: 0 }, cool: { gen: 0, days: 0 } };
  for (const s of stats) if (s.perDay != null) { const k = SEASON_OF[s.m]; acc[k].gen += s.gen; acc[k].days += s.days; }
  return (["hot", "rainy", "cool"] as const).map((k) => ({ season: k, label: SEASON_TH[k], perDay: acc[k].days ? acc[k].gen / acc[k].days : null, days: acc[k].days }));
}

// Month-by-month vs last year, only months both years have.
export function yearOverYear(cur: MonthStat[], prev: MonthStat[]) {
  const pairs = cur.map((c) => ({ m: c.m, cur: c.perDay, prev: prev[c.m - 1]?.perDay ?? null }))
    .filter((p) => p.cur != null && p.prev != null && !cur[p.m - 1].partial) as { m: number; cur: number; prev: number }[];
  if (!pairs.length) return null;
  const c = pairs.reduce((a, p) => a + p.cur, 0), p = pairs.reduce((a, q) => a + q.prev, 0);
  return { months: pairs.length, pct: p > 0 ? Math.round(((c - p) / p) * 100) : null, pairs };
}

// Full-year projection = actual so far + estimate for the rest. Each remaining
// month's kWh/day is taken from last year's same month when known, otherwise
// from this year's observed kWh/day scaled by the station's astronomical PSH
// ratio (month ÷ observed-months average) — seasonality from geometry, no
// regional constant. Returns null until at least one full month is observed.
export function projectYear(cur: MonthStat[], prev: MonthStat[] | null, pshByMonth: number[] | null, year: number, today: string) {
  const observed = cur.filter((s) => s.perDay != null && !s.partial);
  if (!observed.length) return null;
  const obsPerDay = observed.reduce((a, s) => a + s.gen, 0) / observed.reduce((a, s) => a + s.days, 0);
  const obsPsh = pshByMonth ? observed.reduce((a, s) => a + pshByMonth[s.m - 1], 0) / observed.length : null;
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
  let actual = 0, estimated = 0, fromLastYear = 0, fromGeometry = 0;
  for (const s of cur) {
    if (s.perDay != null && !s.partial) { actual += s.gen; continue; }
    if (year < ty || (year === ty && s.m < tm)) { actual += s.gen; continue; } // past month with no data: count what we have (0)
    const dim = daysInMonth(year, s.m);
    if (s.partial) actual += s.gen; // days so far
    const remainingDays = s.partial ? dim - s.days : dim;
    const ly = prev && prev[s.m - 1] && prev[s.m - 1].perDay != null && !prev[s.m - 1].partial ? prev[s.m - 1].perDay! : null;
    let perDay: number;
    if (ly != null) { perDay = ly; fromLastYear++; }
    else if (pshByMonth && obsPsh) { perDay = obsPerDay * (pshByMonth[s.m - 1] / obsPsh); fromGeometry++; }
    else perDay = obsPerDay;
    estimated += perDay * remainingDays;
  }
  return { actual, estimated, total: actual + estimated, basis: { fromLastYear, fromGeometry, observedMonths: observed.length } };
}
