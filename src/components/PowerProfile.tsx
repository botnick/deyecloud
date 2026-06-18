// PowerProfile.tsx — interactive solar "Power Profile" multi-line chart.
// Pure inline SVG, no chart libraries. React 19 + TypeScript + Tailwind v4.
//   • drag / hover  → crosshair; legend + time read out the scrubbed moment
//   • expand button → fullscreen (rotate phone = landscape, big chart)
//   • two fingers   → pinch-zoom + pan the time axis (fullscreen)
import { useEffect, useRef, useState } from "react";

interface PowerPoint {
  ts: number; // unix SECONDS
  gen_power: number; // watts
  use_power: number; // watts
  grid_power: number; // watts
  batt_power: number; // watts
  soc: number; // 0..100
}

// --- colors (entity palette — must match FlowDiagram / tokens) ---
const C_GEN = "#f5a623"; // ผลิต  (solar = amber)
const C_USE = "#0d4add"; // ใช้   (home = blue)
const C_GRID = "#8b5cf6"; // กริด  (grid = violet)
const C_BATT = "#18a673"; // แบต   (battery = green)
const C_SOC = "#0b6b48"; // แบต % (battery family, darker + dashed)
const AXIS = "#a0a4ac";
const GRIDLINE = "#eeeeee";

const PAD = { l: 34, r: 30, t: 18, b: 26 };
const round1 = (n: number) => Math.round(n * 10) / 10;

