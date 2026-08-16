import { useEffect, useRef, useState } from "react";

// Smoothly tweens from the currently shown value to the new one (ease-out cubic).
// Keeps the UI feeling alive without flicker on refresh. Starts each tween from
// the live displayed value (no backward jump on rapid updates) and respects
// the user's reduced-motion preference.
const REDUCED = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const b = Number(value) || 0;
  const [disp, setDisp] = useState(b);
  const dispRef = useRef(b);
  const raf = useRef(0);

  useEffect(() => {
    const a = dispRef.current;
    if (REDUCED || a === b) { dispRef.current = b; setDisp(b); return; }
    const t0 = performance.now();
    const dur = 650;
    cancelAnimationFrame(raf.current);
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = a + (b - a) * (1 - Math.pow(1 - k, 3));
      dispRef.current = v;
      setDisp(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
      else dispRef.current = b;
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [b]);

  return <span className="tabnum">{format(disp)}</span>;
}
