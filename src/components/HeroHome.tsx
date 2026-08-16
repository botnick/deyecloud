import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { Latest, Weather } from "../lib/api";
import { fmtPower } from "../lib/format";
import { condText } from "../lib/weather";

const HOUSES = ["1", "2", "3"]; // selectable house illustrations in /public/hero/house-N.webp
const HOUSE_DEFAULT = "2";

/* Photoreal house hero with a live energy-flow overlay + weather/day-night skin.
   Coordinates live in a 390×460 design space; the SVG stretches to the card and
   HTML nodes are placed by percentage, so the whole thing scales responsively. */

type Pt = { x: number; y: number };
type NodeKey = "solar" | "home" | "batt" | "grid";

const HUB: Pt = { x: 195, y: 248 };
const POS: Record<NodeKey, Pt> = { solar: { x: 150, y: 160 }, home: { x: 312, y: 222 }, batt: { x: 74, y: 252 }, grid: { x: 300, y: 372 } };
const COL: Record<NodeKey, string> = { solar: "#f5a623", home: "#0d4add", batt: "#18a673", grid: "#8b5cf6" }; // PV amber / home blue / batt green / grid violet
const LEFT = (x: number) => `${((x / 390) * 100).toFixed(2)}%`;
const TOP = (y: number) => `${((y / 460) * 100).toFixed(2)}%`;

// smooth pinwheel arc from a→b, trimmed to badge edges; returns path + approx length
function arc(a: Pt, b: Pt) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const r = 23, s = { x: a.x + ux * r, y: a.y + uy * r }, e = { x: b.x - ux * r, y: b.y - uy * r };
  const px = -uy, py = ux, bow = Math.min(d * 0.17, 28);
  const cx = (s.x + e.x) / 2 + px * bow, cy = (s.y + e.y) / 2 + py * bow;
  return { d: `M${s.x.toFixed(1)},${s.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${e.x.toFixed(1)},${e.y.toFixed(1)}`, len: d };
}

type Wx = "clear" | "cloud" | "rain" | "storm" | "fog";
function condToWx(c: number): Wx { if (c === 8) return "storm"; if (c >= 5 && c <= 7) return "rain"; if (c === 1 || c === 12) return "clear"; return "cloud"; }

// Real day/golden/night from the location's sunrise/sunset (falls back to clock)
function timeOfDay(weather: Weather | null): "day" | "golden" | "night" {
  const d = new Date(), mins = d.getHours() * 60 + d.getMinutes();
  const sun = weather?.sun;
  if (sun?.rise && sun?.set) {
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return (h || 0) * 60 + (m || 0); };
    const rise = toMin(sun.rise), set = toMin(sun.set);
    if (mins < rise || mins >= set) return "night";
    if (mins < rise + 55 || mins >= set - 70) return "golden"; // ~1h after dawn / before dusk
    return "day";
  }
  const h = d.getHours();
  return h < 6 || h >= 18 ? "night" : (h < 7 || h >= 17 ? "golden" : "day");
}

const ICON: Record<NodeKey | "hub", ReactElement> = {
  solar: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></svg>,
  home: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>,
  batt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="16" height="11" rx="2" /><path d="M22 11v3" /><path d="M7 11v3M11 10v5" strokeWidth="2.4" /></svg>,
  grid: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 21l2-16M17 21l-2-16M9 5h6M6 21h12M8 11h8M7.5 14h9" /></svg>,
  hub: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M6 14c1.5-3 3-3 4.5 0s3 3 4.5 0" /></svg>,
};

