import type { ReactNode } from "react";
import { cardP } from "../lib/ui";

// One metric's card in the History/Data tab — mirrors the official Deye app's
// per-section layout (icon + title + one headline value + short legend + a
// compact chart), kept in our glass design. Deliberately low-clutter for the
// elderly users this app targets.
export function MetricSection({
  icon, title, accent, soft, value, unit, sub, caption, legend, children,
}: {
  icon: ReactNode;
  title: string;
  accent: string;            // metric color (css var)
  soft: string;              // soft tint for the icon badge (css var)
  value?: string;
  unit?: string;
  sub?: ReactNode;
  caption?: ReactNode;       // one plain-language line: what the chart actually means
  legend?: [string, string][];
  children: ReactNode;
}) {
  return (
    <section className={`${cardP} mt-3`}>
      <div className="flex items-center gap-2.5">
        <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: soft }}>
          <span className="grid place-items-center" style={{ color: accent }}>{icon}</span>
        </span>
        <div className="font-bold text-[17px] text-title leading-tight">{title}</div>
        <div className="ml-auto text-right shrink-0">
          {value != null && (
            <div className="text-[19px] font-extrabold tabnum leading-none" style={{ color: accent }}>
              {value}{unit && <span className="text-[12px] text-body font-semibold ml-1">{unit}</span>}
            </div>
          )}
          {sub && <div className="text-[11.5px] text-muted mt-1">{sub}</div>}
        </div>
      </div>

      {/* plain-language takeaway — so the chart isn't "just a graph" */}
      {caption && <div className="text-[13.5px] text-body mt-2 leading-snug">{caption}</div>}

      {legend && legend.length > 0 && (
        <div className="flex gap-4 mt-2.5 flex-wrap">
          {legend.map(([n, c]) => (
            <div key={n} className="flex items-center gap-1.5 text-[13px] text-body">
              <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: c }} />{n}
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5">{children}</div>
    </section>
  );
}
