import { useEffect, useState } from "react";
import { getSettings, saveSettings as apiSave, type RawSettings } from "./api";
import { ELECTRICITY_RATE, DEFAULT_SELL_RATE } from "./config";

// Resolved user economics. `systemCost` is optional (null = not entered → no payback).
export interface Settings { rate: number; sellRate: number; systemCost: number | null; }
export const DEFAULT_SETTINGS: Settings = { rate: ELECTRICITY_RATE, sellRate: DEFAULT_SELL_RATE, systemCost: null };

const LS_KEY = "deye_settings";

// Keep only known, well-typed keys so nothing odd is ever merged or persisted.
function clean(o: RawSettings | null | undefined): RawSettings {
  const out: RawSettings = {};
  if (o) {
    if (typeof o.rate === "number" && isFinite(o.rate)) out.rate = o.rate;
    if (typeof o.sellRate === "number" && isFinite(o.sellRate)) out.sellRate = o.sellRate;
    if (o.systemCost === null || (typeof o.systemCost === "number" && isFinite(o.systemCost))) out.systemCost = o.systemCost;
  }
  return out;
}
function readCache(): RawSettings { try { return clean(JSON.parse(localStorage.getItem(LS_KEY) || "{}")); } catch { return {}; } }
function writeCache(s: RawSettings) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }
const merge = (over: RawSettings): Settings => ({ ...DEFAULT_SETTINGS, ...clean(over) });

// Shared settings hook — instant from the localStorage cache, then synced from D1
// so every device sharing the PIN shows the same figures. `save()` writes the full
// merged object through to the server (the API replaces, so partial posts would
// drop fields), then adopts whatever the server echoes back.
export function useSettings() {
  const [over, setOver] = useState<RawSettings>(() => readCache());
  useEffect(() => {
    getSettings().then((s) => { const c = clean(s); setOver(c); writeCache(c); }).catch(() => {});
  }, []);
  const save = async (patch: RawSettings) => {
    const next = clean({ ...over, ...patch });
    setOver(next); writeCache(next); // optimistic
    try { const r = await apiSave(next); if (r?.settings) { const c = clean(r.settings); setOver(c); writeCache(c); } } catch {}
  };
  return { settings: merge(over), raw: over, save };
}
