import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHistory, type HistTotals } from "../lib/api";
import { useSmartPoll } from "../lib/usePoll";
import { cardSm, plate, h2First, h2Mid } from "../lib/ui";
import { IconChevron, IconSun, IconHouse, IconBattery, IconGrid } from "../lib/icons";
import { BarChart, LineMini } from "./Chart";
import { MetricSection } from "./MetricSection";
import { InsightList } from "./InsightList";
import { analyzeHistory } from "../lib/analysis";

type Range = "day" | "month" | "year";
const TABS: { k: Range; label: string }[] = [
  { k: "day", label: "วัน" },
  { k: "month", label: "เดือน" },
  { k: "year", label: "ปี" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function HistoryView({ active, stationId, capacity }: { active: boolean; stationId?: number | null; capacity?: number }) {
  const [range, setRange] = useState<Range>("day");
  const [ref, setRef] = useState(() => new Date());
  const [points, setPoints] = useState<any[] | null>(null);
  const [totals, setTotals] = useState<HistTotals | null>(null);

  // Monotonic request id — a slow older fetch (after a fast range/station switch or
  // a tab wake) is ignored so it can't overwrite the current period's state.
  const reqRef = useRef(0);
  const load = useCallback((clearOnError: boolean) => {
    const id = ++reqRef.current;
    getHistory(range, isoLocal(ref), stationId)
      .then((r) => { if (id === reqRef.current) { setPoints(r.points || []); setTotals(r.totals ?? null); } })
      .catch(() => { if (id === reqRef.current && clearOnError) setPoints([]); });
  }, [range, ref, stationId]);

  useEffect(() => {
    if (!active) return;
    setPoints(null); setTotals(null);
    load(true);
  }, [active, load]);

  // Auto-refresh the CURRENT period every 60s (เสมือน realtime) — past periods are
  // immutable so we skip them; the poll also pauses while the tab is hidden.
  const nowD = new Date();
  const isCurrent = range === "day" ? isoLocal(ref) === isoLocal(nowD)
    : range === "month" ? (ref.getFullYear() === nowD.getFullYear() && ref.getMonth() === nowD.getMonth())
      : ref.getFullYear() === nowD.getFullYear();
  useSmartPoll(() => load(false), 60000, active && isCurrent);

  // Clear points on tab change so we never render the previous range's data
  // shape against the new range (e.g. day frames have no .day/.month → crash).
  const changeRange = (r: Range) => { setRange(r); setRef(new Date()); setPoints(null); };
  // Anchor to day 1 before month/year math so the 31st never skips a short month.
  const shift = (dir: number) => setRef((d) => {
    const n = new Date(d);
    if (range === "day") n.setDate(n.getDate() + dir);
    else if (range === "month") { n.setDate(1); n.setMonth(n.getMonth() + dir); }
    else { n.setDate(1); n.setFullYear(n.getFullYear() + dir); }
    return n;
  });

  const now = new Date();
  const atNow = range === "day" ? isoLocal(ref) === isoLocal(now)
    : range === "month" ? ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth()
      : ref.getFullYear() === now.getFullYear();
  const label = range === "day"
    ? (isoLocal(ref) === isoLocal(now) ? "วันนี้" : ref.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" }))
    : range === "month" ? ref.toLocaleDateString("th-TH-u-ca-gregory", { month: "long", year: "numeric" })
      : "ปี " + ref.getFullYear();

  const sum = (k: string) => (points || []).reduce((a, p) => a + (Number(p[k]) || 0), 0);
  const lastSoc = points && points.length ? Math.round(Number(points[points.length - 1].soc) || 0) : 0;
  const insights = useMemo(
    () => (points && points.length ? analyzeHistory(range, points, capacity, totals) : []),
    [range, points, capacity, totals],
  );

  // Per-metric sections — mirrors the official Deye app (Production / Grid /
  // Consumption / Battery). Day → compact line of instantaneous power; month/year
  // → bars of daily/monthly energy. Each section owns its headline total. Kept
  // low-clutter (1 headline number + short legend + short chart) for elderly users.
  const fmt = (v: number) => v.toFixed(1);
  function sections() {
    if (!points || !points.length) return null;
    if (range === "day") {
      const kw = (k: string) => points!.map((p) => (Number(p[k]) || 0) / 1000);
      return (
        <>
          <MetricSection icon={<IconSun className="w-5 h-5" />} title="การผลิต" accent="var(--color-pv)" soft="var(--color-pv-soft)"
            value={totals ? fmt(totals.gen) : undefined} unit="หน่วย">
            <LineMini values={kw("gen_power")} color="var(--color-pv)" />
          </MetricSection>

          <MetricSection icon={<IconHouse className="w-5 h-5" />} title="การใช้ไฟ" accent="var(--color-use)" soft="var(--color-use-soft)"
            value={totals ? fmt(totals.use) : undefined} unit="หน่วย">
            <LineMini values={kw("use_power")} color="var(--color-use)" />
          </MetricSection>

          <MetricSection icon={<IconGrid className="w-5 h-5" />} title="กริด (ไฟหลวง)" accent="var(--color-grid)" soft="var(--color-grid-soft)"
            value={totals ? fmt(totals.buy) : undefined} unit="ซื้อ"
            sub={totals ? `ขาย ${fmt(totals.sell)} หน่วย` : undefined}>
            <LineMini values={kw("grid_power")} color="var(--color-grid)" />
          </MetricSection>

          <MetricSection icon={<IconBattery className="w-5 h-5" />} title="แบตเตอรี่" accent="var(--color-batt)" soft="var(--color-batt-soft)"
            value={String(lastSoc)} unit="%"
            legend={[["กำลังแบต (kW)", "var(--color-batt)"], ["แบต % (SOC)", "#0b6b48"]]}>
            <LineMini values={kw("batt_power")} color="var(--color-batt)"
              secondary={{ values: points!.map((p) => Number(p.soc) || 0), color: "#0b6b48", max: 100 }} />
          </MetricSection>
        </>
      );
    }
    // month / year — energy bars
    const labels = points.map((p) => range === "month" ? String(p.day || "").slice(8) : String(p.month || "").slice(5));
    const col = (k: string) => points!.map((p) => Number(p[k]) || 0);
    const hasBatt = range === "month"; // the year rollup carries no charge/discharge
    return (
      <>
        <MetricSection icon={<IconSun className="w-5 h-5" />} title="การผลิต" accent="var(--color-pv)" soft="var(--color-pv-soft)"
          value={fmt(sum("gen"))} unit="หน่วย">
          <BarChart labels={labels} series={[{ color: "var(--color-pv)", data: col("gen") }]} />
        </MetricSection>

        <MetricSection icon={<IconHouse className="w-5 h-5" />} title="การใช้ไฟ" accent="var(--color-use)" soft="var(--color-use-soft)"
          value={fmt(sum("use"))} unit="หน่วย">
          <BarChart labels={labels} series={[{ color: "var(--color-use)", data: col("use") }]} />
        </MetricSection>

        <MetricSection icon={<IconGrid className="w-5 h-5" />} title="กริด (ไฟหลวง)" accent="var(--color-grid)" soft="var(--color-grid-soft)"
          value={fmt(sum("buy"))} unit="ซื้อ" sub={`ขาย ${fmt(sum("sell"))} หน่วย`}
          legend={[["ซื้อ", "var(--color-grid)"], ["ขาย", "var(--color-warn)"]]}>
          <BarChart labels={labels} series={[{ color: "var(--color-grid)", data: col("buy") }, { color: "var(--color-warn)", data: col("sell") }]} />
        </MetricSection>

        {hasBatt && (
          <MetricSection icon={<IconBattery className="w-5 h-5" />} title="แบตเตอรี่" accent="var(--color-batt)" soft="var(--color-batt-soft)"
            value={fmt(sum("charge"))} unit="ชาร์จ" sub={`จ่าย ${fmt(sum("discharge"))} หน่วย`}
            legend={[["ชาร์จเข้า", "var(--color-batt)"], ["จ่ายออก", "#8fd8bf"]]}>
            <BarChart labels={labels} series={[{ color: "var(--color-batt)", data: col("charge") }, { color: "#8fd8bf", data: col("discharge") }]} />
          </MetricSection>
        )}
      </>
    );
  }

  return (
    <>
      <h2 className={h2First}>ย้อนหลัง</h2>
      <div className={`flex ${cardSm} p-1.5 gap-1.5 sticky top-2 z-10`}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => changeRange(t.k)}
            className={`flex-1 min-h-12 rounded-xl text-[17px] font-bold transition-colors ${range === t.k ? "bg-primary text-ink" : "text-body"}`}>
            {t.label}
          </button>
        ))}
      </div>

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

      {points === null ? (
        <div className="skeleton h-[280px] rounded-[20px] mt-3" />
      ) : points.length === 0 ? (
        <div className={`${plate} p-4 mt-3`}><p className="text-center text-muted py-12">ไม่มีข้อมูลช่วงนี้</p></div>
      ) : sections()}

      {insights.length > 0 && (
        <>
          <h2 className={h2Mid}>วิเคราะห์</h2>
          <InsightList items={insights} />
        </>
      )}
    </>
  );
}
