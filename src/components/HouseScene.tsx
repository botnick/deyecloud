import { useEffect, useState } from "react";
import type { Latest, Weather } from "../lib/api";
import { fmtPower } from "../lib/format";
import { condText, skyPhase, skyWx, type SkyPhase } from "../lib/weather";

/* Home hero — a 3D solar house (Kenney "City Kit (Suburban)", CC0, rendered offline in a
   day and a night version) on a sky that follows the site's real time of day, with the four
   live power readings as glass chips. Each chip carries a word, not just a colour. */

const COL = { pv: "#f5a623", home: "#0d6bff", batt: "#18a673", grid: "#8b5cf6" };
const SKY: Record<SkyPhase, [string, string]> = {
  day: ["#7cc0f4", "#e6f4ff"], dawn: ["#8f8bc9", "#ffd8b8"], golden: ["#8fb5e8", "#ffe2b0"], dusk: ["#3b3d7a", "#e9919c"], night: ["#0b1534", "#25345f"],
};

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  return now;
}

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
  const hasBatt = (latest.soc || 0) > 0.5 || charging || discharging || Math.abs(bp) > 15;
  const gridOff = /OFF|ISLAND|DISCONNECT/i.test(latest.gridStatus || "");
  const gp = latest.gridPower || 0;
  const buying = gp >= 0;

  const [skyTop, skyBot] = SKY[phase];
  const chip = (k: keyof typeof COL, label: string, value: string, style: React.CSSProperties, extra?: React.ReactNode) => (
    <div className="hs-chip" style={style}>
      <span className="dot" style={{ background: k === "grid" && gridOff ? "#94a3b8" : COL[k] }} />
      <span className="txt"><span className="lb">{label}</span><span className="vl">{value}</span></span>
      {extra}
    </div>
  );

  return (
    <div className={`hscene ${dim ? "dim" : ""}`} style={{ background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBot} 78%)` }}>
      {cloudy && <div className="hs-haze" />}
      {night && <div className="hs-stars" />}
      <img className="hs-house" src={dim ? "/hero/kenney-night.webp" : "/hero/kenney-day.webp"} alt="" draggable={false} />

      <div className="hs-top">
        <div className="min-w-0">
          <div className="hs-name">{title || "บ้านของฉัน"}</div>
          <div className="hs-wx">{condText(weather?.cond ?? 1, night)}{weather?.temp != null ? ` · ${Math.round(weather.temp)}°` : ""}</div>
        </div>
        <div className="hs-live"><span className="d" />สด</div>
      </div>

      {chip("pv", "โซลาร์", fmtPower(latest.genPower), { left: "4%", top: "30%" })}
      {chip("grid", gridOff ? "ไฟดับ" : buying ? "ซื้อไฟ" : "ขายไฟ", fmtPower(Math.abs(gp)), { right: "4%", top: "30%" })}
      {chip("home", "บ้านใช้", fmtPower(latest.usePower), { left: "4%", bottom: "5%" })}
      {hasBatt && chip("batt", discharging ? "แบตจ่าย" : charging ? "แบตชาร์จ" : "แบต", fmtPower(Math.abs(bp)), { right: "4%", bottom: "5%" },
        <span className="soc"><i style={{ width: `${soc}%` }} /><b>{soc}%</b></span>)}
    </div>
  );
}
