import { useEffect, useState } from "react";
import type { SunInfo } from "../lib/api";

/* Palette — "Golden hour" (dusk): lavender sky → warm peach → rose-amber arc. */
const THEME = {
  skyTop: "#aab4e8", skyTopOp: 0.6, skyMid: "#ffc28a", skyMidOp: 0.5,
  halo: "#ff9e4d", arc0: "#ff5e7a", arc1: "#ffaf3a", arc2: "#ff7a3d",
  recv: "#ffb24d", grid: "#b89bd0", horizon: "#e8cdb0",
};

const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const pad = (h: number) => String(h).padStart(2, "0");
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return [Math.cos(a) * 11, Math.sin(a) * 11, Math.cos(a) * 15.5, Math.sin(a) * 15.5] as const;
});

type Pt = readonly [number, number];
// Catmull-Rom → cubic-bezier: a soft, natural sun arc (no jagged segments).
function smooth(p: Pt[]): string {
  if (p.length < 2) return "";
  if (p.length === 2) return `M${p[0][0]} ${p[0][1]} L${p[1][0]} ${p[1][1]}`;
  let d = `M${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

// Animated visualisation of the sun's real daily path. Arc height = real noon
// altitude (season/lat driven), curve = sampled solar elevation, sun marker sits
// at the current clock time, and the highlighted band = the real peak-sun window.
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

  const W = 340, X0 = 34, X1 = 306, AW = X1 - X0, HZ = 138, TOP = 34, SKY_T = 12;
  const xAt = (fr: number) => X0 + fr * AW;
  const yAt = (e: number) => HZ - (Math.max(0, e) / peak) * (HZ - TOP);
  const fracOfTime = (t: string) => (toMin(t) - riseMin) / span;
  const pts: Pt[] = arc.map((e, i) => [xAt(i / (n - 1)), yAt(e)]);
  const fullD = smooth(pts);

  const idx = f * (n - 1), i0 = Math.floor(idx), i1 = Math.min(n - 1, i0 + 1);
  const elevNow = arc[i0] + (arc[i1] - arc[i0]) * (idx - i0);
  const sx = xAt(f), sy = yAt(elevNow);

  const passed: Pt[] = pts.slice(0, i1 + 1);
  if (!passed.length || passed[passed.length - 1][0] < sx) passed.push([sx, sy]);
  const passedD = smooth(passed);
  const areaD = `${passedD} L${sx.toFixed(1)} ${HZ} L${X0} ${HZ} Z`;

  const cl = (v: number) => Math.max(0, Math.min(1, v));
  const px0 = xAt(cl(fracOfTime(sun.peakStart))), px1 = xAt(cl(fracOfTime(sun.peakEnd)));
  // faint interior hour gridlines for subtle structure (no labels → stays atmospheric)
  const hours = [6, 9, 12, 15, 18].map((h) => fracOfTime(`${pad(h)}:00`)).filter((fr) => fr > 0.04 && fr < 0.96);

  return (
    <svg viewBox={`0 0 ${W} 184`} className="w-full">
      <defs>
        <clipPath id="sp-sky"><rect x="12" y={SKY_T} width={W - 24} height={HZ - SKY_T} rx="22" /></clipPath>
        <linearGradient id="sp-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={isDay ? THEME.skyTop : "#aeb9d6"} stopOpacity={isDay ? THEME.skyTopOp : 0.5} />
          <stop offset="0.55" stopColor={isDay ? THEME.skyMid : "#cdd5ea"} stopOpacity={isDay ? THEME.skyMidOp : 0.22} />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="sp-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={THEME.halo} stopOpacity="0.55" />
          <stop offset="0.45" stopColor={THEME.halo} stopOpacity="0.16" />
          <stop offset="1" stopColor={THEME.halo} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="sp-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={THEME.arc0} /><stop offset="0.5" stopColor={THEME.arc1} /><stop offset="1" stopColor={THEME.arc2} />
        </linearGradient>
        <linearGradient id="sp-recv" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={THEME.recv} stopOpacity="0.5" /><stop offset="1" stopColor={THEME.recv} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sp-peak" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={THEME.recv} stopOpacity="0.2" /><stop offset="1" stopColor={THEME.recv} stopOpacity="0.02" />
        </linearGradient>
        <radialGradient id="sp-core" cx="38%" cy="34%" r="70%">
          <stop offset="0" stopColor="#fffaf0" /><stop offset="0.45" stopColor="#ffd84a" /><stop offset="1" stopColor="#ff8f00" />
        </radialGradient>
        <filter id="sp-bloom" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6" /></filter>
        <filter id="sp-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      <g clipPath="url(#sp-sky)">
        <rect x="12" y={SKY_T} width={W - 24} height={HZ - SKY_T} fill="url(#sp-bg)" />
        {/* ambient sun-glow halo bleeding into the sky */}
        {isDay && <circle cx={sx.toFixed(1)} cy={sy.toFixed(1)} r="74" fill="url(#sp-halo)"
          style={{ opacity: on ? 1 : 0, transition: "opacity 1s ease .25s" }} />}
        {/* faint hour structure */}
        {hours.map((fr, i) => <line key={i} x1={xAt(fr).toFixed(1)} y1={SKY_T + 6} x2={xAt(fr).toFixed(1)} y2={HZ} stroke={THEME.grid} strokeOpacity="0.13" strokeWidth="1" />)}
        {/* peak-sun window band */}
        {isDay && px1 > px0 && <rect x={px0.toFixed(1)} y={SKY_T} width={(px1 - px0).toFixed(1)} height={HZ - SKY_T} fill="url(#sp-peak)" />}
        {/* sun received so far */}
        {isDay && <path d={areaD} fill="url(#sp-recv)" style={{ opacity: on ? 1 : 0, transition: "opacity .9s ease .2s" }} />}
        {/* full path track (faint) */}
        <path d={fullD} fill="none" stroke="url(#sp-arc)" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
        {/* traversed path — soft glow under a crisp line */}
        {isDay && <>
          <path d={passedD} fill="none" stroke="url(#sp-arc)" strokeOpacity="0.5" strokeWidth="6" strokeLinecap="round" filter="url(#sp-glow)" />
          <path d={passedD} fill="none" stroke="url(#sp-arc)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 700, strokeDashoffset: on ? 0 : 700, transition: "stroke-dashoffset 1.3s cubic-bezier(.22,1,.36,1)" }} />
        </>}
      </g>

      {/* peak-window ticks at the horizon */}
      {isDay && px1 > px0 && (
        <g stroke={THEME.arc1} strokeWidth="2" strokeLinecap="round" opacity="0.75">
          <line x1={px0.toFixed(1)} y1={HZ - 4} x2={px0.toFixed(1)} y2={HZ + 4} />
          <line x1={px1.toFixed(1)} y1={HZ - 4} x2={px1.toFixed(1)} y2={HZ + 4} />
        </g>
      )}
      <line x1="16" y1={HZ} x2={W - 16} y2={HZ} stroke={THEME.horizon} strokeWidth="1.5" strokeLinecap="round" />

      {/* sun marker */}
      {isDay ? (
        <g style={{ transform: on ? `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)` : `translate(${xAt(0).toFixed(1)}px,${HZ}px)`, transition: "transform 1.3s cubic-bezier(.22,1,.36,1)" }}>
          <circle r="18" fill={THEME.arc1} fillOpacity="0.55" filter="url(#sp-bloom)" />
          <circle className="wx-glow" r="13.5" fill={THEME.recv} fillOpacity="0.32" />
          <g className="hero-rays" style={{ transformBox: "fill-box", transformOrigin: "center" }} stroke="#ffc24a" strokeWidth="1.8" strokeLinecap="round">
            {RAYS.map((r, i) => <line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}
          </g>
          <circle r="8.5" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.4" />
          <circle className="hero-core" style={{ transformBox: "fill-box", transformOrigin: "center" }} r="8" fill="url(#sp-core)" />
        </g>
      ) : (
        <circle cx={f < 0.5 ? X0 : X1} cy={HZ} r="5.5" fill="#aeb6c8" />
      )}

      {/* labels (semi-formal) */}
      <g>
        <text x={X0} y="160" textAnchor="middle" fontSize="10" fill="#b08a2e" fontWeight="700">อาทิตย์ขึ้น</text>
        <text x={X0} y="174" textAnchor="middle" fontSize="12" fontWeight="800" fill="#6f727a" className="tabnum">{sun.rise}</text>
        <text x={W / 2} y="168" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#9a6500">{isDay ? `มุมเงยปัจจุบัน ${Math.round(elevNow)}°` : "ดวงอาทิตย์ลับขอบฟ้าแล้ว"}</text>
        <text x={X1} y="160" textAnchor="middle" fontSize="10" fill="#b08a2e" fontWeight="700">อาทิตย์ตก</text>
        <text x={X1} y="174" textAnchor="middle" fontSize="12" fontWeight="800" fill="#6f727a" className="tabnum">{sun.set}</text>
      </g>
    </svg>
  );
}