export function HeroHome({ latest, weather, title, imageUrl, force }: { latest: Latest; weather: Weather | null; title?: string; imageUrl?: string; force?: { time?: "day" | "golden" | "night"; wx?: Wx } }) {
  const rainRef = useRef<HTMLCanvasElement>(null);
  const boltRef = useRef<HTMLDivElement>(null);

  // user-selectable house illustration (persisted) — imageUrl prop overrides (preview)
  const [house, setHouse] = useState<string>(() => { try { return localStorage.getItem("deye_house") || HOUSE_DEFAULT; } catch { return HOUSE_DEFAULT; } });
  const [pickerOpen, setPickerOpen] = useState(false);
  const img = imageUrl || `/hero/house-${house}.webp`;
  const pickHouse = (h: string) => { setHouse(h); setPickerOpen(false); try { localStorage.setItem("deye_house", h); } catch {} };

  // ── scene (time of day + weather) — auto from sunrise/sunset + live weather; `force` overrides (preview) ──
  const time = force?.time ?? timeOfDay(weather);
  const night = time === "night";
  const cond = weather?.cond ?? 1;
  const wx = force?.wx ?? condToWx(cond);

  // ── live energy state (mirrors FlowDiagram conventions) ─────────────────────
  const bs = (latest.battStatus || "").toUpperCase();
  const bp = Number(latest.battPower) || 0;
  let charging = bs.includes("CHARGE"), discharging = bs.includes("DIS");
  if (!charging && !discharging) { if (bp < -20) charging = true; else if (bp > 20) discharging = true; }
  const soc = Math.round(latest.soc || 0);
  const hasBatt = (latest.soc || 0) > 0.5 || charging || discharging || Math.abs(bp) > 15 || (Number(latest.chargeToday) || 0) > 0.05 || (Number(latest.dischargeToday) || 0) > 0.05;
  const gridOff = /OFF|ISLAND|DISCONNECT/i.test(latest.gridStatus || "");
  const buying = (latest.gridPower || 0) >= 0;

  const edges: { key: NodeKey; from: Pt; to: Pt; on: boolean; off?: boolean }[] = [
    // PV → inverter (only while producing; 0 at night)
    { key: "solar", from: POS.solar, to: HUB, on: (latest.genPower || 0) > 20 },
    // inverter → home (only while there's load)
    { key: "home", from: HUB, to: POS.home, on: (latest.usePower || 0) > 20 },
  ];
  // battery: hidden only for systems with no battery; else charge (hub→batt) / discharge (batt→hub) / idle (line, no flow)
  if (hasBatt) edges.push({ key: "batt", from: discharging ? POS.batt : HUB, to: discharging ? HUB : POS.batt, on: charging || discharging });
  // grid: always part of the diagram — buy (grid→hub) / export (hub→grid) / down or off-grid (disconnected, no flow)
  edges.push({ key: "grid", from: buying ? POS.grid : HUB, to: buying ? HUB : POS.grid, on: !gridOff && Math.abs(latest.gridPower || 0) > 2, off: gridOff });
  const drawn = edges.map((e) => ({ ...e, ...arc(e.from, e.to), id: `she-${e.key}` }));

  // ── ambient particles ───────────────────────────────────────────────────────
  const stars = useMemo(() => Array.from({ length: 46 }, (_, i) => {
    const x = (Math.random() * 100).toFixed(1), y = (Math.random() * 100).toFixed(1), s = (0.6 + Math.random() * 1.5).toFixed(1);
    return <i key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${s}px`, height: `${s}px`, animationDelay: `${(Math.random() * 3).toFixed(2)}s` }} />;
  }), []);
  const clouds = useMemo(() => Array.from({ length: 5 }, (_, i) => {
    const w = Math.round(120 + Math.random() * 110);
    return <div key={i} className="sh-cloud" style={{ top: `${Math.round(6 + Math.random() * 120)}px`, width: `${w}px`, height: `${Math.round(w * 0.34)}px`, opacity: (0.55 + Math.random() * 0.45).toFixed(2), animationDuration: `${Math.round(28 + Math.random() * 26)}s`, animationDelay: `${-Math.round(Math.random() * 45)}s` }} />;
  }), []);

  // ── rain canvas ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = rainRef.current; const ctx = cv?.getContext("2d"); if (!cv || !ctx) return;
    const mode = wx === "storm" ? "storm" : wx === "rain" ? "rain" : "off";
    ctx.clearRect(0, 0, 390, 460);
    if (mode === "off") return;
    const storm = mode === "storm", n = storm ? 120 : 60, sk = storm ? 2 : 1.1, sp = storm ? 3 : 2.2;
    const drops = Array.from({ length: n }, () => ({ x: Math.random() * 410, y: Math.random() * 460, l: (storm ? 12 : 7) + Math.random() * 10, s: (storm ? 5 : 3) + Math.random() * 3 }));
    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, 390, 460);
      ctx.strokeStyle = storm ? "rgba(205,216,232,.4)" : "rgba(190,205,220,.32)"; ctx.lineWidth = storm ? 1.2 : 1;
      for (const d of drops) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - sk, d.y + d.l); ctx.stroke(); d.y += d.s * sp; d.x -= sk * 0.5; if (d.y > 460) { d.y = -d.l; d.x = Math.random() * 410; } }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [wx]);

  // ── lightning ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const bolt = boltRef.current; if (!bolt) return;
    if (wx !== "storm") { bolt.style.opacity = "0"; return; }
    let t = 0, alive = true;
    const flash = () => {
      if (!alive) return;
      bolt.style.transition = "none"; bolt.style.opacity = "0.92";
      setTimeout(() => { if (alive) { bolt.style.transition = "opacity .5s ease"; bolt.style.opacity = "0"; } }, 80);
      t = window.setTimeout(flash, 2600 + Math.random() * 4200);
    };
    t = window.setTimeout(flash, 1100 + Math.random() * 1400);
    return () => { alive = false; clearTimeout(t); bolt.style.opacity = "0"; };
  }, [wx]);

  const label = (k: NodeKey) =>
    k === "solar" ? "โซลาร์" : k === "home" ? "บ้าน"
      : k === "batt" ? (discharging ? "กำลังจ่าย" : charging ? "กำลังชาร์จ" : "แบตเตอรี่")
        : gridOff ? "ไฟดับ" : buying ? "ซื้อไฟ" : "ไฟย้อน";
  const value = (k: NodeKey) =>
    k === "solar" ? fmtPower(latest.genPower) : k === "home" ? fmtPower(latest.usePower)
      : k === "batt" ? fmtPower(latest.battPower) : fmtPower(latest.gridPower);
  const nodeKeys: NodeKey[] = ["solar", "home", ...(hasBatt ? (["batt"] as NodeKey[]) : []), "grid"];

  return (
    <div className={`solhero t-${time} w-${wx}`}>
      <div className="sh-house" style={{ backgroundImage: `url(${img})` }} />
      <div className="sh-atmos t" /><div className="sh-atmos w" />
      <div className="sh-stars">{stars}</div>
      <div className="sh-sun" /><div className="sh-moon" />
      <div className="sh-clouds">{clouds}</div>
      <div className="sh-bolt" ref={boltRef} />
      <canvas className="sh-rain" ref={rainRef} width={390} height={460} />
      <div className="sh-fog" />
      <div className="sh-scrim" />

      <svg className="sh-flow" viewBox="0 0 390 460" preserveAspectRatio="none">
        <defs>
          {drawn.map((e) => (
            <radialGradient key={e.id} id={`shg-${e.key}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="30%" stopColor="#ffffff" stopOpacity="0.92" />
              <stop offset="55%" stopColor={COL[e.key]} />
              <stop offset="100%" stopColor={COL[e.key]} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>
        {drawn.map((e) => {
          const dur = Math.max(e.len / 72, 1.1);
          return (
            <g key={e.id}>
              {!e.off && <path d={e.d} fill="none" stroke={COL[e.key]} strokeOpacity={0.14} strokeWidth={9} strokeLinecap="round" />}
              <path id={e.id} d={e.d} fill="none" stroke={e.off ? "#94a3b8" : COL[e.key]} strokeOpacity={e.off ? 0.55 : e.on ? 0.5 : 0.26} strokeWidth={e.off ? 2 : 2.4} strokeLinecap="round" strokeDasharray={e.off ? "5 7" : undefined} />
              {e.on && [0, 1].map((i) => (
                <circle key={i} r={5.2} fill={`url(#shg-${e.key})`} stroke="#ffffff" strokeWidth={1.2} strokeOpacity={0.85}>
                  <animateMotion dur={`${dur.toFixed(2)}s`} repeatCount="indefinite" begin={`${(-i * dur / 2).toFixed(2)}s`}>
                    <mpath href={`#${e.id}`} />
                  </animateMotion>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="sh-hub" style={{ left: LEFT(HUB.x), top: TOP(HUB.y) }}>{ICON.hub}</div>
      {nodeKeys.map((k) => (
        <div key={k} className="sh-node" style={{ left: LEFT(POS[k].x), top: TOP(POS[k].y) }}>
          <div className="sh-badge" style={{ color: k === "grid" && gridOff ? "#94a3b8" : COL[k] }}>
            {ICON[k]}
            {k === "batt" && <span className="sh-soc">{soc}%</span>}
          </div>
          <div className="sh-chip">
            <span className="sh-lb">{label(k)}</span>
            <span className="sh-vl">{value(k)}</span>
          </div>
        </div>
      ))}

      <div className="sh-top">
        <div>
          <div className="sh-name">{title || "บ้านของฉัน"}</div>
          <div className="sh-wx">{condText(cond, night)}{weather?.temp != null ? ` · ${Math.round(weather.temp)}°` : ""}</div>
        </div>
        <div className="sh-live"><span className="sh-dot" />Live</div>
      </div>

      {/* house-style picker — hidden until tapped, choice is remembered */}
      {!imageUrl && (
        <div className="sh-pickwrap">
          {pickerOpen && (
            <div className="sh-pick">
              {HOUSES.map((h) => (
                <button key={h} className={`sh-thumb${h === house ? " on" : ""}`} onClick={() => pickHouse(h)} aria-label={`บ้านแบบ ${h}`}>
                  <img src={`/hero/house-${h}.webp`} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          <button className="sh-pickbtn" onClick={() => setPickerOpen((o) => !o)} aria-label="เลือกสไตล์บ้าน">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
