import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getHistory, type HistTotals } from "../lib/api";
import { useSmartPoll } from "../lib/usePoll";
import { useSettings } from "../lib/settings";
import { savingsOf, co2Of, baht } from "../lib/economics";
import { cardP, cardSm, plate, h2First, h2Mid } from "../lib/ui";
import { IconChevron, IconSun, IconHouse, IconBattery, IconGrid } from "../lib/icons";
import { BarChart, LineMini, Legend } from "./Chart";
import { MetricSection } from "./MetricSection";
import { Collapsible } from "./Collapsible";
import { InfoTip } from "./InfoTip";
import { PowerProfile } from "./PowerProfile";
import { LifetimeView } from "./LifetimeView";
import { InsightList } from "./InsightList";
import { analyzeHistory } from "../lib/analysis";

type Range = "day" | "month" | "year" | "lifetime";
const TABS: { k: Range; label: string }[] = [
  { k: "day", label: "วัน" },
  { k: "month", label: "เดือน" },
  { k: "year", label: "ปี" },
  { k: "lifetime", label: "ตลอด" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hhmm = (ts: number) => new Date(ts * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

export function HistoryView({ active, stationId, capacity }: { active: boolean; stationId?: number | null; capacity?: number }) {
  const [range, setRange] = useState<Range>("day");
  const [ref, setRef] = useState(() => new Date());
  const [points, setPoints] = useState<any[] | null>(null);
  const [totals, setTotals] = useState<HistTotals | null>(null);
  const { settings } = useSettings();

  // Monotonic request id — a slow older fetch (after a fast range/station switch or
  // a tab wake) is ignored so it can't overwrite the current period's state.
  const reqRef = useRef(0);
  const load = useCallback((clearOnError: boolean) => {
    if (range === "lifetime") return; // lifetime has its own loader
    const id = ++reqRef.current;
    getHistory(range, isoLocal(ref), stationId)
      .then((r) => { if (id === reqRef.current) { setPoints(r.points || []); setTotals(r.totals ?? null); } })
      .catch(() => { if (id === reqRef.current && clearOnError) setPoints([]); });
  }, [range, ref, stationId]);

  useEffect(() => {
    if (!active || range === "lifetime") return;
    setPoints(null); setTotals(null);
    load(true);
  }, [active, load, range]);

  // Auto-refresh the CURRENT period every 60s (เสมือน realtime) — past periods are
  // immutable so we skip them; the poll also pauses while the tab is hidden.
  const nowD = new Date();
  const isCurrent = range === "day" ? isoLocal(ref) === isoLocal(nowD)
    : range === "month" ? (ref.getFullYear() === nowD.getFullYear() && ref.getMonth() === nowD.getMonth())
      : range === "year" ? ref.getFullYear() === nowD.getFullYear() : false;
  useSmartPoll(() => load(false), 60000, active && range !== "lifetime" && isCurrent);

  // Clear points on tab change so we never render the previous range's data
  // shape against the new range (e.g. day frames have no .day/.month → crash).
  const changeRange = (r: Range) => { setRange(r); setRef(new Date()); setPoints(null); setTotals(null); };
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
    () => (points && points.length && range !== "lifetime" ? analyzeHistory(range, points, capacity, totals) : []),
    [range, points, capacity, totals],
  );

  // ── period money + carbon (single shared formula via economics.savingsOf) ──
  // For the day the certified totals carry use/buy/sell; month/year sum the rows.
  const periodTotals = range === "day" ? totals
    : { gen: sum("gen"), use: sum("use"), buy: sum("buy"), sell: sum("sell"), charge: sum("charge"), discharge: sum("discharge") };
  const saved = periodTotals ? savingsOf(periodTotals, settings) : null;
  const co2 = periodTotals ? co2Of(periodTotals.gen || 0) : null;

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

          <MetricSection icon={<IconGrid className="w-5 h-5" />} title="กริด (ไฟหลวง)" accent="var(--color-grid)" soft="var(--color-grid-soft)"
            value={totals ? fmt(totals.buy) : undefined} unit="ซื้อ"
            sub={totals ? `ขาย ${fmt(totals.sell)} หน่วย` : undefined}
            caption={pBuy && pBuy.v > 20
              ? <>ซื้อไฟมากสุด <b>{fmt(pBuy.v / 1000)} kW</b> ตอน {hhmm(pBuy.ts)} น.{totals && totals.sell > 0.05 ? ` · ไหลย้อนขาย ${fmt(totals.sell)} หน่วย` : ""}</>
              : "ไม่ได้ซื้อไฟจากการไฟฟ้าเลย — ใช้พลังงานตัวเองล้วน 🎉"}>
            <LineMini values={kw("grid_power")} color="var(--color-grid)" xLabels={dayXLabels} unit="kW" />
          </MetricSection>

          {battActive && (
            <MetricSection icon={<IconBattery className="w-5 h-5" />} title="แบตเตอรี่" accent="var(--color-batt)" soft="var(--color-batt-soft)"
              value={String(lastSoc)} unit="%"
              caption={<>แบตสูงสุด <b>{maxSoc}%</b>{totals ? ` · ชาร์จ ${fmt(totals.charge)} / จ่าย ${fmt(totals.discharge)} หน่วย` : ""}</>}
              legend={[["กำลังแบต (kW)", "var(--color-batt)"], ["แบต % (SOC)", "#0b6b48"]]}>
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

        <MetricSection icon={<IconGrid className="w-5 h-5" />} title="กริด (ไฟหลวง)" accent="var(--color-grid)" soft="var(--color-grid-soft)"
          value={fmt(sum("buy"))} unit="ซื้อ" sub={`ขาย ${fmt(sum("sell"))} หน่วย`}
          caption={<>ซื้อรวม <b>{fmt(sum("buy"))}</b> · ขายรวม <b>{fmt(sum("sell"))}</b> หน่วย</>}
          legend={[["ซื้อ", "var(--color-grid)"], ["ขาย", "var(--color-warn)"]]}>
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
    if (range === "day") return <div className="mt-3"><PowerProfile points={points} /></div>;
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
      <h2 className={h2First}>ย้อนหลัง</h2>
      <div className={`flex ${cardSm} p-1.5 gap-1.5 sticky top-2 z-10`}>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => changeRange(t.k)}
            className={`flex-1 min-h-12 rounded-xl text-[16px] font-bold transition-colors ${range === t.k ? "bg-primary text-ink" : "text-body"}`}>
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

          {points === null ? (
            <div className="skeleton h-[280px] rounded-[20px] mt-3" />
          ) : points.length === 0 ? (
            <div className={`${plate} p-4 mt-3`}><p className="text-center text-muted py-12">ไม่มีข้อมูลช่วงนี้</p></div>
          ) : (
            <>
              {/* what this period means for you — money + carbon up top */}
              {saved != null && periodTotals && (periodTotals.use || 0) > 0 && (
                <div className={`${cardP} mt-3 flex items-center gap-4`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] text-body">ช่วงนี้ประหยัดค่าไฟ</span>
                      <InfoTip text={`เงินที่ประหยัด = ไฟที่ใช้เองจากโซล่า/แบต (ไม่ได้ซื้อจากการไฟฟ้า) × ค่าไฟ ${settings.rate} บาท/หน่วย${settings.sellRate > 0 ? ` + รายได้ขายคืน ${settings.sellRate} บาท/หน่วย` : ""} · ปรับค่าได้ในแท็บ 'ตลอด'`} />
                    </div>
                    <div className="text-[26px] font-extrabold tabnum leading-none mt-0.5 text-secondary">{baht(saved)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[12.5px] text-body">ลดคาร์บอน</div>
                    <div className="text-[18px] font-extrabold tabnum leading-none mt-0.5" style={{ color: "#18a673" }}>{Math.round(co2 || 0)}<span className="text-[12px] text-body font-semibold ml-1">กก.</span></div>
                  </div>
                </div>
              )}
              {overview()}
              {/* per-metric breakdown — folded by default, tap to expand */}
              <Collapsible variant="bare" title="ดูแยกแต่ละค่า" subtitle="ผลิต · ใช้ไฟ · กริด · แบต">
                {sections()}
              </Collapsible>
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
