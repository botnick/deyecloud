// Battery DC-channel topology, learned from telemetry — pure helpers (unit-tested).
//
// A `BatteryCurrentN` measure point that has NEVER carried current is a placeholder
// of the inverter model (parallel packs report through one BMS master); one that
// HAS carried current is a physically wired channel. Two rules keep this honest:
//   • a channel, once known, stays known — age-out is not evidence of anything,
//     and mapping "expired" to "recovered" would emit a false all-clear;
//   • only a FRESH observation from an ONLINE device may teach a channel: a stale
//     replay (Deye re-serving an old sample) or an offline device carries no
//     information about the present, so it must not stamp "seen today".
export const CHANNEL_LIVE_A = 1;         // |I| ≥ 1 A = the channel is really carrying current
export const DEYE_STATE_OFFLINE = 3;

// Deye timestamps arrive in seconds or milliseconds depending on endpoint — normalise.
export const toSeconds = (t: unknown): number | null => {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
};

export interface Observation { collectionTime?: unknown; deviceState?: unknown; }

// Channels carrying current in this sample, keyed by the OBSERVATION time (the
// device's own collectionTime, not the poll time). null = sample not admissible:
// no/invalid timestamp, older than `maxAgeS`, or device reported offline.
export function observedChannelActivity(
  dataList: { key?: string; value?: unknown }[], obs: Observation, nowS: number, maxAgeS: number,
): Record<string, number> | null {
  const ts = toSeconds(obs.collectionTime);
  if (ts == null || nowS - ts > maxAgeS || ts > nowS + 300) return null;
  if (Number(obs.deviceState) === DEYE_STATE_OFFLINE) return null;
  const live: Record<string, number> = {};
  for (const x of dataList || []) {
    const m = /^BatteryCurrent(\d+)$/.exec(String(x.key || ""));
    if (m && Math.abs(Number(x.value)) >= CHANNEL_LIVE_A) live[m[1]] = ts;
  }
  return live;
}

// Known channels = every channel ever observed live. No expiry (see header).
export const activeChannels = (seen: Record<string, number> | null | undefined): number[] =>
  Object.keys(seen || {}).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
