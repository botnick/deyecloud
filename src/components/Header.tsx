import { greeting } from "../lib/format";
import { IconRefresh } from "../lib/icons";
import { haptic } from "../lib/haptics";

export function Header({ stationName, onRefresh, spinning }: { stationName?: string; onRefresh: () => void; spinning: boolean }) {
  return (
    <header className="glass-bar sticky top-0 z-20 flex items-center justify-between px-[18px] pt-[calc(20px+env(safe-area-inset-top))] pb-4">
      <div className="min-w-0">
        <div className="text-[26px] font-bold leading-tight tracking-tight text-title">{greeting()}</div>
        <div className="text-[16px] text-body mt-0.5 truncate">{stationName || "ระบบโซลาร์"}</div>
      </div>
      <button
        onClick={() => { haptic(); onRefresh(); }}
        aria-label="รีเฟรช"
        className="w-14 h-14 rounded-[20px] bg-use-soft grid place-items-center text-secondary active:scale-95 shrink-0 ml-3"
      >
        <IconRefresh className={`w-6 h-6 ${spinning ? "animate-spin" : ""}`} />
      </button>
    </header>
  );
}