const hourOfDay = (ts: number) => { const d = new Date(ts * 1000); return d.getHours() + d.getMinutes() / 60; };
const fmtClock = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const hourLabel = (h: number) => {
  let hh = Math.floor(h + 1e-6), mm = Math.round((h - hh) * 60);
  if (mm >= 60) { hh += 1; mm -= 60; }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

function niceStep(span: number, target = 4): number {
  if (!isFinite(span) || span <= 0) return 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return nice * mag;
}

function kwBounds(pts: PowerPoint[]): { min: number; max: number; step: number } {
  let lo = 0, hi = 0;
  for (const p of pts)
    for (const w of [p.gen_power, p.use_power, p.grid_power, p.batt_power]) {
      const kw = w / 1000;
      if (kw < lo) lo = kw;
      if (kw > hi) hi = kw;
    }
  if (hi - lo < 0.5) hi = lo + 0.5;
  const step = niceStep(hi - lo, 4);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  return { min, max: max === min ? min + step : max, step };
}

// nearest sample index to a given hour-of-day (points are time-ordered).
function nearestIdx(pts: PowerPoint[], hour: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(hourOfDay(pts[i].ts) - hour);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

const MIN_SPAN = 1; // don't zoom tighter than a 1-hour window

interface View { h0: number; h1: number }

// ---- the chart itself (shared by the inline card + the fullscreen sheet) ----
function ChartSVG({
  points, view, setView, vbW, vbH, cursorOn, activeIdx, setCursorHour, big,
}: {
  points: PowerPoint[];
  view: View;
  setView?: (v: View) => void; // present = pinch-zoom/pan enabled
  vbW: number; vbH: number;
  cursorOn: boolean;
  activeIdx: number;
  setCursorHour: (h: number | null) => void;
  big?: boolean;
}) {
  const overlayRef = useRef<SVGRectElement>(null);
  const pinch = useRef<{ hA: number; hB: number } | null>(null);

  const PLOT_W = vbW - PAD.l - PAD.r;
  const PLOT_H = vbH - PAD.t - PAD.b;
  const { h0, h1 } = view;
  const span = h1 - h0 || 1;
  const { min: kwMin, max: kwMax, step: kwStep } = kwBounds(points);
  const kwSpan = kwMax - kwMin || 1;

  const X = (ts: number) => PAD.l + ((hourOfDay(ts) - h0) / span) * PLOT_W;
  const Ykw = (kw: number) => PAD.t + PLOT_H - ((kw - kwMin) / kwSpan) * PLOT_H;
  const Ypct = (pct: number) => PAD.t + PLOT_H - (Math.max(0, Math.min(100, pct)) / 100) * PLOT_H;

  const lineKw = (sel: (p: PowerPoint) => number) =>
    points.map((p) => `${round1(X(p.ts))},${round1(Ykw(sel(p) / 1000))}`).join(" ");
  const lineSoc = points.map((p) => `${round1(X(p.ts))},${round1(Ypct(p.soc))}`).join(" ");
  const baseY = Ykw(Math.max(kwMin, 0));
  const areaKw = (sel: (p: PowerPoint) => number) => {
    if (!points.length) return "";
    const x0 = round1(X(points[0].ts)), xN = round1(X(points[points.length - 1].ts));
    const top = points.map((p) => `${round1(X(p.ts))},${round1(Ykw(sel(p) / 1000))}`).join(" L ");
    return `M ${x0},${round1(baseY)} L ${top} L ${xN},${round1(baseY)} Z`;
  };

  const kwTicks: number[] = [];
  for (let v = kwMin; v <= kwMax + 1e-9; v += kwStep) kwTicks.push(round1(v));
  const xTicks: number[] = [];
  const stepH = niceStep(span, 5);
  for (let h = Math.ceil(h0 / stepH) * stepH; h <= h1 + 1e-9; h += stepH) xTicks.push(round1(h));

  // pointer → hour-of-day, via the overlay rect's real screen box (robust to scale)
  const fracFromX = (clientX: number) => {
    const el = overlayRef.current; if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / (r.width || 1)));
  };
  const hourFromX = (clientX: number) => h0 + fracFromX(clientX) * span;

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length >= 2 && setView) {
      pinch.current = { hA: hourFromX(e.touches[0].clientX), hB: hourFromX(e.touches[1].clientX) };
    } else if (e.touches.length === 1) {
      pinch.current = null;
      setCursorHour(hourFromX(e.touches[0].clientX));
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length >= 2 && setView && pinch.current) {
      const fA = fracFromX(e.touches[0].clientX), fB = fracFromX(e.touches[1].clientX);
      if (Math.abs(fA - fB) < 0.04) return; // fingers too close → ignore
      let spanN = (pinch.current.hA - pinch.current.hB) / (fA - fB);
      spanN = Math.max(MIN_SPAN, Math.min(24, spanN));
      let h0n = pinch.current.hA - fA * spanN;
      h0n = Math.max(0, Math.min(24 - spanN, h0n));
      setView({ h0: h0n, h1: h0n + spanN });
    } else if (e.touches.length === 1 && !pinch.current) {
      setCursorHour(hourFromX(e.touches[0].clientX));
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => { if (e.touches.length < 2) pinch.current = null; };

  const active = points[activeIdx];
  const cx = active ? X(active.ts) : 0;
  const showCursor = cursorOn && !!active && cx >= PAD.l - 0.5 && cx <= PAD.l + PLOT_W + 0.5;
  const clipId = `plot-${big ? "lg" : "sm"}`;

  return (
    <svg
      className="w-full select-none"
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="กราฟพลังงาน"
      style={{ touchAction: "none" }}
      onMouseMove={(e) => setCursorHour(hourFromX(e.clientX))}
      onMouseLeave={() => setCursorHour(null)}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD.l} y={PAD.t - 2} width={PLOT_W} height={PLOT_H + 4} />
        </clipPath>
      </defs>

      {/* gridlines + left (kW) axis */}
      {kwTicks.map((v, i) => {
        const y = Ykw(v);
        return (
          <g key={`g${i}`}>
            <line x1={PAD.l} y1={round1(y)} x2={vbW - PAD.r} y2={round1(y)} stroke={GRIDLINE} strokeWidth={1} />
            <text x={PAD.l - 5} y={round1(y) + 3.5} textAnchor="end" fontSize={11} fill={AXIS} className="tabnum">{v}</text>
          </g>
        );
      })}
      {/* right (%) axis */}
      {[0, 50, 100].map((p) => (
        <text key={`p${p}`} x={vbW - PAD.r + 5} y={round1(Ypct(p)) + 3.5} textAnchor="start" fontSize={11} fill={AXIS} className="tabnum">{p}</text>
      ))}
      <text x={PAD.l - 5} y={PAD.t - 6} textAnchor="start" fontSize={11} fill={AXIS}>kW</text>
      <text x={vbW - PAD.r + 5} y={PAD.t - 6} textAnchor="end" fontSize={11} fill={AXIS}>%</text>

      {/* x-axis time ticks */}
      {xTicks.map((h, i) => (
        <text key={`x${i}`} x={round1(PAD.l + ((h - h0) / span) * PLOT_W)} y={vbH - 8} textAnchor="middle" fontSize={11} fill={AXIS} className="tabnum">{hourLabel(h)}</text>
      ))}

      {/* series (clipped to the plot so zoom/pan can't bleed past the axes) */}
      <g clipPath={`url(#${clipId})`}>
        <path d={areaKw((p) => p.gen_power)} fill={C_GEN} fillOpacity={0.12} />
        <path d={areaKw((p) => p.use_power)} fill={C_USE} fillOpacity={0.1} />
        <polyline points={lineKw((p) => p.grid_power)} fill="none" stroke={C_GRID} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={lineKw((p) => p.batt_power)} fill="none" stroke={C_BATT} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={lineKw((p) => p.use_power)} fill="none" stroke={C_USE} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={lineKw((p) => p.gen_power)} fill="none" stroke={C_GEN} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={lineSoc} fill="none" stroke={C_SOC} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 4" />
      </g>

      {/* crosshair + dots at the scrubbed moment */}
      {showCursor && (
        <g>
          <line x1={round1(cx)} y1={PAD.t} x2={round1(cx)} y2={PAD.t + PLOT_H} stroke="#11111155" strokeWidth={1} strokeDasharray="3 3" />
          {[
            { y: Ykw(active.gen_power / 1000), c: C_GEN },
            { y: Ykw(active.use_power / 1000), c: C_USE },
            { y: Ykw(active.grid_power / 1000), c: C_GRID },
            { y: Ykw(active.batt_power / 1000), c: C_BATT },
            { y: Ypct(active.soc), c: C_SOC },
          ].map((d, i) => (
            <circle key={i} cx={round1(cx)} cy={round1(d.y)} r={3} fill="#fff" stroke={d.c} strokeWidth={2} />
          ))}
          <g transform={`translate(${round1(Math.max(PAD.l + 16, Math.min(vbW - PAD.r - 16, cx)))}, ${vbH - 4})`}>
            <rect x={-19} y={-15} width={38} height={14} rx={3} fill="#111111" />
            <text x={0} y={-4.5} textAnchor="middle" fontSize={10} fill="#fff" className="tabnum">{fmtClock(active.ts)}</text>
          </g>
        </g>
      )}

      {/* transparent hit area over the plot — drives all pointer math */}
      <rect ref={overlayRef} x={PAD.l} y={PAD.t} width={PLOT_W} height={PLOT_H} fill="transparent" />
    </svg>
  );
}

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" />
  </svg>
);

