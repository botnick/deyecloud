import type { Latest } from "../lib/api";
import { analyze } from "../lib/analysis";
import { cardP } from "../lib/ui";

const DOT: Record<string, string> = { ok: "bg-batt", info: "bg-grid", warn: "bg-warn" };

const BulbIcon = (p: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.className}>
    <path d="M9 18h6M10 21.5h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.85.95.95 1.6l.15.6h5l.15-.6c.1-.65.45-1.2.95-1.6A6 6 0 0 0 12 3Z" />
  </svg>
);

export function AnalysisCard({ latest, capacity }: { latest: Latest; capacity?: number }) {
  const items = analyze(latest, capacity);
  const tip = items[0]?.tone === "tip" ? items[0] : null;
  const rows = tip ? items.slice(1) : items;
  return (
    <div className="space-y-3">
      {/* คำแนะนำ — the smart, plain-language advice for right now */}
      {tip && (
        <div className="rounded-[22px] p-4 flex gap-3 items-start bg-primary-soft border border-primary/30 shadow-[0_8px_22px_-14px_rgba(179,143,0,0.55)]">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-primary/25 text-primary-high shrink-0">
            <BulbIcon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[13px] tracking-wide text-primary-high">{tip.title}</div>
            <div className="text-[14.5px] text-title leading-snug mt-0.5">{tip.detail}</div>
          </div>
        </div>
      )}
      <div className={`${cardP} space-y-4`}>
        {rows.map((it, i) => (
          <div key={i} className="flex gap-3">
            <span className={`w-2.5 h-2.5 rounded-full mt-[7px] shrink-0 ${DOT[it.tone]}`} />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[15px] leading-snug">{it.title}</div>
              <div className="text-body text-[14px] leading-snug">{it.detail}</div>
              {it.sub && (
                <ul className="mt-1.5 grid gap-1">
                  {it.sub.map((s, j) => (
                    <li key={j} className="text-[13px] text-muted flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-line shrink-0" />{s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
