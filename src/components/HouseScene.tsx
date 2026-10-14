import { useEffect, useRef, useState } from "react";
import type { Latest, Weather } from "../lib/api";
import { fmtPower } from "../lib/format";
import { condText, skyPhase, skyWx, type SkyPhase } from "../lib/weather";
import type { Flow, HouseView } from "../three/view";
import type { FlowKey } from "../three/house";

/* Home hero — a real-time 3D model of the solar house (three.js, loaded lazily) on a sky
   that follows the site's time of day. Drag sideways to walk around it; light runs along
   each cable in the direction power flows; each live reading is pinned to its device and
   always carries a word, not just a colour. Until the 3D chunk loads — or where WebGL
   isn't available — a pre-rendered picture of the same house is shown. */

const COL: Record<FlowKey, string> = { pv: "#f5a623", home: "#0d6bff", batt: "#18a673", grid: "#8b5cf6" };
const SKY: Record<SkyPhase, [string, string]> = {
  day: ["#7cc0f4", "#e6f4ff"], dawn: ["#8f8bc9", "#ffd8b8"], golden: ["#8fb5e8", "#ffe2b0"], dusk: ["#3b3d7a", "#e9919c"], night: ["#0b1534", "#25345f"],
};
const FLOW_MIN = 30;
// until the 3D view runs, labels sit at the poster's device positions (design/house/scene.html anchors)
const POSTER: Record<FlowKey, [number, number]> = { pv: [40, 20], grid: [86, 24], home: [27, 44], batt: [57, 52] };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  return now;
}
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };

export function HouseScene({ latest, weather, title, force }: { latest: Latest; weather: Weather | null; title?: string; force?: { phase?: SkyPhase } }) {
  const now = useClock();
  // ?sky=day|dawn|golden|dusk|night previews a lighting (screenshots); otherwise the site's real time
  const qp = typeof location !== "undefined" ? new URLSearchParams(location.search).get("sky") : null;
  const preview = (["night", "dawn", "day", "golden", "dusk"] as SkyPhase[]).find((x) => x === qp);
  const phase = force?.phase ?? preview ?? skyPhase(now, weather?.sun?.rise, weather?.sun?.set);
  const night = phase === "night";
  const dim = night || phase === "dusk";
  const wx = skyWx(weather?.cond ?? 1);
  const cloudy = wx === "cloud" || wx === "rain" || wx === "storm";

  // live energy state (same conventions as the rest of the app)
  const bs = (latest.battStatus || "").toUpperCase();
  const bp = Number(latest.battPower) || 0;
  let charging = bs.includes("CHARGE") && !bs.includes("DIS"), discharging = bs.includes("DIS");
  if (!charging && !discharging) { if (bp < -20) charging = true; else if (bp > 20) discharging = true; }
  const soc = Math.max(0, Math.min(100, Math.round(latest.soc || 0)));
  const hasBatt = latest.socKnown === true || (latest.socKnown !== false && (latest.soc || 0) > 0.5) || charging || discharging || Math.abs(bp) > 15;
  const gridOff = /OFF|ISLAND|DISCONNECT/i.test(latest.gridStatus || "");
  const gp = latest.gridPower || 0;
  const buying = gp >= 0;
  const pvW = latest.genPower || 0, useW = latest.usePower || 0;

  const flows: Flow[] = [];
  if (pvW > FLOW_MIN) flows.push({ key: "pv", watts: pvW, toHouse: true });
  if (!gridOff && Math.abs(gp) > FLOW_MIN) flows.push({ key: "grid", watts: Math.abs(gp), toHouse: buying });
  if (useW > FLOW_MIN) flows.push({ key: "home", watts: useW, toHouse: false });
  if (hasBatt && Math.abs(bp) > FLOW_MIN) flows.push({ key: "batt", watts: Math.abs(bp), toHouse: discharging });

  // 3D view lifecycle — created once, fed flows / day-night on change
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<HouseView | null>(null);
  const chips = useRef<Partial<Record<FlowKey, HTMLDivElement | null>>>({});
  const [live3d, setLive3d] = useState(false);
  const flowsRef = useRef(flows); flowsRef.current = flows;
  const dimRef = useRef(dim); dimRef.current = dim;
  useEffect(() => {
    if (!host.current || !hasWebGL()) return;
    let gone = false;
    import("../three/view").then(({ createHouseView }) => {
      if (gone || !host.current) return;
      try {
        view.current = createHouseView(host.current, {
          night: dimRef.current,
          reducedMotion: !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
          // pin each label to its device every frame (DOM writes, no React render)
          onFrame: (pos) => {
            for (const k of Object.keys(pos) as FlowKey[]) {
              const el = chips.current[k]; if (!el) continue;
              // keep the whole chip inside the card (pole label near the edge)
              el.style.left = `${Math.max(16, Math.min(84, pos[k].x))}%`; el.style.top = `${Math.max(34, pos[k].y)}%`;
              el.style.opacity = pos[k].behind ? "0.6" : "1";
            }
          },
        });
        view.current.setFlows(flowsRef.current);
        setLive3d(true);
      } catch (e) { console.warn("3D house unavailable", e); }
    }).catch(() => {});
    return () => { gone = true; view.current?.dispose(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.setNight(dim); }, [dim]);
  useEffect(() => { view.current?.setFlows(flows); });

  const [skyTop, skyBot] = SKY[phase];
  const chip = (k: FlowKey, label: string, value: string, extra?: React.ReactNode) => (
    <div ref={(el) => { chips.current[k] = el; }} className="hs-pin" style={{ left: `${POSTER[k][0]}%`, top: `${POSTER[k][1]}%` }}>
      <div className="hs-chip">
        <span className="dot" style={{ background: k === "grid" && gridOff ? "#94a3b8" : COL[k] }} />
        <span className="txt"><span className="lb">{label}</span><span className="vl">{value}</span></span>
        {extra}
      </div>
    </div>
  );

  return (
    <div className={`hscene ${dim ? "dim" : ""}`} style={{ background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBot} 78%)` }}>
      {cloudy && <div className="hs-haze" />}
      {night && <div className="hs-stars" />}
      {!live3d && <img className="hs-poster" src={dim ? "/hero/house-night.webp" : "/hero/house-day.webp"} alt="" draggable={false} />}
      <div ref={host} className="hs-3d" role="img" aria-label="บ้าน 3 มิติ ลากเพื่อหมุนและก้มเงยมุมมอง" />

      <div className="hs-top">
        <div className="min-w-0">
          <div className="hs-name">{title || "บ้านของฉัน"}</div>
          <div className="hs-wx">{condText(weather?.cond ?? 1, night)}{weather?.temp != null ? ` · ${Math.round(weather.temp)}°` : ""}</div>
        </div>
        <div className="hs-live"><span className="d" />สด</div>
      </div>

      {chip("pv", "โซลาร์", fmtPower(pvW))}
      {chip("grid", gridOff ? "ไฟดับ" : buying ? "ซื้อไฟ" : "ขายไฟ", fmtPower(Math.abs(gp)))}
      {chip("home", "บ้านใช้", fmtPower(useW))}
      {hasBatt && chip("batt", discharging ? "แบตจ่าย" : charging ? "แบตชาร์จ" : "แบต", fmtPower(Math.abs(bp)),
        latest.socKnown !== false ? <span className="soc"><i style={{ width: `${soc}%` }} /><b>{soc}%</b></span> : undefined)}
      {live3d && <button type="button" className="hs-hint" onClick={() => view.current?.reset()}>กลับมุมเดิม</button>}
    </div>
  );
}
