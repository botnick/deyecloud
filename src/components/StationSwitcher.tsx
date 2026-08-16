import type { Station } from "../lib/api";
import { IconCheck } from "../lib/icons";
import { haptic } from "../lib/haptics";

/* Bottom-sheet picker for accounts with more than one station. Big, clear rows
   (name + system size), the current one marked — elderly-first and obvious. */
function HouseGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-5h4v5" />
    </svg>
  );
}

export function StationSwitcher({ stations, selectedId, onSelect, onClose }: {
  stations: Station[]; selectedId: number | null; onSelect: (id: number) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="เลือกสถานี">
      <button aria-label="ปิด" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative bg-canvas rounded-t-[28px] px-4 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] shadow-[0_-14px_44px_rgba(17,17,17,0.20)]"
        style={{ animation: "sheetup .32s cubic-bezier(.22,1,.36,1) both" }}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <h2 className="text-[20px] font-bold text-title px-2 mb-3">เลือกสถานี</h2>
        <div className="flex flex-col gap-2 max-h-[58vh] overflow-y-auto no-scrollbar">
          {stations.map((s) => {
            const active = s.id === selectedId;
            return (
              <button
                key={s.id}
                onClick={() => { haptic(); onSelect(s.id); }}
                aria-current={active ? "true" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-4 py-4 text-left transition-colors ${active ? "bg-secondary-soft" : "bg-white active:bg-line"}`}
              >
                <span className={`grid place-items-center w-11 h-11 rounded-full shrink-0 ${active ? "bg-secondary text-white" : "bg-canvas text-secondary"}`}>
                  <HouseGlyph />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-bold text-title truncate">{s.name || `สถานี ${s.id}`}</div>
                  <div className="text-[14px] text-body">{s.capacity ? `ขนาดระบบ ${s.capacity} kW` : `รหัส ${s.id}`}</div>
                </div>
                {active && <IconCheck className="w-6 h-6 text-secondary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
