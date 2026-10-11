import { useEffect, useState } from "react";
import { greeting } from "../lib/format";
import { IconRefresh, IconChevron } from "../lib/icons";
import { haptic } from "../lib/haptics";
import { StationSwitcher } from "./StationSwitcher";
import type { Station } from "../lib/api";

/* iOS-style navigation: a large title in the page flow, and a compact glass bar with the
   same title that fades in once the large one scrolls away. The refresh button lives in the
   bar so it is always reachable. */
export function Header({ title, stationName, stations, selectedId, onSwitch, onRefresh, spinning, cooldown = 0 }: {
  title: string; stationName?: string; stations?: Station[]; selectedId?: number | null; onSwitch?: (id: number) => void; onRefresh: () => void; spinning: boolean; cooldown?: number;
}) {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const on = () => setCompact(window.scrollY > 46);
    on(); window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const multi = !!(stations && stations.length > 1);
  const cooling = cooldown > 0;
  const station = stationName || "ระบบโซลาร์";
  return (
    <>
      <div className={`ios-bar ${compact ? "on" : ""}`}>
        <div className="inner">
          <div className="bg" />
          <div className="title" aria-hidden="true">{title}</div>
          <button
            onClick={() => { if (cooling) return; haptic(); onRefresh(); }}
            disabled={cooling}
            aria-label={cooling ? `รีเฟรชได้ในอีก ${cooldown} วินาที` : "รีเฟรช"}
            className="ios-btn absolute right-3"
            style={{ top: "calc(5px + env(safe-area-inset-top))" }}
          >
            {cooling ? <span className="text-[14px] font-extrabold tabnum">{cooldown}</span> : <IconRefresh className={`w-[19px] h-[19px] ${spinning ? "animate-spin" : ""}`} />}
          </button>
        </div>
      </div>
      <header className="ios-large pr-16">
        {multi ? (
          <button onClick={() => { haptic(); setOpen(true); }} aria-label="เปลี่ยนสถานี" className="cap flex items-center gap-1 max-w-full active:opacity-60 transition-opacity">
            <span className="truncate">{greeting()} · {station}</span><IconChevron className="w-3.5 h-3.5 rotate-90 shrink-0" />
          </button>
        ) : (
          <div className="cap truncate">{greeting()} · {station}</div>
        )}
        <h1 className="big truncate">{title}</h1>
      </header>
      {open && multi && (
        <StationSwitcher stations={stations!} selectedId={selectedId ?? null} onSelect={(id) => { onSwitch?.(id); setOpen(false); }} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
