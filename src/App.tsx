import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, getStation, getLatest, getWeather, type Latest, type Weather, type Station } from "./lib/api";
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

export type View = "home" | "today" | "weather" | "device" | "history";

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
      const [l, w] = await Promise.all([getLatest().catch(() => null), getWeather().catch(() => null)]);
      const newLatest = l && !l.error ? l : latestRef.current;
      const newWeather = w && !w.error ? w : weatherRef.current;
      if (l && !l.error) setLatest(l);
      if (w && !w.error) setWeather(w);
      saveCache({ latest: newLatest, weather: newWeather });
    } finally {
      if (spin) setTimeout(() => setSpinning(false), 500);
    }
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    getStation().then(setStation).catch(() => {});
    refresh(true);
    const id = setInterval(() => refresh(false), 60000);
    const onVis = () => { if (!document.hidden) refresh(false); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [authed, refresh]);

  if (!splashDone || authed === null) {
    return <Splash />;
  }
  if (!authed) {
    return <PinGate onOk={() => { setAuthed(true); }} />;
  }

  return (
    <>
      <PullToRefresh onRefresh={() => refresh(true)}>
      <div className="max-w-[480px] mx-auto min-h-full bg-white">
        {view !== "device" && <Header stationName={station?.name} onRefresh={() => refresh(true)} spinning={spinning} />}
        <div className={`bg-canvas rounded-t-[20px] px-[18px] pb-[calc(96px+env(safe-area-inset-bottom))] min-h-[70vh] ${view === "device" ? "pt-[calc(12px+env(safe-area-inset-top))]" : "pt-5"}`}>
          <div key={view} className="view-anim">
            {view === "home" && <HomeView latest={shownLatest} weather={weather} capacity={station?.capacity} onWeather={() => go("weather")} onDevice={() => go("device")} />}
            {view === "today" && <TodayView latest={shownLatest} capacity={station?.capacity} />}
            {view === "weather" && <WeatherView weather={weather} />}
            {view === "device" && <DeviceView latest={shownLatest} active={true} onBack={() => go("home")} />}
          </div>
          <div className={view === "history" ? "view-anim" : "hidden"}>
            <HistoryView active={view === "history"} />
          </div>
        </div>
      </div>
      </PullToRefresh>
      <BottomNav view={view} onGo={go} />
      {devMode && <DevPanel current={sim} onPick={setSim} />}
    </>
  );
}
