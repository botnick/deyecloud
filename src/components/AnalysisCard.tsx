import type { Latest } from "../lib/api";
import { analyze } from "../lib/analysis";
import { cardP } from "../lib/ui";

const DOT: Record<string, string> = { ok: "bg-batt", info: "bg-grid", warn: "bg-warn" };

export function AnalysisCard({ latest, capacity }: { latest: Latest; capacity?: number }) {
  const items = analyze(latest, capacity);
  return (
    <div className={`${cardP} space-y-4`}>
      {items.map((it, i) => (
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
  );
}
