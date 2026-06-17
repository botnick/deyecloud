// PowerProfile.tsx — solar inverter "Power Profile" multi-line chart (light theme).
// Pure inline SVG, no chart libraries. React 19 + TypeScript + Tailwind v4.

export interface PowerPoint {
  ts: number; // unix SECONDS
  gen_power: number; // watts
  use_power: number; // watts
  grid_power: number; // watts
  batt_power: number; // watts
  soc: number; // 0..100
}

// --- colors (per spec) ---
const C_GEN = "#18a673"; // ผลิต  (green)
const C_USE = "#f5a623"; // ใช้   (amber)
const C_GRID = "#8b5cf6"; // กริด  (purple)
const C_BATT = "#38bdf8"; // แบต   (sky)
const C_SOC = "#0d4add"; // แบต % (blue)
const AXIS = "#a0a4ac";
const GRIDLINE = "#eeeeee";

// --- chart geometry (viewBox units) ---
const VB_W = 360;
const VB_H = 230;
const PAD = { l: 34, r: 30, t: 18, b: 26 };
const PLOT_W = VB_W - PAD.l - PAD.r;
const PLOT_H = VB_H - PAD.t - PAD.b;

// hour-of-day (0..24) from a unix-seconds timestamp, in local time.
function hourOfDay(ts: number): number {
  const d = new Date(ts * 1000);
  return d.getHours() + d.getMinutes() / 60;
}

