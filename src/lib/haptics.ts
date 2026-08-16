// Tiny tap feedback — feels native on phones that support the Vibration API
// (most Android). No-op on iOS Safari / desktop.
export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
