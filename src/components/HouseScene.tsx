import { useEffect, useRef, useState } from "react";
import type { Latest, Weather } from "../lib/api";
import { fmtPower } from "../lib/format";
import { condText, skyPhase, skyWx, type SkyPhase } from "../lib/weather";
import type { Flow, HouseView, LabelPos } from "../three/view";
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
const POSTER: Record<FlowKey, [number, number]> = { pv: [44, 33], grid: [83, 34], home: [27, 44.9], batt: [57, 51.7] };

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  return now;
}
// probe once per page load, then hand the probe's GL context straight back (browsers cap live contexts)
let webglOk: boolean | null = null;
const hasWebGL = () => {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement("canvas");
    const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    webglOk = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { webglOk = false; }
  return webglOk;
};
type Pin = { x: number; y: number; behind: boolean };
// Deye-style label: the reading sits on a rail (top row for the roof and the pole, bottom row for
// the house and the battery) and a dashed leader runs straight from it to the device. The pin is
// placed on the device point with one compositor transform; --len is the leader length.
const UP: Record<FlowKey, boolean> = { pv: true, grid: true, home: false, batt: false };
const pinTo = (el: HTMLDivElement, k: FlowKey, p: Pin, w: number, h: number) => {
  const x = (Math.max(6, Math.min(94, p.x)) * w) / 100, y = (Math.max(0, Math.min(100, p.y)) * h) / 100;
  const rail = UP[k] ? Math.max(78, h * 0.2) : h - 52;
  const len = Math.max(18, UP[k] ? y - rail : rail - y);
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  el.style.setProperty("--len", `${len.toFixed(0)}px`);
  el.dataset.x = x.toFixed(1); el.dataset.w = String(w);
  const op = p.behind ? "0.55" : "1"; if (el.style.opacity !== op) el.style.opacity = op;
};
// The two readings on a rail are laid out together so their text never overlaps: each sits beside
// its own leader (right of it, or left when that fits better), and if they still collide they are
// pushed apart inside the card. Leader ends stay on the devices; only the text moves.
const EDGE = 6, GAP = 10, OFF = 7;
export type Box = { x: number; w: number }; // leader x and text width, card px
export function railLayout(a: Box | null, b: Box | null, cardW: number): [number | null, number | null] {
  const fit = (l: number, w: number) => l >= EDGE && l + w <= cardW - EDGE;
  const sides = (bx: Box) => [bx.x + OFF, bx.x - OFF - bx.w]; // right of leader, left of leader
  const pick = (bx: Box, prefer: 0 | 1) => { const c = sides(bx); return fit(c[prefer], bx.w) ? c[prefer] : fit(c[1 - prefer], bx.w) ? c[1 - prefer] : Math.max(EDGE, Math.min(cardW - EDGE - bx.w, c[prefer])); };
  if (!a || !b) { const o = a ?? b; if (!o) return [null, null]; const l = pick(o, 0); return a ? [l, null] : [null, l]; }
  const swap = a.x > b.x, L = swap ? b : a, R = swap ? a : b;
  let lL = pick(L, 0), lR = pick(R, 0);
  if (lL + L.w + GAP > lR) lL = pick(L, 1); // left one moves to the left of its leader
  if (lL + L.w + GAP > lR) { // still colliding: push apart, staying inside the card
    const need = lL + L.w + GAP - lR;
    const toLeft = Math.min(need, Math.max(0, lL - EDGE)); lL -= toLeft;
    lR += Math.min(need - toLeft, Math.max(0, cardW - EDGE - R.w - lR));
  }
  return swap ? [lR, lL] : [lL, lR];
}
const layoutRails = (chips: Partial<Record<FlowKey, HTMLDivElement | null>>) => {
  for (const [ka, kb] of [["pv", "grid"], ["home", "batt"]] as [FlowKey, FlowKey][]) {
    const els = [chips[ka], chips[kb]].map((el) => (el && el.dataset.x ? el : null));
    const lbls = els.map((el) => el?.querySelector<HTMLElement>(".hs-lbl") ?? null);
    const boxes = els.map((el, i) => (el && lbls[i] ? { x: +el.dataset.x!, w: lbls[i]!.offsetWidth } : null));
    const cardW = +(els[0]?.dataset.w || els[1]?.dataset.w || 0); if (!cardW) continue;
    const out = railLayout(boxes[0], boxes[1], cardW);
    out.forEach((left, i) => {
      const lb = lbls[i], bx = boxes[i]; if (!lb || !bx || left == null) return;
      const dx = (left - bx.x).toFixed(1); if (lb.style.left !== `${dx}px`) lb.style.left = `${dx}px`;
      lb.classList.toggle("flip", left + bx.w / 2 < bx.x);
    });
  }
};

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
  const pins = useRef<{ pos: LabelPos; w: number; h: number } | null>(null); // last projected label spots
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
          // pin each label to its device when the camera moves (DOM writes, no React render)
          onLabels: (pos, w, h) => {
            pins.current = { pos, w, h };
            for (const k of Object.keys(pos) as FlowKey[]) { const el = chips.current[k]; if (el) pinTo(el, k, pos[k], w, h); }
            layoutRails(chips.current);
          },
          // GPU reset (low memory, driver crash): drop the 3D view, show the picture again
          onContextLost: () => {
            const v = view.current; view.current = null; pins.current = null; setLive3d(false);
            for (const k of Object.keys(chips.current) as FlowKey[]) { const el = chips.current[k]; if (el) { el.style.opacity = ""; requestAnimationFrame(() => placeRef.current(k, el)); } }
            setTimeout(() => v?.dispose(), 0);
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
  // label positions: projected device points once 3D runs, else the poster's points on the card size
  const root = useRef<HTMLDivElement>(null);
  const place = (k: FlowKey, el: HTMLDivElement | null | undefined) => {
    if (!el) return;
    const p = pins.current;
    if (live3d && p) pinTo(el, k, p.pos[k], p.w, p.h);
    else {
      const r = root.current; if (!r || !r.clientWidth) return;
      pinTo(el, k, { x: POSTER[k][0], y: POSTER[k][1], behind: false }, r.clientWidth, r.clientHeight);
    }
    layoutRails(chips.current);
  };
  const placeRef = useRef(place); placeRef.current = place;
  const liveRef = useRef(live3d); liveRef.current = live3d;
  useEffect(() => {
    const r = root.current; if (!r || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { if (!liveRef.current) for (const k of Object.keys(chips.current) as FlowKey[]) placeRef.current(k, chips.current[k]); });
    ro.observe(r); return () => ro.disconnect();
  }, []);
  const chip = (k: FlowKey, label: string, value: string, extra?: React.ReactNode) => (
    <div ref={(el) => { chips.current[k] = el; place(k, el); }} className={`hs-pin ${UP[k] ? "up" : "down"}`}>
      <i className="ln" style={{ borderColor: k === "grid" && gridOff ? "#94a3b8" : COL[k] }} />
      <div className="hs-lbl">
        <span className="vl">{value}{extra}</span>
        <span className="lb"><span className="dot" style={{ background: k === "grid" && gridOff ? "#94a3b8" : COL[k] }} />{label}</span>
      </div>
    </div>
  );

  return (
    <div ref={root} className={`hscene ${dim ? "dim" : ""}`} style={{ background: `linear-gradient(180deg, ${skyTop} 0%, ${skyBot} 78%)` }}>
      {cloudy && <div className="hs-haze" />}
      {night && <div className="hs-stars" />}
      {!live3d && <img className="hs-poster" src={dim ? "/hero/house-night.webp" : "/hero/house-day.webp"} alt="" draggable={false} />}
      <div ref={host} className="hs-3d" role="img" aria-label="บ้าน 3 มิติ ลากเพื่อหมุนและก้มเงยมุมมอง" />

      <div className="hs-top">
        <div className="min-w-0">
          <div className="hs-name">{title || "บ้านของฉัน"}</div>
          <div className="hs-wx">{condText(weather?.cond ?? 1, night)}{weather?.temp != null ? ` · ${Math.round(weather.temp)}°` : ""}</div>
        </div>
        <div className="hs-live"><span className="d" />เรียลไทม์</div>
      </div>

      {chip("pv", "โซลาร์", fmtPower(pvW))}
      {chip("grid", gridOff ? "ไฟดับ" : buying ? "ซื้อไฟ" : "ไฟย้อน", fmtPower(Math.abs(gp)))}
      {chip("home", "ใช้ไฟ", fmtPower(useW))}
      {hasBatt && chip("batt", discharging ? "แบตจ่าย" : charging ? "แบตชาร์จ" : "แบต", fmtPower(Math.abs(bp)),
        latest.socKnown !== false ? <span className="soc">{soc}%</span> : undefined)}
      {live3d && <button type="button" className="hs-hint" onClick={() => view.current?.reset()}>กลับมุมเดิม</button>}
    </div>
  );
}
