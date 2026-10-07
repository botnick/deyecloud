import { useEffect, useMemo, useRef, useState } from "react";
import type { Weather } from "../lib/api";
import { bkkClock } from "../lib/format";
import { hm, condText, feelsLike, skyPhase, skyWx, sunPos, solarInfo, type SkyPhase, type SkyWx } from "../lib/weather";

/* Live sky for the weather tab: the real time of day (from the location's sunrise/sunset),
   the sun on its actual arc, the moon + stars at night, and clouds / rain / lightning that
   follow the current condition. The numbers sit on top in glass so they stay readable on
   any sky. `force` overrides the scene (screenshots / preview). */

const UV = (uv: number) =>
  uv < 3 ? { level: "ต่ำ", color: "#34d399" } : uv < 6 ? { level: "ปานกลาง", color: "#facc15" }
    : uv < 8 ? { level: "สูง", color: "#fb923c" } : uv < 11 ? { level: "สูงมาก", color: "#f87171" } : { level: "อันตราย", color: "#c084fc" };

const rand = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

export function WeatherHero({ weather: w, force }: { weather: Weather; force?: { phase?: SkyPhase; wx?: SkyWx; at?: Date } }) {
  // tick once a minute so the sky, sun and clock follow real time while the tab is open
  const [now, setNow] = useState(() => force?.at ?? new Date());
  useEffect(() => { if (force?.at) return; const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, [force?.at]);

  const phase = force?.phase ?? skyPhase(now, w.sun?.rise, w.sun?.set);
  const wx = force?.wx ?? skyWx(w.cond);
  const night = phase === "night";
  // forced phase (preview) at a clock time where the sun is down → place it where that phase has it
  const PREVIEW_SUN: Partial<Record<SkyPhase, { x: number; elev: number }>> = { dawn: { x: 0.04, elev: 4 }, day: { x: 0.42, elev: 62 }, golden: { x: 0.9, elev: 14 }, dusk: { x: 0.985, elev: 1 } };
  const sun = night ? null : (sunPos(now, w.sun) ?? (force?.phase ? PREVIEW_SUN[phase] ?? null : null));
  const noon = w.sun?.noonElev || 70;
  const d0 = w.daily?.[0];
  const feel = w.humidity != null ? feelsLike(w.temp!, w.humidity) : w.temp!;
  const showFeel = Math.round(feel) !== Math.round(w.temp!);
  const solar = solarInfo(w.cond, d0?.swdown);

  const r = useMemo(() => rand(7), []);
  const stars = useMemo(() => Array.from({ length: 60 }, (_, i) => (
    <i key={i} style={{ left: `${(r() * 100).toFixed(1)}%`, top: `${(r() * 62).toFixed(1)}%`, width: `${(0.7 + r() * 1.6).toFixed(1)}px`, animationDelay: `${(r() * 4).toFixed(2)}s` }} />
  )), [r]);
  const nClouds = wx === "clear" ? 0 : wx === "partly" ? 3 : wx === "cloud" ? 6 : 8;
  const clouds = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const wd = Math.round(130 + r() * 150);
    return { key: i, top: Math.round(4 + r() * 46), w: wd, op: (0.6 + r() * 0.4).toFixed(2), dur: Math.round(46 + r() * 40), delay: -Math.round(r() * 80) };
  }), [r]);

  // rain / storm drops on a canvas (cheap, smooth); stops entirely when dry
  const rainRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = rainRef.current, ctx = cv?.getContext("2d"); if (!cv || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (wx !== "rain" && wx !== "storm") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const storm = wx === "storm", W = cv.width, H = cv.height;
    const drops = Array.from({ length: storm ? 130 : 70 }, () => ({ x: Math.random() * (W + 40), y: Math.random() * H, l: (storm ? 13 : 8) + Math.random() * 10, s: (storm ? 13 : 8) + Math.random() * 6 }));
    let raf = 0;
    const loop = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = storm ? "rgba(214,224,240,.45)" : "rgba(205,218,232,.38)"; ctx.lineWidth = 1.1;
      for (const d of drops) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 2, d.y + d.l); ctx.stroke(); d.y += d.s; d.x -= 1; if (d.y > H) { d.y = -d.l; d.x = Math.random() * (W + 40); } }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [wx]);

  // lightning flashes during thunderstorms
  const boltRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const b = boltRef.current; if (!b) return;
    if (wx !== "storm") { b.style.opacity = "0"; return; }
    let t = 0, alive = true;
    const flash = () => {
      if (!alive) return;
      b.style.transition = "none"; b.style.opacity = "0.85";
      setTimeout(() => { if (alive) { b.style.transition = "opacity .6s ease"; b.style.opacity = "0"; } }, 90);
      t = window.setTimeout(flash, 3000 + Math.random() * 5000);
    };
    t = window.setTimeout(flash, 1500);
    return () => { alive = false; clearTimeout(t); };
  }, [wx]);

  // sun on its real arc (east→west mapped onto the right of the card so it never sits under the temperature), height from elevation vs today's noon
  const sunStyle = sun ? { left: `${(36 + sun.x * 58).toFixed(1)}%`, top: `${(70 - Math.min(1, sun.elev / noon) * 56).toFixed(1)}%` } : undefined;
  const clock = bkkClock(now.getTime() / 1000); // site clock (Bangkok), whatever the viewer's timezone

  return (
    <div className={`wxhero p-${phase} x-${wx}`} role="img" aria-label={`${condText(w.cond, night)} ${Math.round(w.temp!)} องศา`}>
      <div className="wh-sky" />
      <div className="wh-stars">{stars}</div>
      {sun && <div className="wh-sun" style={sunStyle} />}
      {night && <div className="wh-moon" />}
      <div className="wh-clouds">
        {clouds.slice(0, nClouds).map((c) => (
          <div key={c.key} className="wh-cloud" style={{ top: `${c.top}%`, width: `${c.w}px`, height: `${Math.round(c.w * 0.36)}px`, opacity: c.op, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />
        ))}
      </div>
      <div className="wh-bolt" ref={boltRef} />
      <canvas className="wh-rain" ref={rainRef} width={420} height={460} />
      <svg className="wh-land" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden>
        <path className="far" d="M0 46 C40 34 70 40 105 30 C140 20 170 34 205 28 C245 21 270 36 310 30 C345 25 375 33 400 28 L400 80 L0 80Z" />
        <path className="near" d="M0 62 C50 50 90 60 140 52 C190 44 230 58 280 52 C330 46 365 56 400 50 L400 80 L0 80Z" />
      </svg>

      <div className="wh-body">
        <div className="wh-top">
          <span className="wh-place">{w.place || "พื้นที่ของคุณ"}</span>
          <span className="wh-clock">{clock} น.</span>
        </div>
        <div className="wh-temp tabnum">{Math.round(w.temp!)}°</div>
        <div className="wh-cond">{condText(w.cond, night)}</div>
        <div className="wh-sub">
          {d0 && <>สูง {Math.round(d0.tc_max)}° · ต่ำ {Math.round(d0.tc_min)}°</>}
          {showFeel && <> · รู้สึกเหมือน <b>{Math.round(feel)}°</b></>}
        </div>

        <div className="wh-chips">
          <div className="wh-chip"><span>ความชื้น</span><b>{w.humidity != null ? `${Math.round(w.humidity)}%` : "—"}</b></div>
          <div className="wh-chip"><span>ลม</span><b>{w.wind != null ? <>{w.wind}<small> กม/ชม</small></> : "—"}</b></div>
          <div className="wh-chip"><span>ฝน</span><b>{w.rain != null ? <>{(+w.rain).toFixed(1)}<small> มม</small></> : "—"}</b></div>
          <div className="wh-chip"><span>UV</span><b>{w.uv != null ? <>{w.uv}<small> <i className="uvdot" style={{ background: UV(w.uv).color }} />{UV(w.uv).level}</small></> : "—"}</b></div>
        </div>

        {night ? (
          <div className="wh-pv"><span>กลางคืน · แผงพักการผลิต</span><span className="dim">รอแดด {hm(w.sun?.rise) != null ? `${w.sun!.rise!.trim()} น.` : "พรุ่งนี้"}</span></div>
        ) : (
          <div className="wh-pv">
            <span>แสงแดดวันนี้ · {solar.label}</span><span>{solar.pct}%</span>
            <div className="bar"><i style={{ width: `${solar.pct}%` }} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
