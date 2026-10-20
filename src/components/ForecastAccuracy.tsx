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
  const meter = a.score == null ? "var(--color-line)" : a.score >= 85 ? "var(--color-ok)" : a.score >= 70 ? "var(--color-pv)" : "var(--color-warn)";
  const top = Math.max(1, ...recent.map((r) => Math.max(r.predicted, r.actual || 0)));
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  return (
    <div className={`${cardP} mt-3`}>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-[16px] text-title">ความแม่นยำของการพยากรณ์</span>
        <InfoTip text={`เทียบ "พรุ่งนี้คาดผลิต" ที่ระบบประเมินไว้ตอนเย็น กับที่ผลิตได้จริงในวันนั้น ${a.n} วันล่าสุด · คะแนนคือ 100% ลบด้วย (หน่วยที่คลาดเคลื่อนรวม หารด้วยหน่วยที่ผลิตจริงรวม) · ไม่นับวันที่ข้อมูลกลางวันขาดหาย (เช่นตัวส่งข้อมูลหลุด) · ระบบใช้ผลนี้ปรับค่าเมฆของบ้านนี้เอง (${skyDays} วันที่เรียนรู้แล้ว)`} />
      </div>
      <div className="flex items-end justify-between gap-4 mt-2.5">
        <div className={`text-[40px] font-extrabold tabnum leading-none ${tone}`}>{a.score ?? "—"}<span className="text-[17px] font-bold text-body ml-0.5">%</span></div>
        <div className="text-right text-[13px] text-body leading-snug pb-0.5">
          <div>คลาดเฉลี่ย <b className="tabnum text-title">±{(a.mae ?? 0).toFixed(1)}</b> หน่วย/วัน</div>
          {a.bias != null && Math.abs(a.bias) >= 0.5 && <div>ส่วนใหญ่{a.bias > 0 ? "คาดสูงไป" : "คาดต่ำไป"} <b className="tabnum text-title">{Math.abs(a.bias).toFixed(1)}</b> หน่วย</div>}
        </div>
      </div>
      <div className="h-2 rounded-full bg-line mt-3 overflow-hidden" role="img" aria-label={`แม่นยำ ${a.score ?? 0}%`}>
        <div className="h-full rounded-full" style={{ width: `${a.score ?? 0}%`, background: meter }} />
      </div>
      <div className="text-[12px] text-muted mt-1.5">วัดจาก {a.n} วันล่าสุด</div>

      {recent.length > 0 && (
        <>
          <div className="flex items-center gap-4 mt-4 mb-1 text-[12px] text-body">
            <span className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ background: "var(--color-pv)" }} />ผลิตจริง</span>
            <span className="flex items-center gap-1.5"><span className="w-[3px] h-3.5 rounded-full bg-title" />ที่คาดไว้</span>
          </div>
          <div className="divide-y divide-black/[.05]">
            {recent.map((r) => {
              const act = r.actual || 0, e = r.predicted - act, ok = Math.abs(e) <= 3;
              return (
                <div key={r.day} className="grid grid-cols-[52px_1fr_78px] items-center gap-3 py-2.5">
                  <div className="text-[13px] text-body tabnum">{shortDay(r.day)}</div>
                  <div className="min-w-0">
                    <div className="relative h-3 rounded-full bg-canvas">
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: pct(act), background: "var(--color-pv)" }} />
                      <div className="absolute -top-1 -bottom-1 w-[3px] -ml-[1.5px] rounded-full bg-title" style={{ left: pct(r.predicted) }} />
                    </div>
                    <div className="text-[12px] text-muted tabnum mt-1">จริง <b className="text-title">{act.toFixed(1)}</b> · คาด {r.predicted.toFixed(1)}</div>
                  </div>
                  <span className={`justify-self-end text-[12px] font-bold tabnum px-2 py-1 rounded-full whitespace-nowrap ${ok ? "text-ok bg-ok/10" : "text-warn bg-warn/10"}`}>
                    {ok ? "แม่นยำ" : e > 0 ? `สูงไป ${e.toFixed(0)}` : `ต่ำไป ${(-e).toFixed(0)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
