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
