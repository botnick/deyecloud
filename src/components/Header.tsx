import { useState } from "react";
import { greeting } from "../lib/format";
import { IconRefresh, IconChevron } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { StationSwitcher } from "./StationSwitcher";
import type { Station } from "../lib/api";

export function Header({ stationName, stations, selectedId, onSwitch, onRefresh, spinning, cooldown = 0 }: {
  stationName?: string; stations?: Station[]; selectedId?: number | null; onSwitch?: (id: number) => void; onRefresh: () => void; spinning: boolean; cooldown?: number;
}) {
  const [open, setOpen] = useState(false);
  const multi = !!(stations && stations.length > 1);
  const cooling = cooldown > 0;
  return (
    <header className="bg-[#fffdf6f5] border-b border-black/[0.05] sticky top-0 z-20 flex items-center justify-between px-[18px] pt-[calc(20px+env(safe-area-inset-top))] pb-4">
      <div className="min-w-0">
        <div className="text-[26px] font-bold leading-tight tracking-tight text-title">{greeting()}</div>
        {multi ? (
          <button
            onClick={() => { haptic(); setOpen(true); }}
            aria-label="เปลี่ยนสถานี"
            className="flex items-center gap-1 mt-0.5 max-w-full active:opacity-70 transition-opacity"
          >
            <span className="text-[16px] text-body truncate">{stationName || "ระบบโซลาร์"}</span>
            <IconChevron className="w-4 h-4 text-muted rotate-90 shrink-0" />
          </button>
        ) : (
          <div className="text-[16px] text-body mt-0.5 truncate">{stationName || "ระบบโซลาร์"}</div>
        )}
      </div>
      <button
        onClick={() => { if (cooling) return; haptic(); onRefresh(); }}
        disabled={cooling}
        aria-label={cooling ? `รีเฟรชได้ในอีก ${cooldown} วินาที` : "รีเฟรช"}
        className={`w-14 h-14 rounded-[20px] grid place-items-center shrink-0 ml-3 transition-colors ${cooling ? "bg-line text-muted" : "bg-use-soft text-secondary active:scale-95"}`}
      >
        {cooling
          ? <span className="text-[16px] font-extrabold tabnum">{cooldown}</span>
          : <IconRefresh className={`w-6 h-6 ${spinning ? "animate-spin" : ""}`} />}
      </button>
      {open && multi && (
        <StationSwitcher
          stations={stations!}
          selectedId={selectedId ?? null}
          onSelect={(id) => { onSwitch?.(id); setOpen(false); }}
          onClose={() => setOpen(false)}
        />
      )}
    </header>
  );
}
