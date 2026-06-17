import type { ReactNode } from "react";
import type { Latest } from "../lib/api";

/* ------------------------------------------------------------------ *
 * RingFlow — ring-gauge energy-flow diagram (light theme, white card)
 *
 * Four circular RING nodes (Solar, Grid, Battery + a bigger Home in the
 * middle) wired together with smooth colored SVG curves. Each ring is a
 * thin circular gauge holding an icon + value, with a Thai label below.
 * Active edges carry a small dot animated along the path via <animateMotion>
 * (keeps moving even with iOS "Reduce Motion").
 * ------------------------------------------------------------------ */

/* ---------- helpers ---------- */
function fmtPower(w: number): string {
  const a = Math.abs(Number(w) || 0);
  return a < 1000 ? `${Math.round(a)} W` : `${(a / 1000).toFixed(2)} kW`;
}

const ACTIVE_W = 2; // an edge is "active" when |power| > 2 W

/* ---------- inline line icons (stroke = currentColor) ---------- */
const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function IconSun() {
  return (
    <svg viewBox="0 0 24 24" className="w-full h-full" {...iconStroke}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M19.4 4.6l-1.6 1.6M6.2 17.8l-1.6 1.6" />
    </svg>
  );
}

/* transmission tower / pylon */
function IconPylon() {
  return (
    <svg viewBox="0 0 24 24" className="w-full h-full" {...iconStroke}>
      <path d="M7 22 12 2l5 20" />
      <path d="M5 22h14" />
      <path d="M8.9 6.5h6.2M8 11h8M7 16h10" />
      <path d="M9.2 11 12 6.5 14.8 11M8 16l4-5 4 5" />
    </svg>
  );
}

function IconHouse() {
  return (
    <svg viewBox="0 0 24 24" className="w-full h-full" {...iconStroke}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-5h4v5" />
    </svg>
  );
}

function IconBattery() {
  return (
    <svg viewBox="0 0 24 24" className="w-full h-full" {...iconStroke}>
      <rect x="2.5" y="7.5" width="17" height="9" rx="2.5" />
      <path d="M21.5 10.5v3" />
      <path d="M11.5 9.2 9.4 12.6h2.8L10.1 15.4" />
    </svg>
  );
}

