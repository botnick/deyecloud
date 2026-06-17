import { useEffect, useRef, useState } from "react";
import type { SunInfo } from "../lib/api";

const toMin = (t: string) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) * 60 + (m || 0); };
const pad = (h: number) => String(h).padStart(2, "0");
const rad = Math.PI / 180;
// Haurwitz (1945) clear-sky GHI from sun elevation — same model as the worker.
const ghiOf = (elevDeg: number) => { if (elevDeg <= 0) return 0; const s = Math.sin(elevDeg * rad); return 1098 * s * Math.exp(-0.059 / s); };

const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  return [Math.cos(a) * 11, Math.sin(a) * 11, Math.cos(a) * 15.5, Math.sin(a) * 15.5] as const;
});

type Pt = readonly [number, number];
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

// hex colour lerp, and a 3-keyframe blend (dawn → noon → dusk) by fraction f
function lerpHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) + (((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = Math.round(((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = Math.round((pa & 255) + ((pb & 255) - (pa & 255)) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}
const key3 = (f: number, c0: string, c1: string, c2: string) => (f < 0.5 ? lerpHex(c0, c1, f * 2) : lerpHex(c1, c2, (f - 0.5) * 2));

const PlayIcon = () => <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>;
const PauseIcon = () => <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><rect x="6.5" y="5.5" width="4" height="13" rx="1" /><rect x="13.5" y="5.5" width="4" height="13" rx="1" /></svg>;

/* Interactive sun simulator — scrub the day; sun, sky colour and the clear-sky
   solar reception update live. Play animates the whole day; "ตอนนี้" = now.
   Every value comes from the real `sun` data (NOAA arc + Haurwitz GHI). */
export function SunPath({ sun }: { sun: SunInfo }) {
  const arc = sun.arc && sun.arc.length > 1 ? sun.arc : [0, 1, 0];
  const n = arc.length;
  const peak = Math.max(1, sun.noonElev || Math.max(...arc));
  const riseMin = toMin(sun.rise), setMin = toMin(sun.set), span = Math.max(1, setMin - riseMin);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const nowFrac = Math.max(0, Math.min(1, (nowMin - riseMin) / span));
  const nightNow = nowMin < riseMin || nowMin > setMin; // currently before sunrise / after sunset
  const nowClock = `${pad(Math.floor(nowMin / 60))}:${pad(nowMin % 60)}`;

  const [sim, setSim] = useState<number | null>(null); // null = live (follow clock)
  const [playing, setPlaying] = useState(false);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) return;
    startRef.current = null;
    let raf = 0;
    const DUR = 6000;
    const tick = (ts: number) => {
      if (startRef.current == null) startRef.current = ts;
      const p = Math.min(1, (ts - startRef.current) / DUR);
      setSim(p);
      if (p < 1) raf = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const live = sim == null;
  const f = live ? nowFrac : sim;

  const W = 340, X0 = 34, X1 = 306, AW = X1 - X0, HZ = 138, TOP = 34, SKY_T = 12;
  const xAt = (fr: number) => X0 + fr * AW;
  const yAt = (e: number) => HZ - (Math.max(0, e) / peak) * (HZ - TOP);
  const fracOfTime = (t: string) => (toMin(t) - riseMin) / span;
  const cl = (v: number) => Math.max(0, Math.min(1, v));
  const elevAt = (fr: number) => { const idx = fr * (n - 1), i0 = Math.floor(idx), i1 = Math.min(n - 1, i0 + 1); return arc[i0] + (arc[i1] - arc[i0]) * (idx - i0); };

  const pts: Pt[] = arc.map((e, i) => [xAt(i / (n - 1)), yAt(e)]);
  const fullD = smooth(pts);
  const elev = elevAt(f);
  const sx = xAt(f), sy = yAt(elev);
  const passed: Pt[] = pts.slice(0, Math.min(n - 1, Math.floor(f * (n - 1))) + 1);
  if (!passed.length || passed[passed.length - 1][0] < sx) passed.push([sx, sy]);
  const passedD = smooth(passed);
  const areaD = `${passedD} L${sx.toFixed(1)} ${HZ} L${X0} ${HZ} Z`;
  const px0 = xAt(cl(fracOfTime(sun.peakStart))), px1 = xAt(cl(fracOfTime(sun.peakEnd)));
  const hours = [6, 9, 12, 15, 18].map((h) => fracOfTime(`${pad(h)}:00`)).filter((fr) => fr > 0.04 && fr < 0.96);

  // live readouts at the scrubbed time
  const mins = Math.round(riseMin + f * span);
  const clock = `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
  const g = Math.round(ghiOf(elev));
  const prod = sun.noonGhi > 0 ? Math.max(0, Math.min(100, Math.round((g / sun.noonGhi) * 100))) : 0;

  // sky + halo shift through the day (dawn → noon → dusk)
  const skyTop = key3(f, "#c9b3ec", "#b8d8f0", "#8a73c4");
  const skyMid = key3(f, "#ffc08a", "#fff0cf", "#ff8f5a");
  const halo = key3(f, "#ff9e4d", "#ffd24d", "#ff7a3d");

  return (
    <div className="select-none">
      <svg viewBox={`0 0 ${W} 168`} className="w-full">
        <defs>
          <clipPath id="sp-sky"><rect x="12" y={SKY_T} width={W - 24} height={HZ - SKY_T} rx="22" /></clipPath>
          <linearGradient id="sp-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} stopOpacity="0.62" />
            <stop offset="0.55" stopColor={skyMid} stopOpacity="0.5" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="sp-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={halo} stopOpacity="0.55" />
            <stop offset="0.45" stopColor={halo} stopOpacity="0.16" />
            <stop offset="1" stopColor={halo} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sp-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#ff5e7a" /><stop offset="0.5" stopColor="#ffaf3a" /><stop offset="1" stopColor="#ff7a3d" />
          </linearGradient>
          <linearGradient id="sp-recv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb24d" stopOpacity="0.5" /><stop offset="1" stopColor="#ffb24d" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="sp-peak" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffb24d" stopOpacity="0.2" /><stop offset="1" stopColor="#ffb24d" stopOpacity="0.02" />
          </linearGradient>
          <radialGradient id="sp-core" cx="38%" cy="34%" r="70%">
            <stop offset="0" stopColor="#fffaf0" /><stop offset="0.45" stopColor="#ffd84a" /><stop offset="1" stopColor="#ff8f00" />
          </radialGradient>
          <filter id="sp-bloom" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="sp-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>

        <g clipPath="url(#sp-sky)">
          <rect x="12" y={SKY_T} width={W - 24} height={HZ - SKY_T} fill="url(#sp-bg)" />
          <circle cx={sx.toFixed(1)} cy={sy.toFixed(1)} r="74" fill="url(#sp-halo)" />
          {hours.map((fr, i) => <line key={i} x1={xAt(fr).toFixed(1)} y1={SKY_T + 6} x2={xAt(fr).toFixed(1)} y2={HZ} stroke="#b89bd0" strokeOpacity="0.13" strokeWidth="1" />)}
          {px1 > px0 && <rect x={px0.toFixed(1)} y={SKY_T} width={(px1 - px0).toFixed(1)} height={HZ - SKY_T} fill="url(#sp-peak)" />}
          <path d={areaD} fill="url(#sp-recv)" />
          <path d={fullD} fill="none" stroke="url(#sp-arc)" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
          <path d={passedD} fill="none" stroke="url(#sp-arc)" strokeOpacity="0.5" strokeWidth="6" strokeLinecap="round" filter="url(#sp-glow)" />
          <path d={passedD} fill="none" stroke="url(#sp-arc)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {px1 > px0 && (
          <g stroke="#ffaf3a" strokeWidth="2" strokeLinecap="round" opacity="0.75">
            <line x1={px0.toFixed(1)} y1={HZ - 4} x2={px0.toFixed(1)} y2={HZ + 4} />
            <line x1={px1.toFixed(1)} y1={HZ - 4} x2={px1.toFixed(1)} y2={HZ + 4} />
          </g>
        )}
        <line x1="16" y1={HZ} x2={W - 16} y2={HZ} stroke="#e8cdb0" strokeWidth="1.5" strokeLinecap="round" />

        <g style={{ transform: `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)` }}>
          <circle r="18" fill="#ffaf3a" fillOpacity="0.55" filter="url(#sp-bloom)" />
          <circle className="wx-glow" r="13.5" fill="#ffb24d" fillOpacity="0.32" />
          <g className="hero-rays" style={{ transformBox: "fill-box", transformOrigin: "center" }} stroke="#ffc24a" strokeWidth="1.8" strokeLinecap="round">
            {RAYS.map((r, i) => <line key={i} x1={r[0]} y1={r[1]} x2={r[2]} y2={r[3]} />)}
          </g>
          <circle r="8.5" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="1.4" />
          <circle r="8" fill="url(#sp-core)" />
        </g>

        {/* endpoint times */}
        <text x={X0} y="160" textAnchor="middle" fontSize="11" fontWeight="700" fill="#9a6500">{sun.rise}</text>
        <text x={X1} y="160" textAnchor="middle" fontSize="11" fontWeight="700" fill="#9a6500">{sun.set}</text>
      </svg>

      {/* controls */}
      <div className="mt-1 flex items-center gap-3">
        <button
          onClick={() => { if (playing) { setPlaying(false); } else { setSim(0); setPlaying(true); } }}
          aria-label={playing ? "หยุด" : "เล่นจำลองทั้งวัน"}
          className="grid place-items-center w-11 h-11 rounded-full bg-pv text-white shrink-0 active:scale-95 transition-transform shadow-[0_6px_16px_-6px_rgba(245,166,35,0.8)]"
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <input
          type="range" min={0} max={1} step={0.002} value={f}
          onChange={(e) => { setPlaying(false); setSim(Number(e.target.value)); }}
          aria-label="เลื่อนเวลาจำลองดวงอาทิตย์"
          className="flex-1 h-2.5 cursor-pointer rounded-full accent-pv"
        />
        <button
          onClick={() => { setPlaying(false); setSim(null); }}
          className={`shrink-0 h-9 px-3 rounded-xl text-[14px] font-bold transition-colors ${live ? "bg-secondary-soft text-secondary" : "bg-canvas text-body active:bg-line"}`}
        >
          ตอนนี้
        </button>
      </div>

      {/* live readouts at the scrubbed time */}
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        <div className="bg-canvas rounded-2xl px-3 py-2.5 text-center">
          <div className="text-[12px] text-body">{live ? (nightNow ? "ตอนนี้ · กลางคืน" : "เวลาตอนนี้") : "เวลาจำลอง"}</div>
          <div className="text-[17px] font-extrabold tabnum mt-0.5">{live && nightNow ? nowClock : clock}</div>
        </div>
        <div className="bg-canvas rounded-2xl px-3 py-2.5 text-center">
          <div className="text-[12px] text-body">มุมเงยดวงอาทิตย์</div>
          <div className="text-[17px] font-extrabold tabnum mt-0.5">{live && nightNow ? "—" : `${Math.round(elev)}°`}</div>
        </div>
        <div className="bg-canvas rounded-2xl px-3 py-2.5 text-center">
          <div className="text-[12px] text-body">กำลังผลิตโดยประมาณ</div>
          <div className="text-[17px] font-extrabold tabnum mt-0.5 text-pv-high">{prod}%</div>
        </div>
      </div>
    </div>
  );
}
