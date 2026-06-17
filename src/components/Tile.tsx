import type { ReactNode } from "react";
import { cardP } from "../lib/ui";
import { AnimatedNumber } from "./AnimatedNumber";

type Tone = "pv" | "use" | "batt" | "grid";
const TONE: Record<Tone, { chip: string; val: string }> = {
  pv: { chip: "bg-pv-soft text-pv", val: "text-pv-high" },
  use: { chip: "bg-use-soft text-use", val: "text-use" },
  batt: { chip: "bg-batt-soft text-batt", val: "text-batt" },
  grid: { chip: "bg-grid-soft text-grid", val: "text-grid" },
};

export function Tile({
  tone, icon, label, value, format, unit, note, children,
}: {
  tone: Tone; icon: ReactNode; label: string; value: number;
  format: (n: number) => string; unit?: string; note?: string; children?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={`${cardP} active:scale-[.98] transition-transform`}>
      <div className="flex items-center gap-2 text-[15px] font-semibold text-body">
        <span className={`grid place-items-center w-9 h-9 rounded-xl ${t.chip}`}>
          <span className="w-5 h-5 block">{icon}</span>
        </span>
        {label}
      </div>
      <div className={`mt-2.5 text-[34px] font-extrabold leading-none ${t.val}`}>
        <AnimatedNumber value={value} format={format} />
        {unit && <span className="text-[15px] font-semibold text-muted ml-1">{unit}</span>}
      </div>
      {children}
      {note && <div className="text-[14px] text-body mt-1">{note}</div>}
    </div>
  );
}
