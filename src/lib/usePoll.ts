import { useEffect, useRef } from "react";

/**
 * Smart polling for a "เสมือน realtime" feel without burning the free-tier quota.
 *
 * Fires `fn` on `intervalMs` while the tab is visible, but:
 *   • pauses entirely when the tab is hidden / backgrounded (no wasted upstream hits)
 *   • fires `fn` immediately + resumes the interval when the tab becomes visible,
 *     the window regains focus, or the device comes back online
 *
 * `fn` is kept in a ref so a changing callback identity never restarts the timer;
 * only `intervalMs` / `enabled` do. The caller owns the initial load — this hook
 * does not fetch on mount, it only keeps data fresh afterwards.
 */
export function useSmartPoll(fn: () => void, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let id: ReturnType<typeof setInterval> | undefined;
    let lastRun = 0;
    const fire = () => { lastRun = Date.now(); fnRef.current(); };
    const stop = () => { if (id) { clearInterval(id); id = undefined; } };
    const start = () => { stop(); id = setInterval(fire, intervalMs); };
    // Coming back to the foreground → refresh now, then resume ticking. Debounced
    // because returning to a tab fires visibilitychange + focus back-to-back.
    const wake = () => { if (document.hidden) { stop(); return; } if (Date.now() - lastRun > 3000) fire(); start(); };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
    };
  }, [intervalMs, enabled]);
}
