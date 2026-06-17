import type { ReactNode } from "react";
import type { Latest } from "../lib/api";
import { fmtPower } from "../lib/format";
import { IconSun, IconHouse, IconGrid } from "../lib/icons";

// Horizontal battery with a proportional fill (Deye-style), colour by level.
function BatteryGlyph({ soc }: { soc: number }) {
  const p = Math.max(0, Math.min(100, soc));
  const col = p <= 20 ? "#ef6c2e" : p <= 50 ? "#f5a623" : "#18a673";
  return (
    <svg viewBox="0 0 30 30" className="w-full h-full">
      <rect x="3" y="9.5" width="20" height="11" rx="3" fill="none" stroke="#c4cad6" strokeWidth="2" />
      <rect x="24" y="12.5" width="2.6" height="5" rx="1.3" fill="#c4cad6" />
      <rect x="5" y="11.5" width={(p / 100) * 16} height="7" rx="1.4" fill={col} />
    </svg>
  );
}

function Node({ x, y, color, icon, value, valueColor, label, badge, badgeWarn }: {
  x: number; y: number; color: string; icon: ReactNode; value: string; valueColor?: string; label: string; badge?: string; badgeWarn?: boolean;
}) {
  return (
    <div className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
      {badge && <div className={`mb-1 text-[10px] font-bold px-2 py-[2px] rounded-full leading-none ${badgeWarn ? "text-warn bg-warn/12" : "text-ok bg-ok/12"}`}>{badge}</div>}
      <div className="w-[54px] h-[54px] rounded-2xl bg-white shadow-[0_4px_14px_rgba(17,17,17,0.10)] grid place-items-center" style={{ color }}>
        <span className="w-[26px] h-[26px] block">{icon}</span>
      </div>
      <div className="text-[13px] font-extrabold mt-1.5 whitespace-nowrap leading-tight tabnum" style={{ color: valueColor || "var(--color-title)" }}>{value}</div>
      <div className="text-[11px] text-muted whitespace-nowrap leading-none">{label}</div>
    </div>
  );
}

export function FlowDiagram({ latest }: { latest: Latest }) {
  const bs = (latest.battStatus || "").toUpperCase();
  const buying = (latest.gridPower || 0) >= 0;
  const charging = bs.includes("CHARGE");
  const discharging = bs.includes("DIS");
  const soc = Math.round(latest.soc || 0);
  const gridOff = /OFF|ISLAND|DISCONNECT/i.test(latest.gridStatus || "");
  const gridFlow = !gridOff && Math.abs(latest.gridPower) > 2;
  const battCol = soc <= 20 ? "#ef6c2e" : soc <= 50 ? "#d98c00" : "#18a673";

  // orthogonal L-connectors, written in real flow direction so dots travel correctly
  const edges = [
    { id: "fe-pv", on: latest.genPower > 2, color: "#f5a623", d: "M85,64 H165 V127" },
    { id: "fe-load", on: latest.usePower > 2, color: "#0d4add", d: "M195,173 V226 H275" },
    { id: "fe-grid", on: gridFlow, color: "#8b5cf6", d: buying ? "M275,64 H195 V127" : "M195,127 V64 H275" },
    { id: "fe-batt", on: charging || discharging, color: "#18a673", d: discharging ? "M85,226 H165 V173" : "M165,173 V226 H85" },
  ];

  return (
    <div className="relative w-full" style={{ aspectRatio: "360 / 300" }}>
      <svg viewBox="0 0 360 300" className="absolute inset-0 w-full h-full">
        {edges.map((e) => (
          <path key={e.id} id={e.id} d={e.d} fill="none"
            stroke={e.on ? e.color : "#dde2ea"} strokeWidth={e.on ? 3 : 2}
            strokeOpacity={e.on ? 0.28 : 1} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {/* flowing current — continuous dash stream (smooth + even; plays with Reduce Motion on) */}
        {edges.filter((e) => e.on).map((e) => (
          <path key={`flow-${e.id}`} d={e.d} fill="none" stroke={e.color} strokeWidth="5"
            strokeLinecap="round" strokeLinejoin="round" strokeDasharray="0.1 15">
            <animate attributeName="stroke-dashoffset" from="0" to="-15.1" dur="1.1s" repeatCount="indefinite" />
          </path>
        ))}
        {/* grid connection indicator (green check = on-grid, red cross = off-grid) */}
        <g>
          <circle cx="195" cy="96" r="9" fill={gridOff ? "#e8603c" : "#18a673"} />
          {gridOff ? (
            <path d="M191.5 92.5l7 7M198.5 92.5l-7 7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          ) : (
            <path d="M191 96l3 3 5-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}
        </g>
      </svg>

      <Node x={15.3} y={21.3} color="#f5a623" icon={<IconSun />} value={fmtPower(latest.genPower)} label="แผงโซลาร์" />
      <Node x={84.7} y={21.3} color="#8b5cf6" icon={<IconGrid />} value={fmtPower(latest.gridPower)} label={gridOff ? "ไฟดับ" : buying ? "ซื้อไฟ" : "ไฟย้อน"} badge={gridOff ? "ออฟกริด" : "เชื่อมต่อ"} badgeWarn={gridOff} />
      <Node x={15.3} y={75.3} color="#18a673" icon={<BatteryGlyph soc={soc} />} value={`${soc}%`} valueColor={battCol} label={discharging ? "กำลังจ่าย" : charging ? "กำลังชาร์จ" : "แบตเตอรี่"} />
      <Node x={84.7} y={75.3} color="#0d4add" icon={<IconHouse />} value={fmtPower(latest.usePower)} label="บ้าน" />

      {/* centre inverter */}
      <div className="absolute left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2">
        <div className="w-[60px] h-[46px] rounded-[16px] bg-white grid place-items-center shadow-[0_6px_18px_rgba(17,17,17,0.12)] ring-2 ring-[#0d4add]/20 text-[#0d4add]">
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M6.5 14c1-2.4 2.3-2.4 3.3 0s2.3 2.4 3.3 0 2.3-2.4 3.3 0" />
          </svg>
        </div>
      </div>
    </div>
  );
}
