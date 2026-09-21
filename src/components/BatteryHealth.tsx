import { useEffect, useState } from "react";
import { getBatteryHealth, type BatteryHealth } from "../lib/api";
import { LineMini } from "./Chart";
import { cardP } from "../lib/ui";
import { InfoTip } from "./InfoTip";

const shortDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });

// Measured battery health — see lib/battery.ts. Shown only when the site has a
// battery and enough discharge history to measure it; never an assumed number.
export function BatteryHealthCard() {
  const [h, setH] = useState<BatteryHealth | null | undefined>(undefined);
  useEffect(() => { let live = true; getBatteryHealth(60).then((x) => { if (live) setH(x); }).catch(() => { if (live) setH(null); }); return () => { live = false; }; }, []);
  if (!h || h.capKwh == null) return null;
  const sohTone = h.soh == null ? "text-title" : h.soh >= 90 ? "text-ok" : h.soh >= 80 ? "text-pv-high" : "text-warn";
  const drift = h.firstCapKwh && h.capKwh ? ((h.capKwh - h.firstCapKwh) / h.firstCapKwh) * 100 : null;
  const xs = h.trend.map((t) => t.capKwh);
  const xl = h.trend.length ? [shortDay(h.trend[0].day), shortDay(h.trend[Math.floor(h.trend.length / 2)].day), shortDay(h.trend[h.trend.length - 1].day)] : [];
  return (
    <div className={`${cardP} mt-3`}>
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-[16px] text-title">สุขภาพแบตเตอรี่</span>
        <InfoTip text={`วัดจากช่วงคายประจุต่อเนื่อง: พลังงานที่จ่ายออก ÷ %SOC ที่ลดลง = ความจุใช้งานจริง (kWh ต่อ 100%) ค่ากลางของ 10 วันล่าสุด · SOH = เทียบกับพิกัด BMS ${h.ratedAh ?? "?"} Ah × แรงดันปกติที่วัดได้ ${h.nominalV ?? "?"} V · รอบ = พลังงานคายสะสม ÷ ความจุ · ข้อมูล ${h.days} วันล่าสุด`} />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div><div className={`text-[28px] font-extrabold tabnum leading-none ${sohTone}`}>{h.soh != null ? `${h.soh}%` : "—"}</div><div className="text-[11.5px] text-muted mt-1">SOH{h.ratedKwh ? ` (พิกัด ${h.ratedKwh} kWh)` : ""}</div></div>
        <div><div className="text-[28px] font-extrabold tabnum leading-none text-title">{h.capKwh.toFixed(1)}</div><div className="text-[11.5px] text-muted mt-1">kWh ใช้ได้จริง</div></div>
        <div><div className="text-[28px] font-extrabold tabnum leading-none text-title">{h.cycles ?? "—"}</div><div className="text-[11.5px] text-muted mt-1">รอบเต็ม / {h.days} วัน</div></div>
      </div>
      <div className="text-[13px] text-body mt-3 leading-snug">
        ใช้ลึกเฉลี่ยวันละ <b className="tabnum">{h.dod.avg ?? "—"}%</b> · ต่ำสุด <b className="tabnum">{h.dod.minSoc != null ? Math.round(h.dod.minSoc) : "—"}%</b>
        {h.dod.lowDays > 0 && <> · ลงต่ำกว่า 20% <b className="tabnum">{h.dod.lowDays}</b> วัน</>}
        {drift != null && Math.abs(drift) >= 2 && <><br />ความจุ{drift < 0 ? "ลดลง" : "เพิ่มขึ้น"} <b className="tabnum">{Math.abs(drift).toFixed(1)}%</b> เทียบช่วงแรกของหน้าต่างนี้</>}
      </div>
      {xs.length >= 3 && (
        <div className="mt-3">
          <div className="text-[12.5px] text-muted mb-1">ความจุที่วัดได้รายวัน (kWh)</div>
          <LineMini values={xs} color="#7b5cf0" unit="kWh" area={false} xLabels={xl} />
        </div>
      )}
    </div>
  );
}
