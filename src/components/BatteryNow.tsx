import { useEffect, useRef, useState } from "react";
import { getBatteryHealth, type BatteryHealth, type Latest, type Weather } from "../lib/api";
import { batteryCard } from "../lib/battery";
import { bkkClock, fmtPower } from "../lib/format";
import { hm, siteMinutes } from "../lib/weather";
import { cardP } from "../lib/ui";

/* "Battery right now" — what it is doing, WHY (sun vs. house, in words), and when it will
   run down to its cut-off or be full at the current rate. Capacity and cut-off are the
   site's own measured values (battery-health endpoint), never nameplate guesses. */

const AVG_S = 15 * 60; // smooth the rate over the last 15 min of polls — a kettle shouldn't swing the ETA by hours

const dur = (h: number) => {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม.${m % 60 ? ` ${m % 60} นาที` : ""}`;
};

export function BatteryNow({ latest, weather }: { latest: Latest; weather: Weather | null }) {
  const [h, setH] = useState<BatteryHealth | null>(null);
  useEffect(() => { let live = true; getBatteryHealth(60).then((x) => { if (live) setH(x); }).catch(() => {}); return () => { live = false; }; }, []);

  // rolling average of battery power across polls
  const buf = useRef<{ t: number; w: number }[]>([]);
  const t = latest.updatedAt || Date.now() / 1000;
  const bp = Number(latest.battPower) || 0;
  const last = buf.current[buf.current.length - 1];
  if (!last || last.t !== t) {
    buf.current = [...buf.current.filter((x) => x.t > t - AVG_S && x.t < t), { t, w: bp }];
    // a sign flip (charge ↔ discharge) starts a fresh average
    if (buf.current.some((x) => Math.sign(x.w) !== Math.sign(bp) && Math.abs(x.w) > 50)) buf.current = [{ t, w: bp }];
  }
  const avgW = buf.current.reduce((a, x) => a + x.w, 0) / buf.current.length;

  const now = Date.now() / 1000;
  const card = batteryCard({ soc: latest.soc, socKnown: latest.socKnown, watts: avgW, capKwh: h?.capKwh, floorSoc: h?.floorSoc, now });
  if (!card.show) return null;
  const { soc, floor, capKwh: cap, eta } = card;

  const discharging = avgW > 50, charging = avgW < -50;
  const pv = latest.genPower || 0, use = latest.usePower || 0;

  // next sunrise on the site clock (only to say "lasts until morning")
  const rise = hm(weather?.sun?.rise);
  const toRiseH = rise != null ? (((rise - siteMinutes(new Date()) + 1440) % 1440) / 60) : null;
  const night = pv < 50;
  const lastsTillMorning = eta?.kind === "empty" && night && toRiseH != null && toRiseH < 14 && eta.hours >= toRiseH;

  let why: string;
  if (discharging) why = night ? "กลางคืน บ้านใช้ไฟจากแบต" : `แดด ${fmtPower(pv)} ไม่พอบ้านใช้ ${fmtPower(use)}`;
  else if (charging) why = `แดด ${fmtPower(pv)} เกินที่บ้านใช้ ${fmtPower(use)}`;
  else if (floor != null && soc != null && soc <= floor + 1) why = `ถึงจุดตัด ${floor}% ใช้ไฟหลวงรอแดด`;
  else if (soc != null && soc >= 99) why = "แบตเต็ม";
  else why = "ไม่ได้ชาร์จหรือจ่าย";

  const state = discharging ? "กำลังจ่าย" : charging ? "กำลังชาร์จ" : soc != null && soc >= 99 ? "เต็ม" : "พัก";
  const col = discharging ? "#d97706" : charging ? "#18a673" : "#64748b";

  const low = soc != null && floor != null && soc <= floor + 5;
  const headline = eta?.kind === "empty" ? (lastsTillMorning ? "ใช้ได้ถึงเช้า" : `ใช้ได้ถึง ${bkkClock(eta.at)} น.`)
    : eta?.kind === "full" ? `เต็มราว ${bkkClock(eta.at)} น.` : null;
  const sub = eta?.kind === "empty" ? `อีก ${dur(eta.hours)} · เหลือ ${eta.kwhLeft.toFixed(1)} หน่วย` : eta?.kind === "full" ? `อีก ${dur(eta.hours)}` : null;

  return (
    <div className={cardP}>
      <div className="flex items-end justify-between gap-3">
        {soc != null
          ? <div className="text-[44px] font-extrabold tabnum leading-none tracking-tight">{soc}<span className="text-[22px] font-bold text-muted">%</span></div>
          : <div className="text-[18px] font-bold text-muted leading-tight">ยังไม่ทราบ % แบต</div>}
        <div className="text-right">
          <div className="text-[15px] font-bold" style={{ color: col }}>{state}</div>
          {(discharging || charging) && <div className="text-[15px] font-semibold tabnum text-body">{fmtPower(Math.abs(avgW))}</div>}
        </div>
      </div>
      {soc != null && <div className="relative h-3 rounded-full bg-black/[.06] mt-3 overflow-hidden" role="img" aria-label={`แบตเหลือ ${soc}%`}>
        <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${soc}%`, background: low ? "#ef4444" : "#18a673" }} />
        {floor != null && <div className="absolute inset-y-0 w-[2px] bg-white" style={{ left: `${floor}%` }} />}
      </div>}
      {headline && <div className="text-[20px] font-bold mt-4 tabnum">{headline}</div>}
      {sub && <div className="text-[14px] text-body tabnum">{sub}</div>}
      <div className={`text-[14px] text-body ${headline ? "mt-1" : "mt-4"}`}>{why}</div>
      <div className="text-[12.5px] text-muted mt-3 tabnum">ข้อมูล {bkkClock(t)} น.{floor != null ? ` · หยุดจ่ายที่ ${floor}%` : ""}{cap ? ` · จุ ${Math.round(cap)} หน่วย` : ""}</div>
    </div>
  );
}
