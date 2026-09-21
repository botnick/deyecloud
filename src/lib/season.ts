// Year-level insight math — pure, unit-tested. Inputs are the monthly roll-ups the
// History year view already has (this year + last year), each carrying `days` =
// COVERAGE (how many daily rows the month really has), plus today's partial
// production and the station's astronomical clear-sky PSH per month.
//
// Provenance rules (the whole point of the coverage field):
//   • rate (kWh/day) is over COVERED days, never over the calendar month;
//   • a month is `complete` only when coverage equals its calendar length — only
//     complete months feed baselines (best/worst, YoY, projection);
//   • an existing month with coverage > 0 and gen = 0 is a VERIFIED zero and stays
//     in comparisons; a month with coverage 0 is unknown and drops out;
//   • the running month's rate excludes today (partial day) — so at day 1 there is
//     no rate at all rather than a fabricated one.
export interface MonthRow { month: string; gen: number; days?: number; use?: number }
export interface MonthStat { m: number; gen: number; coverage: number; calendarDays: number; perDay: number | null; complete: boolean; running: boolean }

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const SEASON_OF: Record<number, "hot" | "rainy" | "cool"> = { 1: "cool", 2: "cool", 3: "hot", 4: "hot", 5: "hot", 6: "rainy", 7: "rainy", 8: "rainy", 9: "rainy", 10: "rainy", 11: "cool", 12: "cool" };
export const SEASON_TH = { hot: "ฤดูร้อน (มี.ค.–พ.ค.)", rainy: "ฤดูฝน (มิ.ย.–ต.ค.)", cool: "ฤดูหนาว (พ.ย.–ก.พ.)" } as const;

export function monthStats(rows: MonthRow[], year: number, today: string, todayGen: number | null = null): MonthStat[] {
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7));
  const by = new Map(rows.map((r) => [Number(r.month.slice(5, 7)), r]));
  const out: MonthStat[] = [];
  for (let m = 1; m <= 12; m++) {
    const r = by.get(m);
    const running = year === ty && m === tm;
    const calendarDays = daysInMonth(year, m);
    const gen = r ? Number(r.gen) || 0 : 0;
    let coverage = r ? Number(r.days ?? 0) : 0;
    let numerator = gen;
    if (running) {
      // today's daily row is in both the sum and the count — take it out of the rate
      if (todayGen == null) { coverage = 0; }               // can't separate today → no rate
      else if (coverage > 0) { coverage -= 1; numerator = Math.max(0, gen - todayGen); }
    }
    out.push({
      m, gen, coverage, calendarDays,
      perDay: coverage > 0 ? numerator / coverage : null,
      complete: !running && coverage >= calendarDays,
      running,
    });
  }
  return out;
}

export function bestWorst(stats: MonthStat[]) {
  const have = stats.filter((s) => s.complete && s.perDay != null);
  if (have.length < 2) return null;
  const best = have.reduce((a, b) => (b.perDay! > a.perDay! ? b : a));
  const worst = have.reduce((a, b) => (b.perDay! < a.perDay! ? b : a));
  return { best, worst };
}

// Day-weighted over COVERED days of complete months (partial months excluded).
export function seasonSummary(stats: MonthStat[]) {
  const acc: Record<string, { gen: number; days: number }> = { hot: { gen: 0, days: 0 }, rainy: { gen: 0, days: 0 }, cool: { gen: 0, days: 0 } };
  for (const s of stats) if (s.complete && s.perDay != null) { const k = SEASON_OF[s.m]; acc[k].gen += s.perDay * s.coverage; acc[k].days += s.coverage; }
  return (["hot", "rainy", "cool"] as const).map((k) => ({ season: k, label: SEASON_TH[k], perDay: acc[k].days ? acc[k].gen / acc[k].days : null, days: acc[k].days }));
}

export function yearOverYear(cur: MonthStat[], prev: MonthStat[]) {
  const pairs = cur.map((c) => ({ m: c.m, cur: c, prev: prev[c.m - 1] }))
    .filter((p) => p.cur.complete && p.cur.perDay != null && p.prev && p.prev.complete && p.prev.perDay != null)
    .map((p) => ({ m: p.m, cur: p.cur.perDay!, prev: p.prev.perDay! }));
  if (!pairs.length) return null;
  const c = pairs.reduce((a, p) => a + p.cur, 0), p = pairs.reduce((a, q) => a + q.prev, 0);
  return { months: pairs.length, pct: p > 0 ? Math.round(((c - p) / p) * 100) : null, pairs };
}

// Full-year figure = RECORDED actual (everything in the roll-ups, today included)
// + ESTIMATE for days after today. Baselines come only from complete months:
// last year's same month when complete, else this year's observed rate scaled by
// the station's PSH ratio. null until at least one complete month exists.
export function projectYear(cur: MonthStat[], prev: MonthStat[] | null, pshByMonth: number[] | null, year: number, today: string) {
  const observed = cur.filter((s) => s.complete && s.perDay != null);
  if (!observed.length) return null;
  const obsPerDay = observed.reduce((a, s) => a + s.perDay! * s.coverage, 0) / observed.reduce((a, s) => a + s.coverage, 0);
  const obsPsh = pshByMonth ? observed.reduce((a, s) => a + pshByMonth[s.m - 1], 0) / observed.length : null;
  const ty = Number(today.slice(0, 4)), tm = Number(today.slice(5, 7)), td = Number(today.slice(8, 10));
  const actual = cur.reduce((a, s) => a + s.gen, 0); // recorded, today included
  let estimated = 0, fromLastYear = 0, fromGeometry = 0;
  const incomplete = cur.filter((s) => !s.complete && !s.running && (year < ty || (year === ty && s.m < tm)) && s.coverage < s.calendarDays).length;
  for (const s of cur) {
    if (year < ty || (year === ty && s.m < tm)) continue;          // past months: recorded only, never re-estimated
    const remainingDays = s.running ? s.calendarDays - td : s.calendarDays; // strictly AFTER today
    if (remainingDays <= 0) continue;
    const ly = prev && prev[s.m - 1] && prev[s.m - 1].complete && prev[s.m - 1].perDay != null ? prev[s.m - 1].perDay! : null;
    let perDay: number;
    if (ly != null) { perDay = ly; fromLastYear++; }
    else if (pshByMonth && obsPsh) { perDay = obsPerDay * (pshByMonth[s.m - 1] / obsPsh); fromGeometry++; }
    else perDay = obsPerDay;
    estimated += perDay * remainingDays;
  }
  return { actual, estimated, total: actual + estimated, basis: { fromLastYear, fromGeometry, observedMonths: observed.length, incompleteMonths: incomplete } };
}
