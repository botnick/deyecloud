import { useEffect, useState } from "react";
import { APP_NAME } from "../lib/brand";

const KEY = "deye_a2hs_dismissed";
const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

// iOS Safari share glyph (square + up arrow) — line icon, no emoji
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" className="inline-block w-4 h-4 -mt-0.5 align-middle" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5" /><path d="M6 12.5V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6.5" />
  </svg>
);

/** Standard "Add to Home Screen" nudge — Android fires beforeinstallprompt
 *  (one-tap install); iOS shows the Share→Add steps. Shows once, dismissable,
 *  never when already installed. Sits above the nav so it's not in the way. */
export function InstallPrompt() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    if (standalone()) return;
    try { if (localStorage.getItem(KEY)) return; } catch {}
    if (isIOS()) {
      setIos(true);
      const t = setTimeout(() => setShow(true), 2600);
      return () => clearTimeout(t);
    }
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e); setShow(true); };
    const onInstalled = () => { setShow(false); try { localStorage.setItem(KEY, "1"); } catch {} };
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onBip); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  const close = () => { setShow(false); try { localStorage.setItem(KEY, "1"); } catch {} };
  const install = async () => {
    if (deferred) { deferred.prompt(); try { await deferred.userChoice; } catch {} }
    close();
  };

  if (!show) return null;
  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(94px+env(safe-area-inset-bottom))] z-40 w-[calc(100%-28px)] max-w-[452px]">
      <div className="flex items-center gap-3 rounded-2xl bg-[#fffffff5] border border-white/70 shadow-[0_16px_44px_-12px_rgba(17,17,17,0.4)] p-3" style={{ animation: "sheetup .32s cubic-bezier(.22,1,.36,1) both" }}>
        <img src="/apple-touch-icon.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-title leading-tight">เพิ่ม {APP_NAME} ลงหน้าจอโฮม</div>
          <div className="text-[12px] text-body mt-0.5 leading-snug">
            {ios ? <>กดปุ่ม <ShareIcon /> ด้านล่าง แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”</> : "เปิดเหมือนแอป · เปิดเร็ว · ใช้แบบออฟไลน์ได้"}
          </div>
        </div>
        {!ios && (
          <button onClick={install} className="shrink-0 h-9 px-3.5 rounded-xl bg-primary text-ink text-[14px] font-bold active:scale-95 transition-transform">เพิ่มเลย</button>
        )}
        <button onClick={close} aria-label="ปิด" className="shrink-0 w-8 h-8 grid place-items-center text-muted rounded-full active:bg-line">
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </div>
  );
}
