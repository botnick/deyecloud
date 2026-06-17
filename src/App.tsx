import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, getStation, getStations, getLatest, getWeather, type Latest, type Weather, type Station } from "./lib/api";
import { PinGate } from "./components/PinGate";
import { Splash } from "./components/Splash";
import { Header } from "./components/Header";
import { BottomNav } from "./components/BottomNav";
import { HomeView } from "./components/HomeView";
import { TodayView } from "./components/TodayView";
import { WeatherView } from "./components/WeatherView";
import { HistoryView } from "./components/HistoryView";
import { DeviceView } from "./components/DeviceView";
import { DevPanel } from "./components/DevPanel";
import { PullToRefresh } from "./components/PullToRefresh";
import { scenarioByKey } from "./lib/scenarios";
import { timeStr } from "./lib/format";
import { APP_NAME, REPO_URL } from "./lib/brand";

export type View = "home" | "today" | "weather" | "device" | "history";

/** Standard "can't reach the system" banner — shown when the live fetch fails;
 *  last-known data stays on screen behind it and the app keeps retrying. */
function OfflineBanner({ latest, onRetry }: { latest: Latest | null; onRetry: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warn/25 bg-warn/10 px-4 py-3">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-warn/15 text-warn shrink-0">
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-title leading-tight">เชื่อมต่อระบบไม่ได้</div>
        <div className="text-[13px] text-body mt-0.5">
          {latest ? `แสดงข้อมูลล่าสุดเมื่อ ${timeStr(latest.updatedAt)} · กำลังลองใหม่` : "ไม่สามารถดึงข้อมูลได้ขณะนี้ · กำลังลองใหม่"}
        </div>
      </div>
      <button onClick={onRetry} className="shrink-0 h-9 px-3.5 rounded-xl bg-warn text-white text-[14px] font-bold active:scale-95 transition-transform">ลองใหม่</button>
    </div>
  );
}

const VIEWS: View[] = ["home", "today", "weather", "device", "history"];
function viewFromPath(): View {
  const p = location.pathname.replace(/^\/+/, "");
  return (VIEWS.includes(p as View) ? p : "home") as View;
}

function loadCache(): { latest: Latest | null; weather: Weather | null } {
  try { return JSON.parse(localStorage.getItem("deye_cache") || "null") || { latest: null, weather: null }; }
  catch { return { latest: null, weather: null }; }
}
function saveCache(d: { latest: Latest | null; weather: Weather | null }) {
  try { localStorage.setItem("deye_cache", JSON.stringify(d)); } catch {}
}