/* ---------- one ring-gauge node (absolutely positioned HTML, SVG ring behind) ---------- */
function RingNode({
  cx,
  cy,
  size,
  color,
  pct,
  icon,
  value,
  sub,
  label,
}: {
  cx: number; // % of the box
  cy: number; // % of the box
  size: number; // px diameter of the ring
  color: string;
  pct: number; // 0..1 arc fill
  icon: ReactNode;
  value: string;
  sub?: ReactNode;
  label: string;
}) {
  const sw = Math.max(5, Math.round(size * 0.075)); // ring thickness
  const r = (size - sw) / 2;
  const C = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, pct));
  const dash = `${C * filled} ${C}`;

  return (
    <div
      className="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${cx}%`, top: `${cy}%` }}
    >
      <div className="relative" style={{ width: size, height: size, color }}>
        {/* gauge ring */}
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 w-full h-full -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#eef0f4"
            strokeWidth={sw}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        </svg>
        {/* center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
          <span
            className="block opacity-90"
            style={{ width: size * 0.26, height: size * 0.26 }}
          >
            {icon}
          </span>
          <span
            className="text-[14px] font-extrabold tabnum mt-1"
            style={{ color: "var(--color-title)" }}
          >
            {value}
          </span>
          {sub ? (
            <span className="text-[11px] font-bold tabnum mt-[1px]" style={{ color }}>
              {sub}
            </span>
          ) : null}
        </div>
      </div>
      <div className="text-[11px] text-muted mt-1.5 whitespace-nowrap leading-none">
        {label}
      </div>
    </div>
  );
}

function IconThermo() {
  return <svg viewBox="0 0 24 24" className="w-full h-full" {...iconStroke}><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z" /></svg>;
}

export function RingFlow({ latest, temps }: { latest: Latest; temps?: { inv?: number; batt?: number } }) {
  const gen = Number(latest.genPower) || 0;
  const use = Number(latest.usePower) || 0;
  const grid = Number(latest.gridPower) || 0;
  const batt = Number(latest.battPower) || 0;
  const soc = Math.max(0, Math.min(100, Math.round(Number(latest.soc) || 0)));

  const bs = (latest.battStatus || "").toUpperCase();
  // status string first; battPower sign (+discharge / −charge) as fallback when STATIC/blank
  let discharging = bs.includes("DIS");
  let charging = bs.includes("CHARGE") && !discharging;
  if (!charging && !discharging) { if (batt > 20) discharging = true; else if (batt < -20) charging = true; }

  const buying = grid >= 0; // buying from grid → into home; exporting → out

  // arc fills -----------------------------------------------------------
  // No rated-power field on Latest → use a near-full subtle arc for solar
  // (scaled gently by output so it still reads as "producing").
  const solarPct = gen > ACTIVE_W ? 0.82 : 0.06;
  const homePct = Math.max(0.05, Math.min(1, use / 6000)); // ~6 kW visual scale
  const gridPct = Math.max(0.05, Math.min(1, Math.abs(grid) / 6000));
  const battPct = discharging ? soc / 100 : charging ? 1 - soc / 100 : soc / 100;

  // active flags --------------------------------------------------------
  const solarOn = gen > ACTIVE_W;
  const gridOn = Math.abs(grid) > ACTIVE_W;
  const battOn = Math.abs(batt) > ACTIVE_W && (charging || discharging);

  /* ---- Deye 6-node layout (viewBox 340×400). Node sizes by importance:
     home hub biggest, power medium, temperatures smallest. ---- */
  const eSolar = { id: "rf-solar", color: "#f5a623", on: solarOn, d: "M86,98 Q132,134 144,158" };
  const eGrid = { id: "rf-grid", color: "#8b5cf6", on: gridOn, d: buying ? "M102,200 Q116,200 122,200" : "M122,200 Q116,200 102,200" };
  const eBatt = { id: "rf-batt", color: "#18a673", on: battOn, d: discharging ? "M86,302 Q132,266 144,242" : "M144,242 Q132,266 86,302" };
  const edges = [eSolar, eGrid, eBatt];

  const gridArrow = buying ? "→" : "←";
  const battArrow = discharging ? "↑" : charging ? "↓" : "";
  const tempCol = (t: number) => (t >= 60 ? "#e8603c" : t >= 45 ? "#d98c00" : "#18a673");
  const tempPct = (t: number) => Math.max(0.05, Math.min(1, t / 80));

  return (
    <div className="metric-plate p-4">
      <div className="relative w-full mx-auto" style={{ aspectRatio: "340 / 400" }}>
        <svg viewBox="0 0 340 400" className="absolute inset-0 w-full h-full pointer-events-none">
          {/* decorative links to the temperature rings */}
          <path d="M222,170 Q244,156 262,140" fill="none" stroke="#e1e5ec" strokeWidth="2" strokeDasharray="1.5 5" strokeLinecap="round" />
          <path d="M222,230 Q244,244 262,260" fill="none" stroke="#e1e5ec" strokeWidth="2" strokeDasharray="1.5 5" strokeLinecap="round" />
          {/* base connector (faint) */}
          {edges.map((e) => (
            <path key={e.id} d={e.d} fill="none" stroke={e.on ? e.color : "#dde2ea"} strokeWidth={e.on ? 3 : 2} strokeOpacity={e.on ? 0.2 : 1} strokeLinecap="round" />
          ))}
          {/* flowing current — continuous dash stream */}
          {edges.filter((e) => e.on).map((e) => (
            <path key={`f-${e.id}`} d={e.d} fill="none" stroke={e.color} strokeWidth="4" strokeLinecap="round" strokeDasharray="0.1 12">
              <animate attributeName="stroke-dashoffset" from="0" to="-12.1" dur="1.05s" repeatCount="indefinite" />
            </path>
          ))}
        </svg>

        {/* left column — power (medium) */}
        <RingNode cx={18} cy={17} size={82} color="#f5a623" pct={solarPct} icon={<IconSun />} value={fmtPower(gen)} label="แสงอาทิตย์" />
        <RingNode cx={18} cy={50} size={82} color="#8b5cf6" pct={gridPct} icon={<IconPylon />} value={fmtPower(grid)} sub={gridOn ? `${gridArrow} ${buying ? "ซื้อ" : "ย้อน"}` : undefined} label="กริด" />
        <RingNode cx={18} cy={83} size={82} color="#18a673" pct={battPct} icon={<IconBattery />} value={`${soc}%`} sub={battOn ? `${battArrow} ${fmtPower(batt)}` : undefined} label="แบตเตอรี่" />

        {/* centre hub — biggest */}
        <RingNode cx={52} cy={50} size={112} color="#0d4add" pct={homePct} icon={<IconHouse />} value={fmtPower(use)} label="บ้าน" />

        {/* right column — temperatures (smallest) */}
        {temps?.inv != null && <RingNode cx={85} cy={30} size={62} color={tempCol(temps.inv)} pct={tempPct(temps.inv)} icon={<IconThermo />} value={`${temps.inv.toFixed(1)}°`} label="อุณหภูมิเครื่อง" />}
        {temps?.batt != null && <RingNode cx={85} cy={70} size={62} color={tempCol(temps.batt)} pct={tempPct(temps.batt)} icon={<IconThermo />} value={`${temps.batt.toFixed(1)}°`} label="อุณหภูมิแบต" />}
      </div>
    </div>
  );
}