function fmtClock(ts: number): string {
  const d = new Date(ts * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// "nice" rounded step so bounds land on tidy numbers.
function niceStep(span: number, target = 4): number {
  if (!isFinite(span) || span <= 0) return 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm >= 5 ? 5 : norm >= 2 ? 2 : 1;
  return nice * mag;
}

// auto kW bounds across the 4 power series (kW), include negatives, round to nice step.
function kwBounds(pts: PowerPoint[]): { min: number; max: number; step: number } {
  let lo = 0;
  let hi = 0;
  for (const p of pts) {
    for (const w of [p.gen_power, p.use_power, p.grid_power, p.batt_power]) {
      const kw = w / 1000;
      if (kw < lo) lo = kw;
      if (kw > hi) hi = kw;
    }
  }
  if (hi - lo < 0.5) hi = lo + 0.5; // guarantee a visible span
  const step = niceStep(hi - lo, 4);
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  return { min, max: max === min ? min + step : max, step };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function PowerProfile({ points }: { points: PowerPoint[] }) {
  const cardCls =
    "bg-white rounded-[20px] shadow-[0_8px_24px_rgba(17,17,17,0.06)] p-5";

  if (!points || points.length === 0) {
    return (
      <div className={cardCls}>
        <div className="flex items-center justify-between">
          <h3 className="text-[18px] font-bold">กราฟพลังงาน</h3>
        </div>
        <div className="h-[180px] flex items-center justify-center text-[#a0a4ac] text-[15px]">
          ไม่มีข้อมูล
        </div>
      </div>
    );
  }

  const last = points[points.length - 1];

  // scales
  const { min: kwMin, max: kwMax, step: kwStep } = kwBounds(points);
  const kwSpan = kwMax - kwMin || 1;

  // x: hourOfDay/24 across the plot width.
  const X = (ts: number) => PAD.l + (hourOfDay(ts) / 24) * PLOT_W;
  // y for kW scale (left).
  const Ykw = (kw: number) =>
    PAD.t + PLOT_H - ((kw - kwMin) / kwSpan) * PLOT_H;
  // y for % scale (right), 0..100.
  const Ypct = (pct: number) =>
    PAD.t + PLOT_H - (Math.max(0, Math.min(100, pct)) / 100) * PLOT_H;

  // build a polyline "x,y" string for a value selector on the kW scale.
  const lineKw = (sel: (p: PowerPoint) => number) =>
    points
      .map((p) => `${round1(X(p.ts))},${round1(Ykw(sel(p) / 1000))}`)
      .join(" ");

  const lineSoc = points
    .map((p) => `${round1(X(p.ts))},${round1(Ypct(p.soc))}`)
    .join(" ");

  // soft area under a kW line (down to the baseline = max(kwMin, 0) on the kW scale).
  const baseY = Ykw(Math.max(kwMin, 0));
  const areaKw = (sel: (p: PowerPoint) => number) => {
    if (points.length === 0) return "";
    const x0 = round1(X(points[0].ts));
    const xN = round1(X(points[points.length - 1].ts));
    const top = points
      .map((p) => `${round1(X(p.ts))},${round1(Ykw(sel(p) / 1000))}`)
      .join(" L ");
    return `M ${x0},${round1(baseY)} L ${top} L ${xN},${round1(baseY)} Z`;
  };

  // horizontal gridlines on the kW scale (at each nice step).
  const kwTicks: number[] = [];
  for (let v = kwMin; v <= kwMax + 1e-9; v += kwStep) kwTicks.push(round1(v));

  // x ticks: 00:00, 06:00, 12:00, 18:00, 24:00
  const xTicks = [0, 6, 12, 18, 24];

  const legend: { c: string; label: string; value: string }[] = [
    { c: C_GEN, label: "ผลิต", value: `${(last.gen_power / 1000).toFixed(2)} kW` },
    { c: C_USE, label: "ใช้", value: `${(last.use_power / 1000).toFixed(2)} kW` },
    { c: C_GRID, label: "กริด", value: `${(last.grid_power / 1000).toFixed(2)} kW` },
    { c: C_BATT, label: "แบต", value: `${(last.batt_power / 1000).toFixed(2)} kW` },
    { c: C_SOC, label: "แบต %", value: `${Math.round(last.soc)}%` },
  ];

  return (
    <div className={cardCls}>
      {/* header */}
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-[18px] font-bold">กราฟพลังงาน</h3>
        <span className="text-[13px] text-[#a0a4ac]">
          เวลา <span className="tabnum">{fmtClock(last.ts)}</span>
        </span>
      </div>

      {/* legend: 2 columns, 5 items */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mb-4">
        {legend.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: it.c }}
            />
            <span className="text-[13px] text-[#808080]">{it.label}</span>
            <span className="text-[14px] font-bold tabnum ml-auto">
              {it.value}
            </span>
          </div>
        ))}
      </div>

      {/* chart */}
      <svg
        className="w-full"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Power profile chart"
      >
        {/* horizontal gridlines + left (kW) axis labels */}
        {kwTicks.map((v, i) => {
          const y = Ykw(v);
          return (
            <g key={`g${i}`}>
              <line
                x1={PAD.l}
                y1={round1(y)}
                x2={VB_W - PAD.r}
                y2={round1(y)}
                stroke={GRIDLINE}
                strokeWidth={1}
              />
              <text
                x={PAD.l - 5}
                y={round1(y) + 3.5}
                textAnchor="end"
                fontSize={11}
                fill={AXIS}
                className="tabnum"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* right (%) axis labels: 0, 50, 100 */}
        {[0, 50, 100].map((p) => (
          <text
            key={`p${p}`}
            x={VB_W - PAD.r + 5}
            y={round1(Ypct(p)) + 3.5}
            textAnchor="start"
            fontSize={11}
            fill={AXIS}
            className="tabnum"
          >
            {p}
          </text>
        ))}

        {/* axis unit labels */}
        <text x={PAD.l - 5} y={PAD.t - 6} textAnchor="start" fontSize={11} fill={AXIS}>
          kW
        </text>
        <text
          x={VB_W - PAD.r + 5}
          y={PAD.t - 6}
          textAnchor="end"
          fontSize={11}
          fill={AXIS}
        >
          %
        </text>

        {/* x-axis time ticks */}
        {xTicks.map((h) => {
          const x = PAD.l + (h / 24) * PLOT_W;
          return (
            <text
              key={`x${h}`}
              x={round1(x)}
              y={VB_H - 8}
              textAnchor={h === 0 ? "start" : h === 24 ? "end" : "middle"}
              fontSize={11}
              fill={AXIS}
              className="tabnum"
            >
              {String(h).padStart(2, "0")}:00
            </text>
          );
        })}

        {/* soft area fills (under gen + use) */}
        <path d={areaKw((p) => p.gen_power)} fill={C_GEN} fillOpacity={0.12} />
        <path d={areaKw((p) => p.use_power)} fill={C_USE} fillOpacity={0.1} />

        {/* power polylines (kW scale) */}
        <polyline
          points={lineKw((p) => p.grid_power)}
          fill="none"
          stroke={C_GRID}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={lineKw((p) => p.batt_power)}
          fill="none"
          stroke={C_BATT}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={lineKw((p) => p.use_power)}
          fill="none"
          stroke={C_USE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <polyline
          points={lineKw((p) => p.gen_power)}
          fill="none"
          stroke={C_GEN}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* SOC polyline (% scale) */}
        <polyline
          points={lineSoc}
          fill="none"
          stroke={C_SOC}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
