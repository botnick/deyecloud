import { useEffect, useState } from "react";
import { getForecastAccuracy, type ForecastAccuracy } from "../lib/api";
import { cardP } from "../lib/ui";
import { InfoTip } from "./InfoTip";

// "How good has the day-ahead forecast been?" — the evening 'พรุ่งนี้คาดผลิต' figure
// vs. the certified production of that day, for the last N completed days.
const shortDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });

export function ForecastAccuracyCard({ skyDays }: { skyDays: number }) {
  const [a, setA] = useState<ForecastAccuracy | null>(null);
  useEffect(() => { let live = true; getForecastAccuracy(30).then((x) => { if (live) setA(x); }).catch(() => {}); return () => { live = false; }; }, []);
  if (!a || !a.n) return null; // nothing evaluated yet — no card rather than an empty one
  const recent = a.rows.filter((r) => r.actual != null).slice(-7).reverse();
  const tone = a.score == null ? "text-body" : a.score >= 85 ? "text-ok" : a.score >= 70 ? "text-pv-high" : "text-warn";
  return (
    <div className={`${cardP} mt-3`}>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-[16px] text-title">ความแม่นยำพยากรณ์</span>
        <InfoTip text={`เทียบ "พรุ่งนี้คาดผลิต" ที่ระบบบอกไว้ตอนเย็น กับที่ผลิตได้จริงในวันนั้น ${a.n} วันล่าสุด · คะแนน = 100% − ค่าคลาดเฉลี่ย · ระบบใช้ผลนี้ปรับค่าเมฆของบ้านนี้เอง (${skyDays} วันที่เรียนรู้แล้ว)`} />
      </div>
      <div className="flex items-end gap-4 mt-2">
        <div><div className={`text-[34px] font-extrabold tabnum leading-none ${tone}`}>{a.score ?? "—"}<span className="text-[15px] font-bold text-body ml-0.5">%</span></div><div className="text-[12px] text-muted mt-1">แม่นยำ ({a.n} วัน)</div></div>
        <div className="text-[13px] text-body leading-snug">
          คลาดเฉลี่ย <b className="tabnum">±{(a.mae ?? 0).toFixed(1)}</b> หน่วย/วัน<br />
          {a.bias != null && Math.abs(a.bias) >= 0.5 && <>แนวโน้ม{a.bias > 0 ? "คาดสูงไป" : "คาดต่ำไป"} <b className="tabnum">{Math.abs(a.bias).toFixed(1)}</b> หน่วย</>}
        </div>
      </div>
      {recent.length > 0 && (
        <div className="mt-3 grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 text-[12.5px] tabnum">
          <div className="text-muted">วัน</div><div className="text-muted">คาด → จริง</div><div className="text-muted text-right">คลาด</div>
          {recent.map((r) => { const e = r.predicted - (r.actual || 0); return (
            <div key={r.day} className="contents">
              <div className="text-body">{shortDay(r.day)}</div>
              <div>{r.predicted.toFixed(1)} → <b>{(r.actual || 0).toFixed(1)}</b></div>
              <div className={`text-right ${Math.abs(e) <= 3 ? "text-ok" : "text-warn"}`}>{e > 0 ? "+" : ""}{e.toFixed(1)}</div>
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}
