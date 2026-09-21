import { useEffect, useState } from "react";
import { getTotals } from "../lib/api";
import { monthStats, bestWorst, seasonSummary, yearOverYear, projectYear, SEASON_TH } from "../lib/season";
import { bkkToday } from "../lib/format";
import { cardP } from "../lib/ui";
import { InfoTip } from "./InfoTip";

const TH_M = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const f0 = (n: number) => Math.round(n).toLocaleString("th-TH");
const f1 = (n: number) => n.toFixed(1);

// Year view: monthly kWh/day, best/worst, Thai-season summary, month-by-month vs
// last year, and a full-year projection. All from monthly roll-ups already loaded
// by HistoryView + the station's PSH-by-month (one cached /api/totals call).
export function YearInsights({ year, points, prevPoints, todayGen, primary }: { year: number; points: any[]; prevPoints: any[] | null; todayGen: number | null; primary: boolean }) {
  const [psh, setPsh] = useState<number[] | null>(null);
  useEffect(() => { if (!primary) return; let live = true; getTotals().then((t) => { if (live) setPsh(t.pshByMonth || null); }).catch(() => {}); return () => { live = false; }; }, [primary]);
  const today = bkkToday();
  const cur = monthStats(points as any, year, today, todayGen);
  const prev = prevPoints && prevPoints.length ? monthStats(prevPoints as any, year - 1, today) : null;
  const partialMonths = cur.filter((s) => !s.complete && !s.running && s.coverage > 0);
  const bw = bestWorst(cur);
  const seasons = seasonSummary(cur).filter((s) => s.perDay != null);
  const yoy = prev ? yearOverYear(cur, prev) : null;
  const proj = Number(today.slice(0, 4)) === year ? projectYear(cur, prev, psh, year, today) : null;
  const maxPerDay = Math.max(1, ...cur.map((s) => s.perDay || 0), ...(prev ? prev.map((s) => s.perDay || 0) : []));
  if (!cur.some((s) => s.perDay != null)) return null;
  return (
    <div className={`${cardP} mt-3`}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="font-bold text-[16px] text-title">ภาพรวมทั้งปี</span>
        <InfoTip text="ผลิตเฉลี่ยต่อวันของแต่ละเดือน คิดเฉพาะวันที่มีข้อมูล (เดือนที่กำลังเดินไม่นับวันนี้) · แถบจาง = ปีก่อน · แถบลาย = เดือนที่ข้อมูลไม่ครบ · คาดทั้งปี = ที่บันทึกได้แล้ว + วันหลังจากวันนี้ประเมินจากเดือนเดียวกันของปีก่อน (ถ้าครบ) หรืออัตราของเดือนที่ครบในปีนี้ปรับตามแดดของแต่ละเดือน (จากพิกัดบ้าน) — เป็นค่าประมาณ ไม่ใช่ตัวเลขรับรอง" />
      </div>
      {/* monthly kWh/day bars (this year solid, last year faint) */}
      <div className="grid grid-cols-12 gap-1 items-end h-24">
        {cur.map((s, i) => (
          <div key={s.m} className="relative h-full flex items-end justify-center gap-[2px]">
            {prev && prev[i].perDay != null && <div className="w-[38%] rounded-t-sm bg-pv/25" style={{ height: `${(prev[i].perDay! / maxPerDay) * 100}%` }} />}
            {s.perDay != null && <div className={`w-[38%] rounded-t-sm ${s.complete ? "bg-pv" : "bg-pv/60"}`} style={{ height: `${(s.perDay / maxPerDay) * 100}%` }} title={`${f1(s.perDay)} หน่วย/วัน (${s.coverage}/${s.calendarDays} วัน)`} />}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-12 gap-1 mt-1 text-[9.5px] text-muted text-center">{TH_M.map((m) => <div key={m}>{m}</div>)}</div>
      <div className="text-[12.5px] text-body mt-3 space-y-1 leading-snug">
        {partialMonths.length > 0 && <div className="text-muted">ข้อมูลไม่ครบ: {partialMonths.map((s) => `${TH_M[s.m - 1]} ${s.coverage}/${s.calendarDays} วัน`).join(" · ")}</div>}
        {bw && <div>☀️ ดีสุด <b>{TH_M[bw.best.m - 1]}</b> {f1(bw.best.perDay!)} หน่วย/วัน · แย่สุด <b>{TH_M[bw.worst.m - 1]}</b> {f1(bw.worst.perDay!)} หน่วย/วัน</div>}
        {seasons.length > 0 && <div>{seasons.map((s) => `${SEASON_TH[s.season].split(" ")[0]} ${f1(s.perDay!)}`).join(" · ")} หน่วย/วัน</div>}
        {yoy && yoy.pct != null && <div>เทียบปีก่อน ({yoy.months} เดือนเดียวกัน): <b className={yoy.pct >= 0 ? "text-ok" : "text-warn"}>{yoy.pct > 0 ? "+" : ""}{yoy.pct}%</b></div>}
        {proj && (
          <div className="pt-1.5 mt-1.5 border-t border-line">
            คาดทั้งปี <b className="tabnum text-[15px] text-pv-high">~{f0(proj.total)}</b> หน่วย
            <span className="text-muted"> (บันทึกแล้ว {f0(proj.actual)} · หลังวันนี้ประมาณ {f0(proj.estimated)}{proj.basis.fromLastYear ? ` · อิงปีก่อน ${proj.basis.fromLastYear} เดือน` : ""}{proj.basis.fromGeometry ? ` · อิงแดดตามฤดู ${proj.basis.fromGeometry} เดือน` : ""}{proj.basis.incompleteMonths ? ` · ${proj.basis.incompleteMonths} เดือนข้อมูลไม่ครบ` : ""})</span>
          </div>
        )}
      </div>
    </div>
  );
}
