import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconRefresh } from "../lib/icons";

const THRESH = 68; // px pull (after damping) to trigger
const MAX = 96;

// Native-style pull-to-refresh. Wraps the scrolling content; pulling down from
// the very top reveals a spinner and fires onRefresh on release.
export function PullToRefresh({ onRefresh, children }: { onRefresh: () => void | Promise<void>; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const cb = useRef(onRefresh);
  useEffect(() => { cb.current = onRefresh; });

  useEffect(() => {
    const set = (v: number) => { pullRef.current = v; setPull(v); };
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e: TouchEvent) => {
      if (busyRef.current || !atTop()) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };
    const onMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || !atTop()) { pulling.current = false; set(0); return; }
      set(Math.min(MAX, dy * 0.5)); // resistance
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = async () => {
      if (!pulling.current) return;
      pulling.current = false;
      if (pullRef.current >= THRESH) {
        busyRef.current = true; setBusy(true); set(52);
        try { await cb.current(); } catch { /* ignore */ }
        setTimeout(() => { busyRef.current = false; setBusy(false); set(0); }, 450);
      } else set(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const progress = Math.min(1, pull / THRESH);
  const snap = pulling.current ? "none" : "transform .32s cubic-bezier(.22,1,.36,1)";

  return (
    <>
      <div
        className="fixed left-1/2 -translate-x-1/2 z-40 pointer-events-none"
        style={{ top: "env(safe-area-inset-top)", transform: `translate(-50%, ${pull - 46}px)`, opacity: pull > 4 ? 1 : 0, transition: pulling.current ? "opacity .15s" : "transform .32s, opacity .25s" }}
      >
        <div className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-md border border-white/60 shadow-[0_4px_16px_rgba(17,17,17,0.18)] grid place-items-center text-secondary">
          <span style={{ display: "block", transform: busy ? undefined : `rotate(${progress * 280}deg)` }}>
            <IconRefresh className={`w-5 h-5 ${busy ? "animate-spin" : ""}`} />
          </span>
        </div>
      </div>
      <div style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: snap }}>
        {children}
      </div>
    </>
  );
}
