import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHistory, type HistTotals } from "../lib/api";
import { useSmartPoll } from "../lib/usePoll";
import { useSettings } from "../lib/settings";
import { savingsOf, savingsLabel, co2Of, baht } from "../lib/economics";
import { cardP, plate, h2Mid } from "../lib/ui";
import { IconChevron, IconSun, IconHouse, IconBattery, IconGrid } from "../lib/icons";
import { BarChart, LineMini, Legend } from "./Chart";
import { MetricSection } from "./MetricSection";
import { Collapsible } from "./Collapsible";
import { InfoTip } from "./InfoTip";
import { PowerProfile } from "./PowerProfile";
import { LifetimeView } from "./LifetimeView";
import { InsightList } from "./InsightList";
import { analyzeHistory } from "../lib/analysis";
import { bkkToday } from "../lib/format";
import { YearInsights } from "./YearInsights";

type Range = "day" | "month" | "year" | "lifetime";
const TABS: { k: Range; label: string }[] = [
  { k: "day", label: "วัน" },
  { k: "month", label: "เดือน" },
  { k: "year", label: "ปี" },
  { k: "lifetime", label: "ตลอด" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Asia/Bangkok wall clock (UTC getters on a +7h-shifted date) — sample timestamps
// are BKK-day data, so labels must not follow the viewer's timezone.
const hhmm = (ts: number) => { const d = new Date((ts + 7 * 3600) * 1000); return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`; };

export function HistoryView({ active, stationId, isPrimary = true, capacity }: { active: boolean; stationId?: number | null; isPrimary?: boolean; capacity?: number }) {
  const [range, setRange] = useState<Range>("day");
  const [ref, setRef] = useState(() => new Date());
  const [points, setPoints] = useState<any[] | null>(null);
  const [totals, setTotals] = useState<HistTotals | null>(null);
  const [todayGen, setTodayGen] = useState<number | null>(null); // year view: today's partial production (from the year payload)
  const [prev, setPrev] = useState<{ points: any[]; totals: HistTotals | null } | null>(null); // previous period, for the compare row
  // Day-view window: "mid" = calendar day 00:00→24:00 (certified totals, compare,
  // insights). "noon" = เที่ยงวัน→เที่ยงวันถัดไป — the night sits UNBROKEN in the
  // middle, which is what a solar+battery day actually looks like. Noon mode is
  // stitched from two calendar days' samples, so certified day totals don't apply
  // (the summary there is integrated from the 5-min power curve instead).
  const [dayWin, setDayWin] = useState<"mid" | "noon">("mid");
  const noon = range === "day" && dayWin === "noon";
  const noonStart = (d: Date) => Math.floor(new Date(isoLocal(d) + "T12:00:00+07:00").getTime() / 1000);
  const { settings } = useSettings();

  // Monotonic request id — a slow older fetch (after a fast range/station switch or
  // a tab wake) is ignored so it can't overwrite the current period's state.
  const reqRef = useRef(0);
  const load = useCallback((clearOnError: boolean) => {
    if (range === "lifetime") return; // lifetime has its own loader
    const id = ++reqRef.current;
    if (range === "day" && dayWin === "noon") {
      const d2 = new Date(ref); d2.setDate(d2.getDate() + 1);
      const start = noonStart(ref), end = start + 86400;
      // Day B (the window's second half) starts at BKK midnight = start+12h. Before
      // that moment it cannot have data — skip the request (the current window would
      // otherwise refetch an empty tomorrow every 60 s). Once B is in the past its
      // failure is a REAL failure: swallowing it would silently show half a window.
      const bExists = Date.now() / 1000 >= start + 12 * 3600;
      Promise.all([
        getHistory("day", isoLocal(ref), stationId),
        bExists ? getHistory("day", isoLocal(d2), stationId) : Promise.resolve({ points: [] } as any),
      ]).then(([a, b]) => {
        if (id !== reqRef.current) return;
        setPoints([...(a.points || []), ...(b.points || [])].filter((p: any) => p.ts >= start && p.ts < end));
        setTotals(null); // calendar-day totals don't describe this window
      }).catch(() => { if (id === reqRef.current && clearOnError) setPoints([]); });
      return;
    }
    getHistory(range, isoLocal(ref), stationId)
      .then((r) => { if (id === reqRef.current) { setPoints(r.points || []); setTotals(r.totals ?? null); setTodayGen((r as any).todayGen ?? null); } })
      .catch(() => { if (id === reqRef.current && clearOnError) setPoints([]); });
  }, [range, ref, stationId, dayWin]);

  useEffect(() => {
    if (!active || range === "lifetime") return;
    setPoints(null); setTotals(null); setPrev(null);
    load(true);
    if (range === "day" && dayWin === "noon") return; // no compare row in the noon window
    // Previous period (yesterday / last month / last year) — cached server-side,
    // immutable, one extra request. Failure just hides the compare row.
    const p = new Date(ref);
    if (range === "day") p.setDate(p.getDate() - 1);
    else if (range === "month") { p.setDate(1); p.setMonth(p.getMonth() - 1); }
    else { p.setDate(1); p.setFullYear(p.getFullYear() - 1); }
    const id = reqRef.current;
    getHistory(range, isoLocal(p), stationId)
      .then((r) => { if (id === reqRef.current) setPrev({ points: r.points || [], totals: r.totals ?? null }); })
      .catch(() => {});
  }, [active, load, range]);

  // Auto-refresh the CURRENT period every 60s (เสมือน realtime) — past periods are
  // immutable so we skip them; the poll also pauses while the tab is hidden.
  const nowD = new Date();
  const isCurrent = range === "day" ? (dayWin === "noon" ? Date.now() / 1000 < noonStart(ref) + 86400 && Date.now() / 1000 >= noonStart(ref) : isoLocal(ref) === isoLocal(nowD))
    : range === "month" ? (ref.getFullYear() === nowD.getFullYear() && ref.getMonth() === nowD.getMonth())
      : range === "year" ? ref.getFullYear() === nowD.getFullYear() : false;
  useSmartPoll(() => load(false), 60000, active && range !== "lifetime" && isCurrent);

  // Clear points on tab change so we never render the previous range's data
  // shape against the new range (e.g. day frames have no .day/.month → crash).
  // The ref date whose window CONTAINS now, per mode: mid = today; noon = today
  // after 12:00 BKK, else yesterday (that cycle runs yesterday 12:00 → today 12:00).
  const currentAnchor = (w: "mid" | "noon") => {
    // BKK "today" (not the viewer's): take now+7h in UTC for the day key, then
    // materialize it as viewer-local midnight so isoLocal(d) round-trips to that
    // key. At 13:00 BKK = 23:00 previous day in LA, the active noon cycle is
    // still the BKK 17th — viewer-local fields would anchor a day early.
    const key = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    const n = new Date(key + "T00:00:00");
    if (w === "noon" && Date.now() / 1000 < noonStart(n)) n.setDate(n.getDate() - 1);
    return n;
  };
  const changeRange = (r: Range) => { reqRef.current++; setRange(r); setRef(r === "day" ? currentAnchor(dayWin) : new Date()); setPoints(null); setTotals(null); setPrev(null); };
  const changeDayWin = (w: "mid" | "noon") => {
    reqRef.current++; // kill any in-flight fetch of the old window immediately
    setDayWin(w); setPoints(null); setTotals(null); setPrev(null);
    // Re-anchor ONLY when leaving the cycle that contains now — a historical date
    // the user navigated to stays put in both directions.
    const leavingCurrent = isoLocal(ref) === isoLocal(currentAnchor(dayWin));
    if (leavingCurrent) setRef(currentAnchor(w));
  };
  // Anchor to day 1 before month/year math so the 31st never skips a short month.
  const shift = (dir: number) => setRef((d) => {
    const n = new Date(d);
    if (range === "day") n.setDate(n.getDate() + dir);
    else if (range === "month") { n.setDate(1); n.setMonth(n.getMonth() + dir); }
    else { n.setDate(1); n.setFullYear(n.getFullYear() + dir); }
    return n;
  });

  const now = new Date();
  const atNow = range === "day" ? (noon ? Date.now() / 1000 < noonStart(ref) + 86400 && Date.now() / 1000 >= noonStart(ref) : isoLocal(ref) === isoLocal(now))
    : range === "month" ? ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth()
      : ref.getFullYear() === now.getFullYear();
  const dShort = (d: Date) => d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });
  const refNext = new Date(ref); refNext.setDate(refNext.getDate() + 1);
  const label = range === "day"
    ? noon ? `${dShort(ref)} – ${dShort(refNext)} (เที่ยงถึงเที่ยง)`
      : (isoLocal(ref) === isoLocal(now) ? "วันนี้" : ref.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" }))
    : range === "month" ? ref.toLocaleDateString("th-TH-u-ca-gregory", { month: "long", year: "numeric" })
      : "ปี " + ref.getFullYear();

  const sum = (k: string) => (points || []).reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const lastSoc = points && points.length ? Math.round(Number(points[points.length - 1].soc) || 0) : 0;
  const insights = useMemo(
    () => (points && points.length && range !== "lifetime" && !noon ? analyzeHistory(range, points, capacity, totals, settings) : []),
    [range, points, capacity, totals, settings, noon],
  );

  // ── period money + carbon (single shared formula via economics.savingsOf) ──
  // For the day the certified totals carry use/buy/sell; month/year sum the rows.
  const periodTotals = range === "day" ? totals
    : { gen: sum("gen"), use: sum("use"), buy: sum("buy"), sell: sum("sell"), charge: sum("charge"), discharge: sum("discharge") };
  const saved = periodTotals ? savingsOf(periodTotals, settings) : null;
  const co2 = periodTotals ? co2Of(periodTotals.gen || 0, settings) : null;
  const spanWord = range === "day" ? (isCurrent ? "วันนี้" : "วันนั้น") : range === "month" ? (isCurrent ? "เดือนนี้" : "เดือนนั้น") : (isCurrent ? "ปีนี้" : "ปีนั้น");
  // in-progress month: the money from whole days so far, averaged and scaled to the
  // month (today is partial, so it is left out — same rule as the Home card)
  const projSaved = useMemo(() => {
    if (range !== "month" || !isCurrent || !points) return null;
    const today = bkkToday();
    const past = points.filter((p) => String(p.day) < today);
    const len = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
    if (past.length < 3 || Number(today.slice(8, 10)) >= len) return null;
    const sum = (k: string) => past.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const s = savingsOf({ use: sum("use"), buy: sum("buy"), sell: sum("sell") }, settings);
    return s > 0 ? (s / past.length) * len : null;
  }, [range, isCurrent, points, settings]);

  // ── compare with the previous period, like for like ──
  // A month/year still in progress is compared with the SAME elapsed slice of the
  // previous one (day 1..today's date, month 1..this month), never with the whole
  // of it. A day is compared with the whole of yesterday (labelled so).
  const compare = useMemo(() => {
    if (!prev || !periodTotals) return null;
    let pts = prev.points;
    let curPts = points || [];
    // In-progress month/year: today / this month is incomplete, so drop that
    // boundary unit on BOTH sides — days 1..(d−1) vs the same days last month.
    let sliceN = 0;
    if (range === "month" && isCurrent) {
      // equal slice must exist in BOTH months: cap by the previous month's length (Mar 30 → 28 days vs Feb)
      const n = new Date(); const prevLen = new Date(n.getFullYear(), n.getMonth(), 0).getDate();
      sliceN = Math.min(n.getDate() - 1, prevLen); if (sliceN < 1) return null; pts = pts.filter((p) => Number(String(p.day).slice(8, 10)) <= sliceN); curPts = curPts.filter((p) => Number(String(p.day).slice(8, 10)) <= sliceN); }
    if (range === "year" && isCurrent) { sliceN = new Date().getMonth(); if (sliceN < 1) return null; pts = pts.filter((p) => Number(String(p.month).slice(5, 7)) <= sliceN); curPts = curPts.filter((p) => Number(String(p.month).slice(5, 7)) <= sliceN); }
    const ps = (k: string) => pts.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const cs = (k: string) => curPts.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const cur = range !== "day" && isCurrent ? { gen: cs("gen"), use: cs("use"), buy: cs("buy"), sell: cs("sell") } : periodTotals;
    let pt: { gen?: number; use?: number; buy?: number; sell?: number } | null;
    if (range === "day" && isCurrent) {
      // Yesterday up to THIS time of day, integrated from its 5-min power samples
      // (kWh = W × h / 1000) — comparing a half-day with a full day would be unfair.
      const nowTod = (Date.now() / 1000 + 7 * 3600) % 86400;
      const rows = pts.filter((p) => ((Number(p.ts) + 7 * 3600) % 86400) <= nowTod).sort((a, b) => Number(a.ts) - Number(b.ts));
      const acc = { gen: 0, use: 0, buy: 0, sell: 0 };
      for (let i = 1; i < rows.length; i++) {
        const h = Math.min(0.25, Math.max(0, (Number(rows[i].ts) - Number(rows[i - 1].ts)) / 3600)); // cap gaps at 15 min
        acc.gen += (Number(rows[i].gen_power) || 0) * h / 1000; acc.use += (Number(rows[i].use_power) || 0) * h / 1000;
        const g = Number(rows[i].grid_power) || 0; acc.buy += Math.max(0, g) * h / 1000; acc.sell += Math.max(0, -g) * h / 1000;
      }
      pt = rows.length > 1 ? acc : null;
    } else pt = range === "day" ? prev.totals : { gen: ps("gen"), use: ps("use"), buy: ps("buy"), sell: ps("sell") };
    if (!pt) return null;
    const pSaved = savingsOf(pt, settings);
    const cSaved = savingsOf(cur, settings);
    const d = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
    return {
      label: range === "day" ? (isCurrent ? "เมื่อวานถึงเวลานี้" : "วันก่อนหน้า")
        : range === "month" ? (isCurrent ? `${sliceN} วันแรกของเดือนก่อน (ไม่รวมวันนี้)` : "เดือนก่อน")
        : (isCurrent ? `${sliceN} เดือนแรกของปีก่อน (ไม่รวมเดือนนี้)` : "ปีก่อน"),
      gen: { now: cur.gen || 0, prev: pt.gen || 0, pct: d(cur.gen || 0, pt.gen || 0) },
      use: { now: cur.use || 0, prev: pt.use || 0, pct: d(cur.use || 0, pt.use || 0) },
      buy: { now: cur.buy || 0, prev: pt.buy || 0, pct: d(cur.buy || 0, pt.buy || 0) },
      saved: { now: cSaved, prev: pSaved },
    };
  }, [prev, points, periodTotals, range, isCurrent, settings]);
  // Noon-window summary: kWh integrated from the 5-min curve (no certified totals
  // exist for a noon→noon window), split at the clock into กลางวัน 06:00–18:00 and
  // กลางคืน 18:00–06:00 — presentation buckets, not thresholds.
  const noonSummary = useMemo(() => {
    if (!noon || !points || points.length < 2) return null;
    const rows = [...points].sort((a, b) => Number(a.ts) - Number(b.ts));
    const acc = { dayUse: 0, nightUse: 0, gen: 0, dayBuy: 0, nightBuy: 0, sell: 0, nightBatt: 0 };
    for (let i = 1; i < rows.length; i++) {
      const h = Math.min(0.25, Math.max(0, (Number(rows[i].ts) - Number(rows[i - 1].ts)) / 3600)); // cap gaps at 15 min
      const hr = ((Number(rows[i].ts) + 7 * 3600) % 86400) / 3600; // Bangkok hour-of-day
      const isDay = hr >= 6 && hr < 18;
      const use = (Number(rows[i].use_power) || 0) * h / 1000;
      const buy = Math.max(0, Number(rows[i].grid_power) || 0) * h / 1000;
      acc[isDay ? "dayUse" : "nightUse"] += use;
      acc[isDay ? "dayBuy" : "nightBuy"] += buy;
      acc.gen += (Number(rows[i].gen_power) || 0) * h / 1000;
      acc.sell += Math.max(0, -(Number(rows[i].grid_power) || 0)) * h / 1000;
      if (!isDay) acc.nightBatt += Math.max(0, Number(rows[i].batt_power) || 0) * h / 1000; // discharge, night bucket only (shown under กลางคืน)
    }
    const totalUse = acc.dayUse + acc.nightUse;
    return totalUse > 0.05 ? { ...acc, totalUse, dayPct: Math.round((acc.dayUse / totalUse) * 100) } : null;
  }, [noon, points]);

  // CSV = exactly the rows on screen (works for any station, any source), built
  // client-side; the /api/export endpoint stays for scripts (default station, D1).
  const exportCsv = () => {
    if (!points || !points.length) return;
    const cell = (v: any) => { const t = v == null ? "" : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    let head: string[], rows: any[][];
    if (range === "day") {
      head = ["time (Asia/Bangkok)", "unix_ts", "pv_w", "load_w", "grid_w (+import/-export)", "battery_w (+discharge/-charge)", "soc_%"];
      const bkk = (ts: number) => new Date(ts * 1000 + 7 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
      rows = points.map((p) => [bkk(p.ts), p.ts, p.gen_power, p.use_power, p.grid_power, p.batt_power, p.soc]);
    } else {
      const k = range === "month" ? "day" : "month";
      head = [k, "pv_kwh", "load_kwh", "grid_import_kwh", "grid_export_kwh", "battery_charge_kwh", "battery_discharge_kwh"];
      rows = points.map((p) => [p[k], p.gen, p.use, p.buy, p.sell, p.charge, p.discharge]);
    }
    if (range === "day" && totals) {
      // separate, explicitly-headed kWh block — never under the power columns
      rows.push([], ["day_totals_kwh", "pv_kwh", "load_kwh", "grid_import_kwh", "grid_export_kwh", "battery_charge_kwh", "battery_discharge_kwh"]);
      rows.push([isoLocal(ref), totals.gen, totals.use, totals.buy, totals.sell, totals.charge ?? "", totals.discharge ?? ""]);
    }
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `deye-${range}${noon ? "-noon" : ""}-${isoLocal(ref)}${stationId != null ? `-st${stationId}` : ""}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Only show the battery section when the system actually has a battery in this
  // period — fixes the year (now carries charge/discharge) and hides it for on-grid.
  const battActive = range === "day"
    ? (!!(periodTotals && ((periodTotals.charge || 0) > 0.05 || (periodTotals.discharge || 0) > 0.05))
      || (points || []).some((p) => Math.abs(Number(p.batt_power) || 0) > 15 || (Number(p.soc) || 0) > 0.5))
    : ((periodTotals?.charge || 0) + (periodTotals?.discharge || 0)) > 0.1;

  const fmt = (v: number) => v.toFixed(1);
  // peak of a day series → {value, ts}; null when flat/empty
  const peak = (k: string) => {
    let bi = -1, bv = -Infinity;
    (points || []).forEach((p, i) => { const v = Number(p[k]) || 0; if (v > bv) { bv = v; bi = i; } });
    return bi < 0 ? null : { v: bv, ts: (points as any[])[bi].ts as number };
  };
  // best row in a month/year series → {value, label}
  const bestRow = (k: string, lab: (p: any) => string) => {
    let bi = -1, bv = -Infinity;
    (points || []).forEach((p, i) => { const v = Number(p[k]) || 0; if (v > bv) { bv = v; bi = i; } });
    return bi < 0 || bv <= 0 ? null : { v: bv, label: lab((points as any[])[bi]) };
  };

  // Time axis (เช้า→เย็น) for the day line charts so the curve isn't a mute shape.
  const dayXLabels = points && points.length
    ? [hhmm(points[0].ts), hhmm(points[Math.floor(points.length / 2)].ts), hhmm(points[points.length - 1].ts)]
    : [];

  function sections() {
    if (!points || !points.length) return null;
    if (range === "day") {
      const kw = (k: string) => points!.map((p) => (Number(p[k]) || 0) / 1000);
      const pGen = peak("gen_power"), pUse = peak("use_power"), pBuy = peak("grid_power");
      const maxSoc = Math.round(Math.max(0, ...points!.map((p) => Number(p.soc) || 0)));
      return (
        <>
          <MetricSection icon={<IconSun className="w-5 h-5" />} title="การผลิต" accent="var(--color-pv)" soft="var(--color-pv-soft)"
            value={totals ? fmt(totals.gen) : undefined} unit="หน่วย"
            caption={pGen && pGen.v > 5 ? <>ผลิตสูงสุด <b>{fmt(pGen.v / 1000)} kW</b> ตอน {hhmm(pGen.ts)} น.</> : "ยังไม่มีการผลิตในช่วงนี้"}>
            <LineMini values={kw("gen_power")} color="var(--color-pv)" xLabels={dayXLabels} unit="kW" markPeak />
          </MetricSection>

          <MetricSection icon={<IconHouse className="w-5 h-5" />} title="การใช้ไฟ" accent="var(--color-use)" soft="var(--color-use-soft)"
            value={totals ? fmt(totals.use) : undefined} unit="หน่วย"
            caption={pUse ? <>ใช้ไฟสูงสุด <b>{fmt(pUse.v / 1000)} kW</b> ตอน {hhmm(pUse.ts)} น.</> : undefined}>
            <LineMini values={kw("use_power")} color="var(--color-use)" xLabels={dayXLabels} unit="kW" markPeak />
          </MetricSection>

          <MetricSection icon={<IconGrid className="w-5 h-5" />} title="การไฟฟ้า" accent="var(--color-grid)" soft="var(--color-grid-soft)"
            value={totals ? fmt(totals.buy) : undefined} unit="ซื้อไฟ"
            sub={totals ? `ไฟย้อน ${fmt(totals.sell)} หน่วย` : undefined}
            caption={pBuy && pBuy.v > 20
              ? <>ซื้อไฟมากสุด <b>{fmt(pBuy.v / 1000)} kW</b> ตอน {hhmm(pBuy.ts)} น.{totals && totals.sell > 0.05 ? ` · ไฟย้อน ${fmt(totals.sell)} หน่วย` : ""}</>
              : "ไม่ได้ซื้อไฟจากการไฟฟ้าเลย — พึ่งพาตัวเองล้วน"}>
            <LineMini values={kw("grid_power")} color="var(--color-grid)" xLabels={dayXLabels} unit="kW" />
          </MetricSection>

          {battActive && (
            <MetricSection icon={<IconBattery className="w-5 h-5" />} title="แบตเตอรี่" accent="var(--color-batt)" soft="var(--color-batt-soft)"
              value={String(lastSoc)} unit="%"
              caption={<>แบตเตอรี่สูงสุด <b>{maxSoc}%</b>{totals ? ` · ชาร์จ ${fmt(totals.charge)} / จ่าย ${fmt(totals.discharge)} หน่วย` : ""}</>}
              legend={[["กำลังแบตเตอรี่ (kW)", "var(--color-batt)"], ["ระดับแบตเตอรี่ (%)", "#0b6b48"]]}>
              <LineMini values={kw("batt_power")} color="var(--color-batt)" xLabels={dayXLabels} unit="kW"
                secondary={{ values: points!.map((p) => Number(p.soc) || 0), color: "#0b6b48", max: 100 }} />
            </MetricSection>
          )}
        </>
      );
    }
    // month / year — energy bars
    const per = range === "month" ? "วัน" : "เดือน";
    const labFn = range === "month" ? (p: any) => "วันที่ " + String(p.day || "").slice(8) : (p: any) => "เดือน " + String(p.month || "").slice(5);
    const labels = points.map((p) => range === "month" ? String(p.day || "").slice(8) : String(p.month || "").slice(5));
    const col = (k: string) => points!.map((p) => Number(p[k]) || 0);
    const n = points.length || 1;
    const avg = (k: string) => sum(k) / n;
    const bGen = bestRow("gen", labFn), bUse = bestRow("use", labFn);
    return (
      <>
        <MetricSection icon={<IconSun className="w-5 h-5" />} title="การผลิต" accent="var(--color-pv)" soft="var(--color-pv-soft)"
          value={fmt(sum("gen"))} unit="หน่วย"
          caption={<>เฉลี่ย{per}ละ <b>{fmt(avg("gen"))} หน่วย</b>{bGen ? ` · สูงสุด ${bGen.label} (${fmt(bGen.v)})` : ""}</>}>
          <BarChart labels={labels} series={[{ color: "var(--color-pv)", data: col("gen") }]} />
        </MetricSection>

        <MetricSection icon={<IconHouse className="w-5 h-5" />} title="การใช้ไฟ" accent="var(--color-use)" soft="var(--color-use-soft)"
          value={fmt(sum("use"))} unit="หน่วย"
          caption={<>เฉลี่ย{per}ละ <b>{fmt(avg("use"))} หน่วย</b>{bUse ? ` · สูงสุด ${bUse.label} (${fmt(bUse.v)})` : ""}</>}>
          <BarChart labels={labels} series={[{ color: "var(--color-use)", data: col("use") }]} />
        </MetricSection>

        <MetricSection icon={<IconGrid className="w-5 h-5" />} title="การไฟฟ้า" accent="var(--color-grid)" soft="var(--color-grid-soft)"
          value={fmt(sum("buy"))} unit="ซื้อไฟ" sub={`ไฟย้อน ${fmt(sum("sell"))} หน่วย`}
          caption={<>ซื้อรวม <b>{fmt(sum("buy"))}</b> · ไฟย้อนรวม <b>{fmt(sum("sell"))}</b> หน่วย</>}
          legend={[["ซื้อ", "var(--color-grid)"], ["ไฟย้อน", "var(--color-warn)"]]}>
          <BarChart labels={labels} series={[{ color: "var(--color-grid)", data: col("buy") }, { color: "var(--color-warn)", data: col("sell") }]} />
        </MetricSection>

        {battActive && (
          <MetricSection icon={<IconBattery className="w-5 h-5" />} title="แบตเตอรี่" accent="var(--color-batt)" soft="var(--color-batt-soft)"
            value={fmt(sum("charge"))} unit="ชาร์จ" sub={`จ่าย ${fmt(sum("discharge"))} หน่วย`}
            caption={<>ชาร์จเข้ารวม <b>{fmt(sum("charge"))}</b> · จ่ายออกรวม <b>{fmt(sum("discharge"))}</b> หน่วย</>}
            legend={[["ชาร์จเข้า", "var(--color-batt)"], ["จ่ายออก", "#8fd8bf"]]}>
            <BarChart labels={labels} series={[{ color: "var(--color-batt)", data: col("charge") }, { color: "#8fd8bf", data: col("discharge") }]} />
          </MetricSection>
        )}
      </>
    );
  }

  // The all-in-one comparison — the PRIMARY view (always shown on top).
  function overview() {
    if (!points || !points.length) return null;
    if (range === "day") return <div className="mt-3"><PowerProfile points={points} startHour={noon ? 12 : 0} key={dayWin} /></div>;
    return (
      <div className={`${plate} p-4 mt-3`}>
        <BarChart
          labels={points.map((p) => range === "month" ? String(p.day || "").slice(8) : String(p.month || "").slice(5))}
          series={[{ color: "var(--color-pv)", data: points.map((p) => Number(p.gen) || 0) }, { color: "var(--color-use)", data: points.map((p) => Number(p.use) || 0) }]} />
        <Legend items={[["ผลิต (หน่วย)", "var(--color-pv)"], ["ใช้ (หน่วย)", "var(--color-use)"]]} />
      </div>
    );
  }

  return (
    <>
      <div className="ios-seg sticky-seg" role="group" aria-label="ช่วงเวลา">
        {TABS.map((t) => (
          <button key={t.k} onClick={() => changeRange(t.k)} aria-pressed={range === t.k}
            className={range === t.k ? "on" : ""}>
            {t.label}
          </button>
        ))}
      </div>

      {range === "lifetime" ? (
        <LifetimeView active={active && range === "lifetime"} />
      ) : (
        <>
          {/* date navigator */}
          <div className="flex items-center justify-between mt-3.5">
            <button onClick={() => shift(-1)} aria-label="ก่อนหน้า" className="w-11 h-11 rounded-full grid place-items-center text-title active:bg-line transition-colors">
              <IconChevron className="w-6 h-6 rotate-180" />
            </button>
            <div className="font-bold text-[16px]">{label}</div>
            <button onClick={() => shift(1)} disabled={atNow} aria-label="ถัดไป" className={`w-11 h-11 rounded-full grid place-items-center transition-colors ${atNow ? "text-line" : "text-title active:bg-line"}`}>
              <IconChevron className="w-6 h-6" />
            </button>
          </div>

          {/* day-window toggle — same segmented-control language as the range tabs */}
          {range === "day" && (
            <div className="ios-seg mt-3" role="group" aria-label="ช่วงของวัน">
              {([["mid", "ทั้งวัน"], ["noon", "เที่ยงถึงเที่ยง"]] as const).map(([w, lab]) => (
                <button key={w} onClick={() => dayWin !== w && changeDayWin(w)} aria-pressed={dayWin === w}
                  className={dayWin === w ? "on" : ""}>
                  {lab}
                </button>
              ))}
            </div>
          )}

          {points === null ? (
            <div className="skeleton h-[280px] rounded-[20px] mt-3" />
          ) : points.length === 0 ? (
            <div className={`${plate} p-4 mt-3`}><p className="text-center text-muted py-12">ไม่มีข้อมูลช่วงนี้</p></div>
          ) : (
            <>
              {/* what this period means for you — money + carbon up top */}
              {saved != null && periodTotals && (periodTotals.use || 0) > 0 && (
                <div className={`${cardP} mt-3`}>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] text-body">{saved != null && saved < -0.5 ? `${spanWord}ค่าไฟเพิ่มสุทธิ` : `${spanWord}ประหยัดค่าไฟ`}</span>
                      <InfoTip text={`คิดจาก (ไฟที่ใช้ − ไฟที่ซื้อ) คูณด้วยค่าไฟ ${settings.rate} บาท/หน่วย${settings.sellRate > 0 ? ` + ขายไฟ × ${settings.sellRate} บาท/หน่วย` : ""} · ถ้าซื้อมากกว่าใช้ (เช่น ชาร์จแบตจากการไฟฟ้า) จะติดลบ = ค่าไฟเพิ่มสุทธิ · แบตที่ชาร์จวันหนึ่งแล้วใช้อีกวันทำให้ตัวเลขรายวันคลาดเคลื่อนได้เล็กน้อย แต่รายเดือน/ปีถัวเฉลี่ยกันไป · ปรับค่าได้ในแท็บ 'ตลอด'`} />
                    </div>
                    <div className={`text-[26px] font-extrabold tabnum leading-none mt-0.5 ${saved != null && saved < -0.5 ? "text-warn" : "text-secondary"}`}>{savingsLabel(saved || 0).text}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12.5px] text-body">ลดคาร์บอน</div>
                    <div className="text-[18px] font-extrabold tabnum leading-none mt-0.5" style={{ color: "#18a673" }}>{Math.round(co2 || 0)}<span className="text-[12px] text-body font-semibold ml-1">กก.</span></div>
                  </div>
                </div>
                {projSaved != null && <div className="text-[13px] text-body mt-1.5 tabnum">คาดทั้งเดือน ~{baht(projSaved)}</div>}
                {range !== "day" && (
                  <div className="grid grid-cols-4 gap-2 mt-3.5 pt-3 border-t border-black/[.06] text-center">
                    {([
                      ["ผลิต", periodTotals.gen], ["ใช้ไฟ", periodTotals.use], ["ซื้อไฟ", periodTotals.buy],
                      (periodTotals.sell || 0) > 0.5 ? ["ไฟย้อน", periodTotals.sell] : ["แบตจ่าย", periodTotals.discharge],
                    ] as [string, number | undefined][]).map(([lab, v]) => (
                      <div key={lab}>
                        <div className="text-[11.5px] text-muted">{lab}</div>
                        <div className="text-[16px] font-extrabold tabnum leading-tight">{Math.round(v || 0).toLocaleString("th-TH")}</div>
                        <div className="text-[10.5px] text-muted">หน่วย</div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              )}
              {compare && (compare.gen.prev > 0 || compare.use.prev > 0) && (
                <div className={`${cardP} mt-3`}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[12.5px] text-body">เทียบกับ {compare.label}</span>
                    <InfoTip text={`เทียบช่วงเวลาเท่ากัน: ${compare.label} — ผลิต/ใช้/ซื้อจากยอดจริงที่ระบบบันทึก และเงินคิดด้วยค่าไฟเดียวกัน`} />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {([
                      ["ผลิต", compare.gen, true], ["ใช้ไฟ", compare.use, null], ["ซื้อไฟ", compare.buy, false],
                    ] as [string, { now: number; prev: number; pct: number | null }, boolean | null][]).map(([lab, v, goodUp]) => (
                      <div key={lab}>
                        <div className="text-[11.5px] text-muted">{lab}</div>
                        <div className={`text-[16px] font-extrabold tabnum leading-tight ${v.pct == null ? "text-body" : goodUp == null ? "text-title" : (v.pct >= 0) === goodUp ? "text-ok" : "text-warn"}`}>
                          {v.pct == null ? `${v.now - v.prev >= 0 ? "+" : "−"}${Math.abs(v.now - v.prev).toFixed(0)} หน่วย` : `${v.pct > 0 ? "+" : ""}${v.pct}%`}
                        </div>
                        <div className="text-[10.5px] text-muted tabnum">เดิม {v.prev.toFixed(0)}</div>
                      </div>
                    ))}
                    <div>
                      <div className="text-[11.5px] text-muted">ประหยัด</div>
                      <div className={`text-[16px] font-extrabold tabnum leading-tight ${compare.saved.now - compare.saved.prev >= 0 ? "text-ok" : "text-warn"}`}>
                        {compare.saved.now - compare.saved.prev >= 0 ? "+" : "−"}฿{Math.round(Math.abs(compare.saved.now - compare.saved.prev)).toLocaleString("th-TH")}
                      </div>
                      <div className="text-[10.5px] text-muted tabnum">เดิม ฿{Math.round(compare.saved.prev).toLocaleString("th-TH")}</div>
                    </div>
                  </div>
                </div>
              )}
              {noonSummary && (() => {
                const nightPending = isCurrent && Date.now() / 1000 < noonStart(ref) + 6 * 3600; // before 18:00 BKK — gate on the phase, not measured usage
                const row = (kind: "day" | "night") => {
                  const day = kind === "day";
                  return (
                    <div className="flex items-center gap-3 py-3">
                      <span className="w-10 h-10 rounded-full grid place-items-center shrink-0" style={{ background: day ? "#fff4dc" : "#ebe9fe", color: day ? "#d97706" : "#4f46e5" }}>
                        {day
                          ? <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" /></svg>
                          : <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[16px] font-bold text-title leading-tight">{day ? "กลางวัน" : "กลางคืน"} <span className="text-[13px] font-medium text-muted">{day ? "06:00–18:00" : "18:00–06:00"}</span></div>
                        <div className="text-[13px] text-body mt-0.5 tabnum">
                          {day ? <>ผลิตไฟ {noonSummary.gen.toFixed(1)} · ซื้อไฟ {noonSummary.dayBuy.toFixed(1)} หน่วย</>
                            : nightPending ? "ยังไม่ถึงช่วงกลางคืน" : <>จากแบต {noonSummary.nightBatt.toFixed(1)} · ซื้อไฟ {noonSummary.nightBuy.toFixed(1)} หน่วย</>}
                        </div>
                      </div>
                      {!(kind === "night" && nightPending) && (
                        <div className="text-right shrink-0">
                          <div className="text-[22px] font-extrabold tabnum leading-none">{(day ? noonSummary.dayUse : noonSummary.nightUse).toFixed(1)}</div>
                          <div className="text-[12px] text-muted mt-0.5">หน่วยที่ใช้</div>
                        </div>
                      )}
                    </div>
                  );
                };
                return (
                  <div className={`${cardP} mt-3`}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[17px] text-title">การใช้ไฟกลางวันและกลางคืน</span>
                      <InfoTip text="คำนวณจากเส้นกำลังไฟทุก 5 นาทีในหน้าต่างนี้ · กลางวัน = 06:00–18:00 กลางคืน = 18:00–06:00 · เป็นค่าประมาณจากการรวมพื้นที่ใต้กราฟ ไม่ใช่มิเตอร์รายวันของ Deye" />
                    </div>
                    {!nightPending && (
                      <>
                        {/* share of the window's use: day amber | night indigo, labels outside so 100/0 still reads */}
                        <div className="h-2.5 rounded-full overflow-hidden flex mt-3 bg-[#ebe9fe]">
                          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${noonSummary.dayPct}%`, background: "#f5a623" }} />
                        </div>
                        <div className="flex justify-between text-[12.5px] font-semibold mt-1.5 tabnum">
                          <span style={{ color: "#b45309" }}>กลางวัน {noonSummary.dayPct}%</span>
                          <span style={{ color: "#4f46e5" }}>กลางคืน {100 - noonSummary.dayPct}%</span>
                        </div>
                      </>
                    )}
                    <div className="mt-1 divide-y divide-black/[.06]">{row("day")}{row("night")}</div>
                  </div>
                );
              })()}
              {overview()}
              {range === "year" && <YearInsights year={ref.getFullYear()} points={points} prevPoints={prev ? prev.points : null} todayGen={todayGen} primary={isPrimary} />}
              {/* per-metric breakdown — folded by default, tap to expand */}
              <Collapsible variant="bare" title="ดูแยกแต่ละค่า" subtitle="ผลิต · ใช้ไฟ · การไฟฟ้า · แบตเตอรี่">
                {sections()}
              </Collapsible>
              <button onClick={exportCsv} className="mt-3 w-full flex items-center justify-center gap-2 h-11 rounded-2xl bg-canvas text-body text-[14px] font-semibold active:scale-[.99] transition-transform">
                ⬇ ดาวน์โหลด CSV ({range === "day" ? "ทุก 5 นาที" : range === "month" ? "รายวัน" : "รายเดือน"}) — ตรงกับที่แสดงอยู่ · เปิดใน Excel ได้
              </button>
            </>
          )}

          {insights.length > 0 && (
            <>
              <h2 className={h2Mid}>วิเคราะห์</h2>
              <InsightList items={insights} />
            </>
          )}
        </>
      )}
    </>
  );
}
