import { useEffect, useMemo, useState } from "react";
import { getDeviceHistory, type Device, type DeviceHistory } from "../lib/api";
import { LineMini } from "./Chart";
import { Collapsible } from "./Collapsible";
import { cardP } from "../lib/ui";

// Long-term health trends from the telemetry the cron stores every ~15 min
// (device_samples). Which charts appear depends on which measure points THIS
// inverter actually reports — nothing is assumed about the model.
const RANGES = [1, 7, 30, 90] as const;
const first = (dev: Device, ...keys: string[]) => keys.find((k) => dev.dataList.some((d) => d.key === k));

function fmtT(t: number, days: number) {
  const d = new Date(t * 1000);
  return days <= 1
    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short" });
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export function DeviceTrends({ dev }: { dev: Device }) {
  const [days, setDays] = useState<(typeof RANGES)[number]>(7);
  const [h, setH] = useState<DeviceHistory | null>(null);
  const [err, setErr] = useState(false);

  // Only ask for points this device has (see the header comment).
  const want = useMemo(() => {
    const soc = first(dev, "BMSSOC", "SOC");
    const battV = first(dev, "BatteryVoltage", "BMSVoltage");
    const tBatt = first(dev, "Temperature- Battery", "BatteryTemperature");
    const tInv = first(dev, "AC Temperature", "InverterTemperature", "Temperature- Inverter");
    const pv = ["DCPowerPV1", "DCPowerPV2", "DCPowerPV3", "DCPowerPV4"].filter((k) => dev.dataList.some((d) => d.key === k && Number(d.value) !== 0 || d.key === k));
    const grid = ["GridVoltageL1", "GridVoltageL2", "GridVoltageL3"].filter((k) => dev.dataList.some((d) => d.key === k));
    return { soc, battV, tBatt, tInv, pv, grid, keys: [soc, battV, tBatt, tInv, ...pv, ...grid].filter((k): k is string => !!k) };
  }, [dev.sn, dev.dataList.length]);

  useEffect(() => {
    if (!want.keys.length) return;
    let live = true;
    setErr(false);
    getDeviceHistory(days, want.keys).then((d) => { if (live) setH(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [days, want.keys.join(",")]);

  if (!want.keys.length) return null;
  const S = (k?: string) => (k && h ? h.series[k] : undefined);
  const vals = (k?: string, f: "avg" | "min" | "max" = "avg") => (S(k)?.points || []).map((p) => p[f]);
  const times = (k?: string) => (S(k)?.points || []).map((p) => p.t);
  const xl = (k?: string) => { const t = times(k); return t.length ? [fmtT(t[0], days), fmtT(t[Math.floor(t.length / 2)], days), fmtT(t[t.length - 1], days)] : []; };
  const enough = (k?: string) => (S(k)?.points.length || 0) >= 3;

  // Plain-language findings over the whole range — computed from the same series.
  const notes: string[] = [];
  if (h) {
    const socMin = vals(want.soc, "min"); const st = times(want.soc);
    if (socMin.length) { const i = socMin.indexOf(Math.min(...socMin)); notes.push(`แบตต่ำสุด ${Math.round(socMin[i])}% (${fmtT(st[i], days)}${days > 1 ? " " + new Date(st[i] * 1000).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : ""})`); }
    const tb = vals(want.tBatt, "max"); if (tb.length) notes.push(`แบตร้อนสุด ${r1(Math.max(...tb))}°C`);
    const ti = vals(want.tInv, "max"); if (ti.length) notes.push(`เครื่องร้อนสุด ${r1(Math.max(...ti))}°C`);
    if (want.pv.length >= 2) {
      const sums = want.pv.map((k) => vals(k).reduce((a, b) => a + b, 0));
      const tot = sums.reduce((a, b) => a + b, 0);
      if (tot > 0) {
        const share = sums.map((x) => Math.round((x / tot) * 100));
        const active = share.filter((x) => x > 0).length;
        notes.push(`สัดส่วนพลังงานต่อสตริง ${share.map((p, i) => `PV${i + 1} ${p}%`).join(" · ")}` + (active >= 2 && Math.max(...share) - Math.min(...share.filter((x) => x > 0)) >= 25 ? " — ต่างกันมาก ลองดูเงาบัง/สายต่อ" : ""));
      }
    }
    const gv = want.grid.map((k) => vals(k, "min")).flat(); if (gv.length) notes.push(`แรงดันกริดต่ำสุด ${Math.round(Math.min(...gv))} V`);
  }

  return (
    <Collapsible title="แนวโน้มสุขภาพระบบ" subtitle={`จากค่าที่บันทึกทุก 15 นาที · ย้อนหลัง ${days} วัน`} variant="bare">
      <div className="flex gap-1.5 mt-2 mb-2.5">
        {RANGES.map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`h-8 px-3 rounded-full text-[13px] font-semibold ${days === d ? "bg-ink text-white" : "bg-canvas text-body"}`}>{d === 1 ? "24 ชม." : `${d} วัน`}</button>
        ))}
      </div>
      {err && <div className={`${cardP} text-center text-muted`}>โหลดแนวโน้มไม่ได้</div>}
      {!err && !h && <div className="skeleton h-40 rounded-[20px]" />}
      {h && notes.length > 0 && (
        <div className={`${cardP} mb-2.5`}>
          <div className="text-[13px] text-muted mb-1">สรุปช่วงนี้</div>
          <ul className="text-[14px] text-body space-y-1">{notes.map((n, i) => <li key={i}>• {n}</li>)}</ul>
        </div>
      )}
      {h && enough(want.soc) && (
        <div className={`${cardP} mb-2.5`}><div className="font-bold text-[15px] mb-1.5">ระดับแบต (SOC)</div>
          <LineMini values={vals(want.soc)} color="#7b5cf0" unit="%" xLabels={xl(want.soc)} /></div>
      )}
      {h && (enough(want.tBatt) || enough(want.tInv)) && (
        <div className={`${cardP} mb-2.5`}><div className="font-bold text-[15px] mb-1.5">อุณหภูมิ <span className="text-[12px] font-normal text-muted">แบต (ทึบ) · เครื่อง (ประ)</span></div>
          <LineMini values={enough(want.tBatt) ? vals(want.tBatt) : vals(want.tInv)} color="#f97316" unit="°C" area={false} xLabels={xl(enough(want.tBatt) ? want.tBatt : want.tInv)}
            secondary={enough(want.tBatt) && enough(want.tInv) ? { values: vals(want.tInv), color: "#ef4444", max: Math.max(1, ...vals(want.tInv, "max")) } : undefined} /></div>
      )}
      {h && enough(want.battV) && (
        <div className={`${cardP} mb-2.5`}><div className="font-bold text-[15px] mb-1.5">แรงดันแบต</div>
          <LineMini values={vals(want.battV)} color="#0ea5a4" unit="V" area={false} xLabels={xl(want.battV)} /></div>
      )}
      {h && want.pv.length > 0 && enough(want.pv[0]) && (
        <div className={`${cardP} mb-2.5`}><div className="font-bold text-[15px] mb-1.5">กำลังผลิตต่อสตริง <span className="text-[12px] font-normal text-muted">PV1 (ทึบ){want.pv[1] ? " · PV2 (ประ)" : ""}</span></div>
          <LineMini values={vals(want.pv[0])} color="#f5a623" unit="W" xLabels={xl(want.pv[0])}
            secondary={want.pv[1] && enough(want.pv[1]) ? { values: vals(want.pv[1]), color: "#b45309", max: Math.max(1, ...vals(want.pv[0], "max"), ...vals(want.pv[1], "max")) } : undefined} /></div>
      )}
      {h && want.grid.length > 0 && enough(want.grid[0]) && (
        <div className={`${cardP} mb-2.5`}><div className="font-bold text-[15px] mb-1.5">แรงดันกริด {want.grid.length > 1 ? "L1" : ""}</div>
          <LineMini values={vals(want.grid[0])} color="#0d4add" unit="V" area={false} xLabels={xl(want.grid[0])} /></div>
      )}
    </Collapsible>
  );
}