function Legend({ p }: { p: PowerPoint }) {
  const rows = [
    { c: C_GEN, label: "ผลิต", value: `${(p.gen_power / 1000).toFixed(2)} kW` },
    { c: C_USE, label: "ใช้", value: `${(p.use_power / 1000).toFixed(2)} kW` },
    { c: C_GRID, label: "กริด", value: `${(p.grid_power / 1000).toFixed(2)} kW` },
    { c: C_BATT, label: "แบต", value: `${(p.batt_power / 1000).toFixed(2)} kW` },
    { c: C_SOC, label: "แบต %", value: `${Math.round(p.soc)}%` },
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {rows.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.c }} />
          <span className="text-[13px] text-[#808080]">{it.label}</span>
          <span className="text-[14px] font-bold tabnum ml-auto">{it.value}</span>
        </div>
      ))}
    </div>
  );
}

export function PowerProfile({ points }: { points: PowerPoint[] }) {
  const [cursorHour, setCursorHour] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);

  if (!points || points.length === 0) {
    return (
      <div className="metric-plate p-5">
        <h3 className="text-[18px] font-bold">กราฟพลังงาน</h3>
        <div className="h-[180px] flex items-center justify-center text-[#a0a4ac] text-[15px]">ไม่มีข้อมูล</div>
      </div>
    );
  }

  const lastIdx = points.length - 1;
  const idx = cursorHour == null ? lastIdx : nearestIdx(points, cursorHour);
  const active = points[idx];

  return (
    <>
      <div className="metric-plate p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[18px] font-bold">กราฟพลังงาน</h3>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[#a0a4ac]">{cursorHour == null ? "เวลา" : ""} <span className="tabnum">{fmtClock(active.ts)}</span></span>
            <button onClick={() => setZoom(true)} aria-label="ขยายกราฟ" className="w-8 h-8 -mr-1 grid place-items-center rounded-lg text-[#5f626a] active:bg-line transition-colors">
              <ExpandIcon />
            </button>
          </div>
        </div>
        <div className="mb-4"><Legend p={active} /></div>
        <ChartSVG points={points} view={{ h0: 0, h1: 24 }} vbW={360} vbH={210} cursorOn={cursorHour != null} activeIdx={idx} setCursorHour={setCursorHour} />
      </div>

      {zoom && <ChartModal points={points} onClose={() => setZoom(false)} />}
    </>
  );
}

