type Series = { color: string; data: number[] };

const BOX = { W: 340, H: 220, l: 40, r: 12, t: 12, b: 28 };

function gridLines(max: number, fmt: (v: number) => string) {
  const ih = BOX.H - BOX.t - BOX.b;
  return [0, 0.5, 1].map((f, i) => {
    const y = BOX.t + ih - f * ih;
    return (
      <g key={i}>
        <line x1={BOX.l} y1={y} x2={BOX.W - BOX.r} y2={y} stroke="var(--color-line)" />
        <text x={BOX.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">{fmt(max * f)}</text>
      </g>
    );
  });
}

export function BarChart({ labels, series }: { labels: string[]; series: Series[] }) {
  const iw = BOX.W - BOX.l - BOX.r, ih = BOX.H - BOX.t - BOX.b;
  const max = Math.max(0.5, ...series.flatMap((s) => s.data));
  const n = labels.length, gw = iw / n, bw = Math.min(14, (gw - 6) / series.length);
  const Y = (v: number) => BOX.t + ih - (v / max) * ih;
  const step = Math.ceil(n / 8);
  return (
    <svg viewBox={`0 0 ${BOX.W} ${BOX.H}`} className="w-full h-[240px]" preserveAspectRatio="xMidYMid meet">
      {gridLines(max, (v) => String(Math.round(v)))}
      {labels.map((_, i) => {
        const cx = BOX.l + gw * i + gw / 2;
        return series.map((sr, j) => {
          const v = sr.data[i] || 0;
          const x = cx - (series.length * bw) / 2 + j * bw;
          return <rect key={`${i}-${j}`} x={x.toFixed(1)} y={Y(v).toFixed(1)} width={(bw - 2).toFixed(1)} height={(BOX.t + ih - Y(v)).toFixed(1)} rx="3" fill={sr.color} />;
        });
      })}
      {labels.map((lab, i) => (i % step === 0 ?
        <text key={i} x={BOX.l + gw * i + gw / 2} y={BOX.H - 8} textAnchor="middle" fontSize="11" fill="var(--color-muted)">{lab}</text> : null))}
    </svg>
  );
}

// Compact single-metric line — one section's worth of the day profile.
// Handles negative values (zero baseline) and an optional secondary series on a
// fixed 0..secMax right axis (used for battery SOC %). Optional time labels
// (xLabels) and a peak marker (markPeak) make the curve readable at a glance —
// the SVG stretches (preserveAspectRatio="none") so the dot + labels are HTML
// overlays positioned by % to stay perfectly round and unstretched.
export function LineMini({
  values, color, area = true, secondary, xLabels, markPeak, unit,
}: {
  values: number[];
  color: string;
  area?: boolean;
  secondary?: { values: number[]; color: string; max: number };
  xLabels?: string[];
  markPeak?: boolean;
  unit?: string; // shown atop the y-axis gutter (e.g. "kW")
}) {
  const W = 340, H = 132, l = 8, t = 10, b = 16;
  const r = secondary ? 30 : 8;
  const iw = W - l - r, ih = H - t - b;
  const vals = values.length ? values : [0];
  const max = Math.max(0.001, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const X = (i: number) => l + (i / (vals.length - 1 || 1)) * iw;
  const Y = (v: number) => t + ih - ((v - min) / span) * ih;
  const line = vals.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const zeroY = Y(0);
  const areaPath = `${line} L${X(vals.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L${X(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;
  const sec = secondary;
  const SY = (v: number) => t + ih - (Math.max(0, Math.min(sec!.max, v)) / sec!.max) * ih;
  const secLine = sec ? sec.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${SY(v).toFixed(1)}`).join(" ") : "";
  const uid = color.replace(/[^a-z0-9]/gi, "");
  // peak of the primary series → an HTML dot at its (x,y), positioned in % of the box
  const pIdx = markPeak ? vals.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0) : -1;
  // Reference ticks (with kW values) so the curve isn't a scale-less shape — the
  // gridlines live in the SVG (horizontal lines stretch fine); the value labels are
  // HTML in a left gutter so they stay crisp under the non-uniform scale.
  const ticks = (min < 0 ? [max, 0, min] : [max, max / 2, 0]).filter((v, i, a) => a.indexOf(v) === i);
  const ft = (v: number) => (Math.abs(v) >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  return (
    <div>
      <div className="flex">
        {/* y-axis value labels */}
        <div className="relative w-7 shrink-0 h-[120px]">
          {unit && <span className="absolute -top-0.5 right-1 text-[9px] leading-none font-semibold text-muted/80">{unit}</span>}
          {ticks.map((v, i) => (
            <span key={i} className="absolute right-1 -translate-y-1/2 text-[9px] leading-none text-muted tabnum" style={{ top: `${(Y(v) / H) * 100}%` }}>{ft(v)}</span>
          ))}
        </div>
        <div className="relative flex-1 h-[120px]">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={`g${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* horizontal gridlines (zero emphasized) */}
            {ticks.map((v, i) => (
              <line key={i} x1={l} y1={Y(v)} x2={W - r} y2={Y(v)} stroke="var(--color-line)"
                strokeWidth={Math.abs(v) < 1e-9 ? 1.4 : 1} opacity={Math.abs(v) < 1e-9 ? 0.9 : 0.45} vectorEffect="non-scaling-stroke" />
            ))}
            {area && <path d={areaPath} fill={`url(#g${uid})`} />}
            <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {sec && <path d={secLine} fill="none" stroke={sec.color} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </svg>
          {pIdx >= 0 && vals[pIdx] > 0.001 && (
            <span className="absolute w-2.5 h-2.5 rounded-full ring-2 ring-white shadow"
              style={{ background: color, left: `${(X(pIdx) / W) * 100}%`, top: `${(Y(vals[pIdx]) / H) * 100}%`, transform: "translate(-50%,-50%)" }} />
          )}
        </div>
      </div>
      {xLabels && xLabels.length > 0 && (
        <div className="flex justify-between mt-1 pl-7 pr-1 text-[10px] text-muted tabnum">
          {xLabels.map((lab, i) => <span key={i}>{lab}</span>)}
        </div>
      )}
    </div>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="flex gap-5 justify-center mt-2 flex-wrap">
      {items.map(([n, c]) => (
        <div key={n} className="flex items-center gap-2 text-[15px] text-body">
          <span className="w-3.5 h-3.5 rounded-[5px]" style={{ background: c }} />{n}
        </div>
      ))}
    </div>
  );
}