export default function App() {
  const cached = loadCache();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [view, setViewState] = useState<View>(viewFromPath());
  const [devMode] = useState(() => {
    try { const q = new URLSearchParams(location.search); if (q.has("dev") || q.has("sim")) localStorage.setItem("deye_dev", "1"); return localStorage.getItem("deye_dev") === "1"; } catch { return false; }
  });
  const [sim, setSim] = useState<string | null>(() => {
    try { return new URLSearchParams(location.search).get("sim"); } catch { return null; }
  });
  const go = useCallback((v: View) => {
    setViewState((cur) => { if (v !== cur) history.pushState(null, "", "/" + v); return v; });
  }, []);
  const [latest, setLatest] = useState<Latest | null>(cached.latest);
  const [weather, setWeather] = useState<Weather | null>(cached.weather);
  const [station, setStation] = useState<Station | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    try { const v = localStorage.getItem("deye_station"); return v ? Number(v) : null; } catch { return null; }
  });
  const [offline, setOffline] = useState(false);
  const active = stations.find((s) => s.id === selectedId) || station; // selected (or default) station
  const shownLatest = sim ? scenarioByKey(sim)?.latest ?? latest : latest;
  const [spinning, setSpinning] = useState(false);
  const [splashDone, setSplashDone] = useState(() => {
    try { return sessionStorage.getItem("deye_splash") === "1"; } catch { return false; }
  });
  useEffect(() => {
    if (splashDone) return;
    const t = setTimeout(() => { setSplashDone(true); try { sessionStorage.setItem("deye_splash", "1"); } catch {} }, 1100);
    return () => clearTimeout(t);
  }, [splashDone]);

  const latestRef = useRef(latest);
  const weatherRef = useRef(weather);
  useEffect(() => { latestRef.current = latest; }, [latest]);
  useEffect(() => { weatherRef.current = weather; }, [weather]);

  // Station id sent to the data API — only for multi-station accounts; single
  // station sends nothing so the server keeps its default-station behaviour.
  const stationParamRef = useRef<number | undefined>(undefined);
  useEffect(() => { stationParamRef.current = stations.length > 1 ? (selectedId ?? undefined) : undefined; }, [stations, selectedId]);


  useEffect(() => {
    getSession().then((s) => setAuthed(s.authed)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    const onPop = () => setViewState(viewFromPath());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const refresh = useCallback(async (spin: boolean) => {
    if (spin) setSpinning(true);
    try {
      const [l, w] = await Promise.all([getLatest(stationParamRef.current).catch(() => null), getWeather().catch(() => null)]);
      const okLatest = !!(l && !l.error);
      const newLatest = okLatest ? l : latestRef.current;
      const newWeather = w && !w.error ? w : weatherRef.current;
      if (okLatest) setLatest(l);
      if (w && !w.error) setWeather(w);
      setOffline(!okLatest); // live data unreachable → show the banner, keep last-known
      saveCache({ latest: newLatest, weather: newWeather });
    } finally {
      if (spin) setTimeout(() => setSpinning(false), 500);
    }
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    getStation().then(setStation).catch(() => {});
    refresh(true);
    const onVis = () => { if (!document.hidden) refresh(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [authed, refresh]);

  // Poll on an interval; retry faster while offline so it recovers promptly.
  useEffect(() => {
    if (authed !== true) return;
    const id = setInterval(() => refresh(false), offline ? 20000 : 60000);
    return () => clearInterval(id);
  }, [authed, offline, refresh]);

  // Discover stations; resolve the active selection (persisted, else first).
  useEffect(() => {
    if (authed !== true) return;
    getStations().then((list) => {
      if (!Array.isArray(list) || !list.length) return;
      setStations(list);
      setSelectedId((cur) => (cur != null && list.some((s) => s.id === cur)) ? cur : (list[0]?.id ?? null));
    }).catch(() => {});
  }, [authed]);

  const switchStation = useCallback((id: number) => {
    setSelectedId(id);
    try { localStorage.setItem("deye_station", String(id)); } catch {}
    setLatest(null); // clear the previous station's numbers while the new ones load
  }, []);

  // (Re)load realtime when the active station resolves or changes (multi-station only).
  useEffect(() => {
    if (authed !== true || selectedId == null || stations.length <= 1) return;
    stationParamRef.current = selectedId;
    refresh(true);
  }, [selectedId, stations.length, authed, refresh]);

  if (!splashDone || authed === null) {
    return <Splash />;
  }
  if (!authed) {
    return <PinGate onOk={() => { setAuthed(true); }} />;
  }

  return (
    <>
      <PullToRefresh onRefresh={() => refresh(true)}>
      <div className="max-w-[480px] mx-auto min-h-full">
        {view !== "device" && <Header stationName={active?.name} stations={stations} selectedId={selectedId} onSwitch={switchStation} onRefresh={() => refresh(true)} spinning={spinning} />}
        <div className={`px-[18px] pb-[calc(96px+env(safe-area-inset-bottom))] min-h-[70vh] ${view === "device" ? "pt-[calc(12px+env(safe-area-inset-top))]" : "pt-5"}`}>
          {offline && !sim && <OfflineBanner latest={latest} onRetry={() => refresh(true)} />}
          <div key={view} className="view-anim">
            {view === "home" && <HomeView latest={shownLatest} weather={weather} capacity={active?.capacity} onWeather={() => go("weather")} onDevice={() => go("device")} />}
            {view === "today" && <TodayView latest={shownLatest} capacity={active?.capacity} />}
            {view === "weather" && <WeatherView weather={weather} />}
            {view === "device" && <DeviceView latest={shownLatest} active={true} stationId={stations.length > 1 ? selectedId : undefined} onBack={() => go("home")} />}
          </div>
          <div className={view === "history" ? "view-anim" : "hidden"}>
            <HistoryView active={view === "history"} stationId={stations.length > 1 ? selectedId : undefined} />
          </div>

          {/* ── Open-source credit · โปรดเก็บไว้ อย่าลบ (please keep this attribution — do not delete) ── */}
          <footer className="mt-9 mb-1 text-center">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] text-muted/70 hover:text-muted active:opacity-70 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6 0-.3 0-1.1 0-2-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.2.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2 0 1.6 0 2.9 0 3.3 0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
              </svg>
              <span>{APP_NAME} · โอเพนซอร์สบน GitHub</span>
            </a>
          </footer>
        </div>
      </div>
      </PullToRefresh>
      <BottomNav view={view === "device" ? "home" : view} onGo={go} />
      {devMode && <DevPanel current={sim} onPick={setSim} />}
    </>
  );
}
