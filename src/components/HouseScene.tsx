import { useEffect, useState } from "react";
import type { Latest, Weather } from "../lib/api";
import { fmtPower } from "../lib/format";
import { condText, skyPhase, skyWx, type SkyPhase } from "../lib/weather";

/* Home hero — an isometric solar house drawn in SVG (no bitmap), in the spirit of the
   Tesla / Apple Home energy cards: roof panels, wall battery, inverter, grid pole, with the
   live power flowing along the real wiring. Sky + lighting follow the site's time of day. */

// isometric projection: x → down-right, y → down-left, z → up (units ≈ 1 m)
const S = 18.5, CX = 192, CY = 92;
const P = (x: number, y: number, z = 0): [number, number] => [CX + (x - y) * S * 0.866, CY + (x + y) * S * 0.5 - z * S];
const poly = (...pts: [number, number, number][]) => pts.map(([x, y, z]) => P(x, y, z).map((v) => v.toFixed(1)).join(",")).join(" ");
const pt = (x: number, y: number, z = 0) => P(x, y, z).map((v) => v.toFixed(1)).join(" ");

// roof: gable along x, ridge at y=5; eave at y=7.4 (front) / y=2.6 (back)
const slope = (s: number) => ({ y: 7.3 - 2.3 * s, z: 2.75 + 1.55 * s }); // s 0 = eave, 1 = ridge (front slope)

const COL = { pv: "#f5a623", home: "#0d6bff", batt: "#18a673", grid: "#8b5cf6" };

function Panels() {
  const out = [];
  const cols = 5, rows = 2, x0 = 3.5, x1 = 8.5, s0 = 0.14, s1 = 0.9;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const xa = x0 + ((x1 - x0) / cols) * c + 0.05, xb = x0 + ((x1 - x0) / cols) * (c + 1) - 0.05;
    const sa = s0 + ((s1 - s0) / rows) * r + 0.02, sb = s0 + ((s1 - s0) / rows) * (r + 1) - 0.02;
    const A = slope(sa), B = slope(sb);
    out.push(<polygon key={`${r}${c}`} points={poly([xa, A.y, A.z], [xb, A.y, A.z], [xb, B.y, B.z], [xa, B.y, B.z])} fill="url(#hs-panel)" stroke="#9fb6dd" strokeOpacity=".55" strokeWidth=".6" />);
    // cell lines
    const m = (sa + sb) / 2, M = slope(m);
    out.push(<polyline key={`l${r}${c}`} points={poly([xa, M.y, M.z], [xb, M.y, M.z])} stroke="#b9cdf0" strokeOpacity=".35" strokeWidth=".5" fill="none" />);
  }
  return <g>{out}</g>;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  return now;
}

