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

/* Floating liquid-glass tab bar (iOS 26). Labels stay at 12px for older eyes. */
export function BottomNav({ view, onGo }: { view: View; onGo: (v: View) => void }) {
  return (
    <nav className="ios-tabs" aria-label="เมนูหลัก">
      {items.map((it) => {
        const active = view === it.k;
        return (
          <button key={it.k} className={active ? "on" : ""} onClick={() => { haptic(); onGo(it.k); }} aria-label={it.label} aria-current={active ? "page" : undefined}>
            <it.Icon className="w-[25px] h-[25px]" />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}
