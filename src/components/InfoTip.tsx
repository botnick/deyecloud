import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A small (i) button that pops a short explanation on tap — the mobile-friendly
// take on a hover tooltip. The bubble renders in a portal at fixed coords so it's
// never clipped by a card's overflow, and a full-screen catcher closes it on any
// outside tap. Keep `text` short and plain.
export function InfoTip({ text, label = "ข้อมูล", className = "" }: { text: ReactNode; label?: string; className?: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pos) { setPos(null); return; }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom });
  };
  const W = 244;
  return (
    <>
      <button onClick={toggle} aria-label={label}
        className={`w-[18px] h-[18px] shrink-0 rounded-full grid place-items-center text-[11px] font-bold leading-none text-muted bg-canvas border border-line active:scale-90 transition-transform ${className}`}>
        i
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setPos(null)} />
          <div
            className="fixed z-[61] rounded-2xl bg-title text-white text-[12.5px] leading-snug px-3.5 py-2.5 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.45)]"
            style={{ width: W, top: pos.y + 8, left: Math.max(10, Math.min(pos.x - W / 2, (typeof window !== "undefined" ? window.innerWidth : 400) - W - 10)) }}
            onClick={() => setPos(null)}
          >
            {text}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