export function HouseScene({ latest, weather, title, force }: { latest: Latest; weather: Weather | null; title?: string; force?: { phase?: SkyPhase } }) {
  const now = useClock();
  // ?sky=day|dawn|golden|dusk|night previews a lighting (screenshots); otherwise the site's real time
  const qp = typeof location !== "undefined" ? new URLSearchParams(location.search).get("sky") : null;
  const preview = (["night", "dawn", "day", "golden", "dusk"] as SkyPhase[]).find((x) => x === qp);
  const phase = force?.phase ?? preview ?? skyPhase(now, weather?.sun?.rise, weather?.sun?.set);
  const night = phase === "night";
  const wx = skyWx(weather?.cond ?? 1);
  const dim = night || phase === "dusk";

  // live energy state (same conventions as the rest of the app)
  const bs = (latest.battStatus || "").toUpperCase();
  const bp = Number(latest.battPower) || 0;
  let charging = bs.includes("CHARGE") && !bs.includes("DIS"), discharging = bs.includes("DIS");
  if (!charging && !discharging) { if (bp < -20) charging = true; else if (bp > 20) discharging = true; }
  const soc = Math.max(0, Math.min(100, Math.round(latest.soc || 0)));
  const hasBatt = (latest.soc || 0) > 0.5 || charging || discharging || Math.abs(bp) > 15;
  const gridOff = /OFF|ISLAND|DISCONNECT/i.test(latest.gridStatus || "");
  const gp = latest.gridPower || 0;
  const buying = gp >= 0;
  const pvOn = (latest.genPower || 0) > 20, gridOn = !gridOff && Math.abs(gp) > 20;

  // wiring (screen paths). Inverter sits on the right wall.
  const INV: [number, number, number] = [9.02, 3.7, 1.25];
  const path = (pts: [number, number, number][]) => "M" + pts.map(([x, y, z]) => pt(x, y, z)).join(" L");
  const wires = {
    pv: path([[8.5, 5.8, 3.65], [9.0, 5.8, 3.0], [9.02, 3.9, 2.7], [9.02, 3.7, 1.65]]),
    batt: path([[9.02, 3.95, 1.0], [9.02, 5.6, 1.0], [9.2, 5.9, 1.0]]),
    grid: path([[10.6, 1.0, 4.3], [9.6, 2.6, 2.9], [9.02, 3.3, 1.5]]),
  };
  const flows: { k: keyof typeof COL; d: string; on: boolean; rev: boolean }[] = [
    { k: "pv", d: wires.pv, on: pvOn, rev: false },
    ...(hasBatt ? [{ k: "batt" as const, d: wires.batt, on: charging || discharging, rev: discharging }] : []),
    { k: "grid", d: wires.grid, on: gridOn, rev: !buying },
  ];

  const sky: Record<SkyPhase, [string, string]> = {
    day: ["#7cc0f4", "#e6f4ff"], dawn: ["#8f8bc9", "#ffd8b8"], golden: ["#8fb5e8", "#ffe2b0"], dusk: ["#3b3d7a", "#e9919c"], night: ["#0b1534", "#25345f"],
  };
  const cloudy = wx === "cloud" || wx === "rain" || wx === "storm";
  const [skyTop, skyBot] = sky[phase];

  const winFill = dim ? "url(#hs-lit)" : "url(#hs-glass)";
  const chip = (k: keyof typeof COL, label: string, value: string, style: React.CSSProperties, extra?: React.ReactNode) => (
    <div className="hs-chip" style={style}>
      <span className="dot" style={{ background: k === "grid" && gridOff ? "#94a3b8" : COL[k] }} />
      <span className="txt"><span className="lb">{label}</span><span className="vl">{value}</span></span>
      {extra}
    </div>
  );

  return (
    <div className={`hscene ${dim ? "dim" : ""}`} style={{ background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBot} 78%)` }}>
      {cloudy && <div className="hs-haze" />}
      {night && <div className="hs-stars" />}
      <svg className="hs-svg" viewBox="0 0 392 330" aria-hidden>
        <defs>
          <linearGradient id="hs-grass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c9ecae" /><stop offset="1" stopColor="#97d27a" /></linearGradient>
          <linearGradient id="hs-panel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3466b8" /><stop offset=".55" stopColor="#1d3c78" /><stop offset="1" stopColor="#14295a" /></linearGradient>
          <linearGradient id="hs-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#cfe6fb" /><stop offset="1" stopColor="#8fb7dd" /></linearGradient>
          <linearGradient id="hs-lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe9a8" /><stop offset="1" stopColor="#ffbf5c" /></linearGradient>
          <linearGradient id="hs-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6b7385" /><stop offset="1" stopColor="#4c5466" /></linearGradient>
          <radialGradient id="hs-shadow" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#2c4a1c" stopOpacity=".28" /><stop offset="1" stopColor="#2c4a1c" stopOpacity="0" /></radialGradient>
          <filter id="hs-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" /></filter>
        </defs>

        {/* ground slab */}
        <polygon points={poly([0, 9.6, 0], [11.4, 9.6, 0], [11.4, 9.6, -0.7], [0, 9.6, -0.7])} fill="#7a5a3e" />
        <polygon points={poly([11.4, 0, 0], [11.4, 9.6, 0], [11.4, 9.6, -0.7], [11.4, 0, -0.7])} fill="#8e6a49" />
        <polygon points={poly([0, 9.6, -0.7], [11.4, 9.6, -0.7], [11.4, 9.6, -0.55], [0, 9.6, -0.55])} fill="#5f4530" />
        <polygon points={poly([0, 0, 0], [11.4, 0, 0], [11.4, 9.6, 0], [0, 9.6, 0])} fill="url(#hs-grass)" />
        {/* path to the door + patio */}
        <polygon points={poly([5.7, 7.2, 0], [6.6, 7.2, 0], [6.8, 9.6, 0], [5.5, 9.6, 0])} fill="#efe8db" />
        <polygon points={poly([3.3, 7.3, 0], [9.6, 7.3, 0], [9.6, 2.7, 0], [10.6, 3.2, 0], [10.6, 7.9, 0], [3.9, 7.9, 0])} fill="#2c4a1c" opacity=".12" />

        {/* grid pole (behind the house) */}
        <line x1={P(10.6, 1.0, 0)[0]} y1={P(10.6, 1.0, 0)[1]} x2={P(10.6, 1.0, 4.9)[0]} y2={P(10.6, 1.0, 4.9)[1]} stroke="#6b5a4a" strokeWidth="3.2" strokeLinecap="round" />
        <line x1={P(10.0, 1.0, 4.5)[0]} y1={P(10.0, 1.0, 4.5)[1]} x2={P(11.2, 1.0, 4.5)[0]} y2={P(11.2, 1.0, 4.5)[1]} stroke="#6b5a4a" strokeWidth="2.4" strokeLinecap="round" />

        {/* back roof slope (visible above the ridge) */}
        <polygon points={poly([2.7, 2.7, 2.75], [9.3, 2.7, 2.75], [9.3, 5, 4.3], [2.7, 5, 4.3])} fill="#3f4656" />
        {/* walls */}
        <polygon points={poly([3, 7, 0], [9, 7, 0], [9, 7, 3.0], [3, 7, 3.0])} fill={dim ? "#c9c0b3" : "#fbf7f0"} />
        <polygon points={poly([9, 3, 0], [9, 7, 0], [9, 7, 3.0], [9, 5, 4.3], [9, 3, 3.0])} fill={dim ? "#a99f92" : "#e9e1d3"} />
        {/* plinth */}
        <polygon points={poly([3, 7, 0], [9, 7, 0], [9, 7, 0.22], [3, 7, 0.22])} fill="#bdb3a3" />
        <polygon points={poly([9, 3, 0], [9, 7, 0], [9, 7, 0.22], [9, 3, 0.22])} fill="#a89e8f" />
        {/* windows + door on the front wall */}
        <polygon points={poly([3.6, 7, 1.05], [4.9, 7, 1.05], [4.9, 7, 2.15], [3.6, 7, 2.15])} fill={winFill} stroke="#ffffff" strokeWidth="1.4" />
        <polygon points={poly([7.1, 7, 1.0], [8.4, 7, 1.0], [8.4, 7, 2.0], [7.1, 7, 2.0])} fill={winFill} stroke="#ffffff" strokeWidth="1.4" />
        <polygon points={poly([5.65, 7, 0.22], [6.55, 7, 0.22], [6.55, 7, 1.95], [5.65, 7, 1.95])} fill="#c98f52" stroke="#ffffff" strokeWidth="1.2" />
        <circle cx={P(6.4, 7, 1.05)[0]} cy={P(6.4, 7, 1.05)[1]} r="1.1" fill="#f6e2b8" />
        {/* side window */}
        <polygon points={poly([9, 4.3, 1.0], [9, 5.2, 1.0], [9, 5.2, 2.0], [9, 4.3, 2.0])} fill={winFill} stroke="#ffffff" strokeWidth="1.3" />
        {dim && <g filter="url(#hs-glow)" opacity=".75">
          <polygon points={poly([3.6, 7, 1.05], [4.9, 7, 1.05], [4.9, 7, 2.15], [3.6, 7, 2.15])} fill="#ffcf6b" />
          <polygon points={poly([7.1, 7, 1.0], [8.4, 7, 1.0], [8.4, 7, 2.0], [7.1, 7, 2.0])} fill="#ffcf6b" />
        </g>}

        {/* front roof slope + panels + fascia */}
        <polygon points={poly([2.7, 7.3, 2.75], [9.3, 7.3, 2.75], [9.3, 5, 4.3], [2.7, 5, 4.3])} fill="url(#hs-roof)" />
        <Panels />
        <polygon points={poly([2.7, 7.3, 2.75], [9.3, 7.3, 2.75], [9.3, 7.3, 2.57], [2.7, 7.3, 2.57])} fill="#3a404d" />
        <polygon points={poly([9.3, 7.3, 2.75], [9.3, 5, 4.3], [9.3, 5, 4.12], [9.3, 7.3, 2.57])} fill="#2f3440" />
        <polygon points={poly([9.3, 2.7, 2.75], [9.3, 5, 4.3], [9.3, 5, 4.12], [9.3, 2.7, 2.57])} fill="#2f3440" />
        <polyline points={poly([2.7, 5, 4.3], [9.3, 5, 4.3])} stroke="#8b93a5" strokeWidth="1.2" />

        {/* inverter on the right wall */}
        <polygon points={poly([9.02, 3.3, 0.85], [9.02, 4.1, 0.85], [9.02, 4.1, 1.65], [9.02, 3.3, 1.65])} fill="#f8fafc" stroke="#cbd5e1" strokeWidth=".8" />
        <polygon points={poly([9.02, 3.45, 1.3], [9.02, 3.95, 1.3], [9.02, 3.95, 1.5], [9.02, 3.45, 1.5])} fill="#1e293b" />
        {/* wall battery (Powerwall-style) */}
        {hasBatt && <g>
          <polygon points={poly([9.0, 5.7, 0.25], [9.38, 5.7, 0.25], [9.38, 6.65, 0.25], [9.0, 6.65, 0.25])} fill="#d6dbe3" />
          <polygon points={poly([9.38, 5.7, 0.25], [9.38, 6.65, 0.25], [9.38, 6.65, 1.85], [9.38, 5.7, 1.85])} fill="#ffffff" stroke="#d3d9e2" strokeWidth=".7" />
          <polygon points={poly([9.0, 5.7, 1.85], [9.38, 5.7, 1.85], [9.38, 6.65, 1.85], [9.0, 6.65, 1.85])} fill="#eef1f5" />
          <polygon points={poly([9.38, 5.9, 1.05], [9.38, 6.45, 1.05], [9.38, 6.45, 1.12], [9.38, 5.9, 1.12])} fill={charging || discharging ? COL.batt : "#9fe0c4"} />
        </g>}

        {/* tree + bushes */}
        <line x1={P(1.5, 8.2)[0]} y1={P(1.5, 8.2)[1]} x2={P(1.5, 8.2, 1.6)[0]} y2={P(1.5, 8.2, 1.6)[1]} stroke="#8a6141" strokeWidth="3.4" strokeLinecap="round" />
        {[[0, 2.6, 15], [-8, 2.0, 11], [8, 2.1, 11], [0, 3.3, 10]].map(([dx, z, r], i) => (
          <circle key={i} cx={P(1.5, 8.2, z)[0] + dx} cy={P(1.5, 8.2, z)[1]} r={r} fill={i === 3 ? "#9ed97f" : "#7cc464"} />
        ))}
        {[[3.3, 7.6], [4.4, 7.7], [7.6, 7.7], [8.7, 7.6], [9.6, 7.0]].map(([x, y], i) => (
          <circle key={i} cx={P(x, y, 0.35)[0]} cy={P(x, y, 0.35)[1]} r="6.5" fill={i % 2 ? "#8fd16f" : "#79bf5c"} />
        ))}

        {/* power flows along the wiring */}
        {flows.map((f) => (
          <g key={f.k}>
            <path d={f.d} fill="none" stroke={COL[f.k]} strokeOpacity={f.on ? 0.22 : 0.12} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d={f.d} fill="none" stroke={f.k === "grid" && gridOff ? "#94a3b8" : COL[f.k]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={f.on ? "4 9" : "2 6"} strokeOpacity={f.on ? 1 : 0.45} className={f.on ? (f.rev ? "hs-flow rev" : "hs-flow") : undefined} />
          </g>
        ))}
      </svg>

      <div className="hs-top">
        <div className="min-w-0">
          <div className="hs-name">{title || "บ้านของฉัน"}</div>
          <div className="hs-wx">{condText(weather?.cond ?? 1, night)}{weather?.temp != null ? ` · ${Math.round(weather.temp)}°` : ""}</div>
        </div>
        <div className="hs-live"><span className="d" />สด</div>
      </div>

      {chip("pv", "โซลาร์", fmtPower(latest.genPower), { left: "4%", top: "30%" })}
      {chip("grid", gridOff ? "ไฟดับ" : buying ? "ซื้อไฟ" : "ขายไฟ", fmtPower(Math.abs(gp)), { right: "4%", top: "30%" })}
      {chip("home", "บ้านใช้", fmtPower(latest.usePower), { left: "4%", bottom: "6%" })}
      {hasBatt && chip("batt", discharging ? "แบตจ่าย" : charging ? "แบตชาร์จ" : "แบต", fmtPower(Math.abs(bp)), { right: "4%", bottom: "6%" },
        <span className="soc"><i style={{ width: `${soc}%` }} /><b>{soc}%</b></span>)}
    </div>
  );
}
