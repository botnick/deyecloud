import { useEffect, useState } from "react";
import type { SunInfo } from "../lib/api";

const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return [Math.cos(a) * 9.5, Math.sin(a) * 9.5, Math.cos(a) * 13.5, Math.sin(a) * 13.5] as const;
});

// Animated visualisation of the sun's real daily path. The arc height = the real
// noon altitude (season/lat driven), the curve = sampled solar elevation, and the
// sun marker sits at the current clock time. Nothing faked.
export function SunPath({ sun }: { sun: SunInfo }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);

  const arc = sun.arc && sun.arc.length > 1 ? sun.arc : [0, 1, 0];
  const n = arc.length;
  const peak = Math.max(1, sun.noonElev || Math.max(...arc));
  const riseMin = toMin(sun.rise), setMin = toMin(sun.set), span = Math.max(1, setMin - riseMin);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isDay = nowMin >= riseMin && nowMin <= setMin;
  const f = Math.max(0, Math.min(1, (nowMin - riseMin) / span));

  const W = 320, X0 = 28, X1 = 292, AW = X1 - X0, HZ = 116, TOP = 20;
  const xAt = (fr: number) => X0 + fr * AW;
  const yAt = (e: number) => HZ - (Math.max(0, e) / peak) * (HZ - TOP);
  const pts = arc.map((e, i) => [xAt(i / (n - 1)), yAt(e)] as const);
  const D = (a: readonly (readonly [number, number])[]) => a.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const fullD = D(pts);

  const idx = f * (n - 1), i0 = Math.floor(idx), i1 = Math.min(n - 1, i0 + 1);
  const elevNow = arc[i0] + (arc[i1] - arc[i0]) * (idx - i0);
  const sx = xAt(f), sy = yAt(elevNow);
  const passed = pts.slice(0, Math.max(2, i1 + 1));

  return (
    <svg viewBox={`0 0 ${W} 142`} className="w-full">
      <defs>
        <linearGradient id="sp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={isDay ? "#ffe09a" : "#cbd5ea"} stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sp-core" cx="42%" cy="38%" r="65%">
          <stop offset="0" stopColor="#fff3c4" /><stop offset="0.55" stopColor="#ffcc00" /><stop offset="1" stopColor="#ff9500" />
        </radialGradient>
      </defs>

      {/* sky fill under the path */}
      <path d={`${fullD} L${X1} ${HZ} L${X0} ${HZ} Z`} fill="url(#sp-sky)" />
      {/* full path (faint dashed) */}
      <path d={fullD} fill="none" stroke="#e0c074" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
      {/* traversed path so far (solid gold) */}
      {isDay && <path d={D(passed)} fill="none" stroke="#ff9d00" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {/* horizon */}
      <line x1={X0 - 6} y1={HZ} x2={X1 + 6} y2={HZ} stroke="#e6e8ef" strokeWidth="1.5" />

      {/* sun marker — rises along the arc to the current time */}
      {isDay ? (
        <g style={{ transform: on ? `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)` : `translate(${xAt(0).toFixed(1)}px,${HZ}px)`, transition: "transform 1.2s cubic-bezier(.22,1,.36,1)" }}>
          <circle className="wx-glow" r="15" fill="#ffcc00" fillOpacity="0.4" />
          <g className="hero-rays" style={{ transformBox: "fill-box", transformOrigin: "center" }} stroke="#ffbe3a" strokeWidth="1.8" strokeLinecap="round">
            {RAYS.map((r, i) => <line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}
          </g>
          <circle className="hero-core" style={{ transformBox: "fill-box", transformOrigin: "center" }} r="7.5" fill="url(#sp-core)" />
        </g>
      ) : (
        <circle cx={f < 0.5 ? X0 : X1} cy={HZ} r="5" fill="#c4cad6" />
      )}

      <text x={X0} y="134" textAnchor="middle" fontSize="11" fontWeight="600" fill="#808080" className="tabnum">{sun.rise}</text>
      <text x={W / 2} y="134" textAnchor="middle" fontSize="10.5" fill="#a0a4ac">{isDay ? `ดวงอาทิตย์สูง ${Math.round(elevNow)}°` : "ลับขอบฟ้าแล้ว"}</text>
      <text x={X1} y="134" textAnchor="middle" fontSize="11" fontWeight="600" fill="#808080" className="tabnum">{sun.set}</text>
    </svg>
  );
}
