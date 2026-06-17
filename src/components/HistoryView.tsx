import { useEffect, useState } from "react";
import { getHistory } from "../lib/api";
import { cardSm, plate, h2First, h2Mid } from "../lib/ui";
import { IconChevron } from "../lib/icons";
import { BarChart, Legend } from "./Chart";
import { PowerProfile } from "./PowerProfile";
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

export function HistoryView({ active, stationId }: { active: boolean; stationId?: number | null }) {
  const [range, setRange] = useState<Range>("day");
  const [ref, setRef] = useState(() => new Date());
  const [points, setPoints] = useState<any[] | null>(null);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setPoints(null);
    getHistory(range, isoLocal(ref), stationId).then((r) => { if (alive) setPoints(r.points || []); }).catch(() => { if (alive) setPoints([]); });
    return () => { alive = false; };
  }, [range, ref, active, stationId]);

  // Clear points on tab change so we never render the previous range's data
  // shape against the new range (e.g. day frames have no .day/.month → crash).
  const changeRange = (r: Range) => { setRange(r); setRef(new Date()); setPoints(null); };
  const shift = (dir: number) => setRef((d) => {
    const n = new Date(d);
    if (range === "day") n.setDate(n.getDate() + dir);
    else if (range === "month") n.setMonth(n.getMonth() + dir);
    else n.setFullYear(n.getFullYear() + dir);
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

  const energy = range !== "day";
  const tot = energy && points ? points.reduce((a, p) => ({ gen: a.gen + (p.gen || 0), use: a.use + (p.use || 0) }), { gen: 0, use: 0 }) : null;

  return (
    <>
      <h2 className={h2First}>ย้อนหลัง</h2>
      <div className={`flex ${cardSm} p-1.5 gap-1.5`}>
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

      {tot && (
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          <div className={`${cardSm} px-4 py-3`}>
            <div className="text-[12px] text-body">ผลิตรวม</div>
            <div className="text-[18px] font-extrabold tabnum text-pv-high mt-0.5">{tot.gen.toFixed(1)} <span className="text-[13px] text-body font-semibold">หน่วย</span></div>
          </div>
          <div className={`${cardSm} px-4 py-3`}>
            <div className="text-[12px] text-body">ใช้รวม</div>
            <div className="text-[18px] font-extrabold tabnum text-use mt-0.5">{tot.use.toFixed(1)} <span className="text-[13px] text-body font-semibold">หน่วย</span></div>
          </div>
        </div>
      )}

      {points === null ? (
        <div className="skeleton h-[280px] rounded-[20px] mt-3" />
      ) : points.length === 0 ? (
        <div className={`${plate} p-4 mt-3`}><p className="text-center text-muted py-12">ไม่มีข้อมูลช่วงนี้</p></div>
      ) : range === "day" ? (
        <div className="mt-3"><PowerProfile points={points} /></div>
      ) : (
        <div className={`${plate} p-4 mt-3`}>
          <BarChart labels={points.map((p) => (range === "month" ? String(p.day || "").slice(8) : String(p.month || "").slice(5)))} series={[
            { color: "var(--color-pv)", data: points.map((p) => p.gen || 0) },
            { color: "var(--color-use)", data: points.map((p) => p.use || 0) },
          ]} />
          <Legend items={[["ผลิต (หน่วย)", "var(--color-pv)"], ["ใช้ (หน่วย)", "var(--color-use)"]]} />
        </div>
      )}

      {points && points.length > 0 && analyzeHistory(range, points).length > 0 && (
        <>
          <h2 className={h2Mid}>วิเคราะห์</h2>
          <InsightList items={analyzeHistory(range, points)} />
        </>
      )}
    </>
  );
}
