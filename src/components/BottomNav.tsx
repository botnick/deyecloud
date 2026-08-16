import type { ReactNode } from "react";
import { NavHome, NavToday, NavWeather, NavHistory } from "../lib/icons";
import { haptic } from "../lib/haptics";
import type { View } from "../App";

const items: { k: View; label: string; Icon: (p: { className?: string }) => ReactNode }[] = [
  { k: "home", label: "หน้าหลัก", Icon: NavHome },
  { k: "today", label: "วันนี้", Icon: NavToday },
  { k: "weather", label: "อากาศ", Icon: NavWeather },
  { k: "history", label: "ย้อนหลัง", Icon: NavHistory },
];

export function BottomNav({ view, onGo }: { view: View; onGo: (v: View) => void }) {
  return (
    <nav className="bg-[#ffffffec] border border-white/70 shadow-[0_12px_30px_-8px_rgba(17,17,17,0.3)] fixed left-1/2 -translate-x-1/2 bottom-[calc(14px+env(safe-area-inset-bottom))] w-[calc(100%-28px)] max-w-[452px] rounded-[26px] flex p-2 z-30">
      {items.map((it) => {
        const active = view === it.k;
        return (
          <button
            key={it.k}
            onClick={() => { haptic(); onGo(it.k); }}
            aria-label={it.label}
            aria-current={active ? "page" : undefined}
            className={`flex-1 min-h-[62px] rounded-[18px] flex flex-col items-center justify-center gap-1 text-[14px] font-bold transition-all duration-200 ${
              active ? "text-secondary bg-secondary-soft" : "text-muted active:bg-canvas"
            }`}
          >
            <it.Icon className={`transition-transform duration-200 ${active ? "w-[27px] h-[27px] -translate-y-0.5" : "w-[25px] h-[25px]"}`} />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
