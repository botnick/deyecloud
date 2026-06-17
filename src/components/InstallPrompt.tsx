import { useEffect, useState } from "react";
import { APP_NAME } from "../lib/brand";

const KEY = "deye_a2hs_snooze";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // re-nudge after 14 days, never nag
const SHOW_DELAY = 2600; // let the page settle before nudging

const ua = () => navigator.userAgent || "";
const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
// iPadOS 13+ reports as "Macintosh" — fingerprint it via touch so iPads aren't missed.
const isIPad = () =>
  /ipad/i.test(ua()) || ((navigator.platform === "MacIntel" || /Mac/.test(navigator.platform)) && navigator.maxTouchPoints > 1);
const isIOS = () => /iphone|ipod/i.test(ua()) || isIPad();
const isMacSafari = () =>
  /Mac/.test(navigator.platform) && !isIPad() && /safari/i.test(ua()) && !/chrome|chromium|crios|edg|fxios|android/i.test(ua());
const isFirefox = () => /firefox|fxios/i.test(ua());
const isMobile = () => /android|iphone|ipad|ipod|mobile/i.test(ua()) || navigator.maxTouchPoints > 1;

// One adaptive copy per platform. `step` = manual instruction (no one-tap button).
type Mode =
  | { kind: "button" } // Chrome/Edge/Android — beforeinstallprompt one-tap
  | { kind: "ios" } // iPhone/iPad Safari — Share ▸ Add to Home Screen
  | { kind: "macos" } // macOS Safari 17+ — Share ▸ Add to Dock
  | { kind: "generic" }; // Firefox/others — open menu ▸ Install

// iOS/macOS Safari share glyph (square + up arrow) — line icon, no emoji
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 -mt-0.5 align-middle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5" /><path d="M6 12.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6.5" />
  </svg>
);
// 3-dot browser-menu glyph (for the generic / Firefox hint)
const MenuIcon = () => (
  <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 -mt-0.5 align-middle" fill="currentColor">
    <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
  </svg>
);

/** Adaptive "Add to Home Screen / Install" nudge. One small glass bar above the
 *  nav that speaks each platform's language:
 *   • Chrome/Edge/Android → one-tap install (beforeinstallprompt)
 *   • iPhone + iPad Safari → Share ▸ เพิ่มไปยังหน้าจอโฮม
 *   • macOS Safari        → Share ▸ เพิ่มลง Dock
 *   • Firefox / others     → เปิดเมนู ▸ ติดตั้ง
 *  Never shows when already installed; dismiss snoozes 14 days (not forever). */
export function InstallPrompt() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    if (standalone()) return;
    try {
      const ts = Number(localStorage.getItem(KEY) || 0);
      if (ts && Date.now() - ts < SNOOZE_MS) return;
    } catch {}

    // beforeinstallprompt is the gold signal (Chrome/Edge desktop+mobile, Android).
    // It can fire late, so always honour it — even after a manual hint is showing.
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e); setMode({ kind: "button" }); };
    const onInstalled = () => { setMode(null); snooze(); };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);

    // After a beat, if no one-tap prompt arrived, fall back to a manual hint
    // tailored to the platform (Safari/Firefox never fire beforeinstallprompt).
    const t = setTimeout(() => {
      setMode((cur) => {
        if (cur) return cur; // button already won
        if (isIOS()) return { kind: "ios" };
        if (isMacSafari()) return { kind: "macos" };
        return { kind: "generic" }; // Firefox + anything else installable via menu
      });
    }, SHOW_DELAY);

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const snooze = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} };
  const close = () => { setMode(null); snooze(); };
  const install = async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch {} }
    close();
  };

  if (!mode) return null;

  const desktop = !isMobile();
  const title =
    mode.kind === "macos" || (mode.kind === "button" && desktop) || (mode.kind === "generic" && desktop)
      ? `ติดตั้ง ${APP_NAME} เป็นแอป`
      : `เพิ่ม ${APP_NAME} ลงหน้าจอโฮม`;

  let sub: React.ReactNode;
  if (mode.kind === "button") sub = "เปิดเหมือนแอป · เปิดเร็ว · ใช้แบบออฟไลน์ได้";
  else if (mode.kind === "ios") sub = (<>กดปุ่ม <ShareIcon /> ด้านล่าง แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”</>);
  else if (mode.kind === "macos") sub = (<>กดปุ่ม <ShareIcon /> บนแถบเครื่องมือ แล้วเลือก “Add to Dock”</>);
  else sub = (<>เปิดเมนู <MenuIcon /> ของเบราว์เซอร์ แล้วเลือก “ติดตั้ง” / “เพิ่มลงหน้าจอหลัก”</>);

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(94px+env(safe-area-inset-bottom))] z-40 w-[calc(100%-28px)] max-w-[452px]">
      <div className="flex items-center gap-3 rounded-2xl bg-[#fffffff5] border border-white/70 shadow-[0_16px_44px_-12px_rgba(17,17,17,0.4)] p-3" style={{ animation: "sheetup .32s cubic-bezier(.22,1,.36,1) both" }}>
        <img src="/apple-touch-icon.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-title leading-tight">{title}</div>
          <div className="text-[12px] text-body mt-0.5 leading-snug">{sub}</div>
        </div>
        {mode.kind === "button" && (
          <button onClick={install} className="shrink-0 h-9 px-3.5 rounded-xl bg-primary text-ink text-[14px] font-bold active:scale-95 transition-transform">เพิ่มเลย</button>
        )}
        <button onClick={close} aria-label="ปิด" className="shrink-0 w-8 h-8 grid place-items-center text-muted rounded-full active:bg-line">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
