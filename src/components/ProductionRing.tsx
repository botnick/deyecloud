import { useEffect, useState } from "react";

// Clean radial gauge: arc fills to `pct`, big value centred. Arc sweeps in on mount.
export function ProductionRing({ pct, center, unit }: { pct: number; center: string; unit: string }) {
  const r = 52;
  const C = 2 * Math.PI * r;
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const target = Math.max(0, Math.min(100, pct || 0));
  const off = C * (1 - (on ? target : 0) / 100);

  return (
    <svg viewBox="0 0 120 120" className="w-full h-full">
      <defs>
        <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd84d" />
          <stop offset="1" stopColor="#ff9500" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={r} fill="none" stroke="#eef0f4" strokeWidth="11" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke="url(#ring-g)" strokeWidth="11" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dashoffset 1.15s cubic-bezier(.22,1,.36,1)" }}
      />
      <text x="60" y="57" textAnchor="middle" fontSize="28" fontWeight="800" fill="#111111" className="tabnum">{center}</text>
      <text x="60" y="76" textAnchor="middle" fontSize="11.5" fill="#808080">{unit}</text>
    </svg>
  );
}
