import { useEffect, useState } from "react";
import { getHistory, type Latest, type Weather } from "../lib/api";
import { bkkToday, fmtKwh, timeStr } from "../lib/format";
import { IconAlert } from "../lib/icons";
import { card, cardP, h2Mid } from "../lib/ui";
import { useSettings } from "../lib/settings";
import { savingsOf, savingsLabel, baht } from "../lib/economics";
import { forecast, clearSkyPsh, forecastDayKwh } from "../lib/forecast";
import { useForecastModel } from "../lib/useCapacity";
import { InfoTip } from "./InfoTip";
import { HouseScene } from "./HouseScene";
import { ProductionRing } from "./ProductionRing";
import { BatteryNow } from "./BatteryNow";

function Skeleton() {
  return (
    <>
      <div className="skeleton rounded-[22px]" style={{ aspectRatio: "392 / 380" }} />
      <div className="skeleton h-[320px] rounded-[20px] mt-7" />
    </>
  );
}

export function HomeView({ latest, weather, capacity, isPrimary = true, stationName, onDevice }: { latest: Latest | null; weather: Weather | null; capacity?: number; isPrimary?: boolean; stationName?: string; onDevice: () => void }) {
  const { settings } = useSettings();
  const model = useForecastModel(capacity, isPrimary); // calibrated kWp + site-learned sky factors
  const effCap = model.capKw;
  // this month's daily rows (primary station only — `daily` is the cron's station);
  // re-read when the Bangkok day rolls over so a new month starts clean
  const today = bkkToday();
  const [monthPts, setMonthPts] = useState<any[] | null>(null);
  useEffect(() => {
    if (!isPrimary) { setMonthPts(null); return; }
    let live = true;
    getHistory("month", today).then((r) => { if (live) setMonthPts(r.points || []); }).catch(() => {});
    return () => { live = false; };
  }, [isPrimary, today]);
  if (!latest) return <Skeleton />;
  const ok = (latest.warningStatus || "NORMAL") === "NORMAL";
  // Today's ACHIEVABLE clear-day production — same formula the forecast uses for a
  // clear sky (kWp × PSH × clear factor), so a calibration-clear day reads ~100%,
  // not the lossless-theoretical 80%.
  const potential = forecastDayKwh({ cond: 1 } as any, clearSkyPsh(weather), effCap, model.sky);
  const prodPct = potential > 0 ? Math.round(Math.min(100, (latest.genToday / potential) * 100)) : Math.min(100, Math.round(latest.genToday));
  // shared economics formula (self-consumption + export income, user's own rates)
  const sv = savingsLabel(savingsOf({ use: latest.useToday, buy: latest.buyToday, sell: latest.sellToday }, settings), "ประหยัดวันนี้");
  // month so far = stored days before today + today's live counters (so it moves
  // with the "today" figure above instead of lagging the cron's daily row)
  const month = (() => {
    if (!monthPts) return null;
    const past = monthPts.filter((p) => String(p.day) < today && String(p.day).slice(0, 7) === today.slice(0, 7));
    const add = (k: string) => past.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const saved = savingsOf({ use: add("use") + latest.useToday, buy: add("buy") + latest.buyToday, sell: add("sell") + (latest.sellToday || 0) }, settings);
    const days = past.length + 1;
    const [y, m, d] = today.split("-").map(Number);
    const len = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // projection from whole days only (today is partial); needs a few to mean anything
    const pastSaved = savingsOf({ use: add("use"), buy: add("buy"), sell: add("sell") }, settings);
    const proj = past.length >= 3 && d < len && pastSaved > 0 ? (pastSaved / past.length) * len : null;
    return { saved, days, dayOfMonth: d, proj };
  })();
  // tomorrow's expected production (shown only when capacity is known here)
  const tomorrow = effCap ? forecast(weather, effCap, model.sky)[1] : undefined;

  return (
    <>
      {/* live house hero — the whole system (energy flow + weather + day/night) at a glance */}
      <HouseScene latest={latest} weather={weather} title={stationName} />
      <div className="mt-2.5 mb-2 text-center text-[12.5px] text-muted">อัปเดตล่าสุด {timeStr(latest.updatedAt)}</div>

      {/* alert surfaces only when something is wrong — keeps the happy path clean */}
      {!ok && (
        <button onClick={onDevice} className={`${cardP} w-full text-left mb-7 flex items-center gap-3 border border-warn/25 active:scale-[.99] transition-transform`}>
          <span className="grid place-items-center w-11 h-11 rounded-full shrink-0 text-white bg-warn"><IconAlert className="w-6 h-6" /></span>
          <div className="min-w-0">
            <div className="text-[17px] font-bold leading-tight">พบจุดที่ควรดู {latest.warningReasons?.length ? `(${latest.warningReasons.length})` : ""}</div>
            <div className="text-[14px] text-body mt-0.5 line-clamp-2">
              {latest.warningReasons?.length ? latest.warningReasons.slice(0, 2).join(" · ") : "ระบบมีสถานะผิดปกติ"} · แตะดูรายละเอียด
            </div>
          </div>
        </button>
      )}

      {/* the battery in words: what it's doing, why, and until when */}
      {isPrimary && <><h2 className={h2Mid}>แบตเตอรี่ตอนนี้</h2><BatteryNow latest={latest} weather={weather} /></>}

      {/* today at a glance — one card, big numbers, every colour also has a word */}
      <h2 className={h2Mid}>วันนี้</h2>
      <div className={cardP}>
        <div className="flex items-center gap-4">
          <div className="w-[118px] shrink-0">
            <ProductionRing pct={prodPct} center={`${prodPct}%`} unit="ของแดดวันนี้" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-muted">ผลิตไฟได้วันนี้</div>
            <div className="text-[30px] font-extrabold tabnum leading-tight text-pv-high">{fmtKwh(latest.genToday)} <span className="text-[16px] font-bold text-body">หน่วย</span></div>
            <div className="text-[13.5px] text-body mt-0.5 leading-snug">
              {tomorrow && tomorrow.kwh > 0 && <>พรุ่งนี้คาด <b className="text-pv-high">~{tomorrow.kwh.toFixed(0)} หน่วย</b></>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-4">
          {[
            { lb: "ใช้ไฟ", v: fmtKwh(latest.useToday), u: "หน่วย", c: "#0d6bff" },
            { lb: "ซื้อไฟ", v: fmtKwh(latest.buyToday), u: "หน่วย", c: "#8b5cf6" },
            { lb: "แบตจ่าย", v: fmtKwh(latest.dischargeToday ?? 0), u: "หน่วย", c: "#18a673" },
          ].map((x) => (
            <div key={x.lb} className="bg-canvas rounded-2xl px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-body"><span className="w-2.5 h-2.5 rounded-full" style={{ background: x.c }} />{x.lb}</div>
              <div className="text-[21px] font-extrabold tabnum mt-0.5">{x.v} <span className="text-[13px] font-bold text-muted">{x.u}</span></div>
            </div>
          ))}
          <div className="bg-canvas rounded-2xl px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-body">
              {sv.label}
              <InfoTip text={`(ไฟที่ใช้วันนี้ − ไฟที่ซื้อวันนี้) × ค่าไฟ ${settings.rate} บาท/หน่วย${settings.sellRate > 0 ? ` + ขายไฟ × ${settings.sellRate} บาท/หน่วย` : ""} · ซื้อมากกว่าใช้ (เช่น ชาร์จแบตจากการไฟฟ้ากลางคืน) = ค่าไฟเพิ่มสุทธิ · ปรับค่าได้ในแท็บ 'ตลอด'`} />
            </div>
            <div className={`text-[21px] font-extrabold tabnum mt-0.5 ${sv.negative ? "text-warn" : "text-secondary"}`}>{sv.text}</div>
          </div>
        </div>
        {month && (() => {
          const ml = savingsLabel(month.saved, "เดือนนี้ประหยัดแล้ว");
          return (
            <div className="flex items-end justify-between gap-3 mt-3.5 pt-3 border-t border-black/[.06]">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-body">
                  {ml.negative ? "เดือนนี้ค่าไฟเพิ่มสุทธิ" : ml.label}
                  <InfoTip text={`รวมตั้งแต่วันที่ 1 ถึงตอนนี้ สูตรเดียวกับของวันนี้${month.days < month.dayOfMonth ? ` · มีข้อมูล ${month.days} จาก ${month.dayOfMonth} วัน` : ""}${month.proj != null ? " · ตัวเลขคาดทั้งเดือนคิดจากค่าเฉลี่ยวันที่ผ่านมา" : ""}`} />
                </div>
                <div className={`text-[24px] font-extrabold tabnum leading-tight ${ml.negative ? "text-warn" : "text-secondary"}`}>{ml.text}</div>
              </div>
              {month.proj != null && (
                <div className="text-right shrink-0">
                  <div className="text-[12.5px] text-muted">คาดทั้งเดือน</div>
                  <div className="text-[16px] font-bold tabnum text-body">~{baht(month.proj)}</div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* system — iOS grouped list */}
      <h2 className={h2Mid}>ระบบ</h2>
      <div className={`${card} overflow-hidden`}>
        <button onClick={onDevice} className="ios-row">
          <span className="ic" style={{ background: "#0d6bff" }}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M6 14c1.5-3 3-3 4.5 0s3 3 4.5 0" /></svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[16.5px] font-bold text-title">รายละเอียดเครื่อง</span>
            <span className="block text-[13px] text-body truncate">อินเวอร์เตอร์ แบตเตอรี่ แจ้งเตือน{capacity ? ` · ระบบ ${capacity} kW` : ""}</span>
          </span>
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    </>
  );
}