function ChartModal({ points, onClose }: { points: PowerPoint[]; onClose: () => void }) {
  const [cursorHour, setCursorHour] = useState<number | null>(null);
  const [view, setView] = useState<View>({ h0: 0, h1: 24 });

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const lastIdx = points.length - 1;
  const idx = cursorHour == null ? lastIdx : nearestIdx(points, cursorHour);
  const active = points[idx];
  const zoomed = view.h0 > 0.01 || view.h1 < 23.99;

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b0e14ee] backdrop-blur-sm flex flex-col" style={{ animation: "fade .2s ease both" }}>
      <div className="flex items-center justify-between px-4 pt-[calc(12px+env(safe-area-inset-top))] pb-2 text-white">
        <div className="font-bold text-[16px]">กราฟพลังงาน · <span className="tabnum">{fmtClock(active.ts)}</span></div>
        <div className="flex items-center gap-2">
          {zoomed && (
            <button onClick={() => setView({ h0: 0, h1: 24 })} className="h-8 px-3 rounded-full bg-white/15 text-[13px] font-bold active:scale-95 transition-transform">รีเซ็ตซูม</button>
          )}
          <button onClick={onClose} aria-label="ปิด" className="w-9 h-9 grid place-items-center rounded-full bg-white/15 active:scale-95 transition-transform">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </div>

      <div className="px-4 pb-2"><div className="rounded-2xl bg-white/95 p-3"><Legend p={active} /></div></div>

      <div className="flex-1 grid place-items-center px-2 min-h-0">
        <div className="w-full rounded-2xl bg-white p-2">
          <ChartSVG points={points} view={view} setView={setView} vbW={680} vbH={320} cursorOn={cursorHour != null} activeIdx={idx} setCursorHour={setCursorHour} big />
        </div>
      </div>

      <div className="text-center text-white/55 text-[12px] pb-[calc(14px+env(safe-area-inset-bottom))] pt-1">
        ลากนิ้วเพื่อดูค่า · ใช้ 2 นิ้วซูม/เลื่อน · หมุนเครื่องเป็นแนวนอนเพื่อดูเต็มจอ
      </div>
    </div>
  );
}
