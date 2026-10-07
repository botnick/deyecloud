import { useForecastModel } from "../lib/useCapacity";
import { ForecastAccuracyCard } from "./ForecastAccuracy";
import { type Weather, type WeatherHour } from "../lib/api";
import { condText, solarInfo, DAYLBL, shortDate, isNightAt } from "../lib/weather";
import { forecast, hourlyKwh } from "../lib/forecast";
import { WxIcon } from "../lib/wxicon";
import { card, cardP, h2First, h2Mid } from "../lib/ui";
import { IconSun } from "../lib/icons";
import { InfoTip } from "./InfoTip";
import { SunPath } from "./SunPath";
import { WeatherHero } from "./WeatherHero";
import type { SkyPhase, SkyWx } from "../lib/weather";
// Meteocons sunrise/sunset (same "fill" family as every other weather icon) so the
// markers match the hourly strip's style exactly.
import sunriseSvg from "@meteocons/svg/fill/sunrise.svg";
import sunsetSvg from "@meteocons/svg/fill/sunset.svg";

const amber = "linear-gradient(90deg,#ffd84d,#ff9d00)";

const SunMarkIcon = ({ up, className }: { up: boolean; className?: string }) => (
  <img src={up ? sunriseSvg : sunsetSvg} alt="" draggable={false} className={className} />
);

// Preview / screenshot override: /weather?sky=day|dawn|golden|dusk|night&skywx=clear|partly|cloud|rain|storm
function skyForce(): { phase?: SkyPhase; wx?: SkyWx } | undefined {
  try {
    const q = new URLSearchParams(location.search), p = q.get("sky"), x = q.get("skywx");
    const P = ["night", "dawn", "day", "golden", "dusk"], X = ["clear", "partly", "cloud", "rain", "storm"];
    const f = { phase: P.includes(p || "") ? (p as SkyPhase) : undefined, wx: X.includes(x || "") ? (x as SkyWx) : undefined };
    return f.phase || f.wx ? f : undefined;
  } catch { return undefined; }
}

export function WeatherView({ weather, capacity, isPrimary = true }: { weather: Weather | null; capacity?: number; isPrimary?: boolean }) {
  // Effective capacity for the production forecast: the station's installed kWp, or
  // — when unknown — derived from the best PV power ever produced (peakPower). Only
  // fetched (cheaply, cached) when the station never reported its capacity.
  const model = useForecastModel(capacity, isPrimary);
  const effCap = model.capKw;

  if (!weather || weather.temp == null) {
    return (
      <>
        <h2 className={h2First}>พยากรณ์อากาศ</h2>
        <div className="skeleton h-48 rounded-[20px]" />
      </>
    );
  }
  const w = weather;
  const fc = forecast(w, effCap, model.sky); // expected kWh per available day (today included)
  const sun = w.sun;

  // Sun elevation at any clock time, interpolated from the sunrise→sunset arc, so
  // the hourly strip can show a small per-hour production estimate. 0 at night.
  const elevAt = (date: Date): number => {
    if (!sun?.rise || !sun?.set || !sun.arc?.length) return 0;
    const mins = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
    const r = mins(sun.rise), st = mins(sun.set), t = date.getHours() * 60 + date.getMinutes();
    if (st <= r || t <= r || t >= st) return 0;
    const idx = ((t - r) / (st - r)) * (sun.arc.length - 1);
    const lo = Math.floor(idx), hi = Math.min(sun.arc.length - 1, lo + 1);
    return sun.arc[lo] + (sun.arc[hi] - sun.arc[lo]) * (idx - lo);
  };

  // Merge sunrise/sunset markers into the hourly strip at their real times (iOS-style).
  type HourItem = { kind: "hour"; d: Date; h: WeatherHour };
  type SunItem = { kind: "rise" | "set"; d: Date };
  const hourly: HourItem[] = (w.hourly || []).slice(0, 12).map((h) => ({ kind: "hour", d: new Date(h.time), h }));
  const hourlyItems: (HourItem | SunItem)[] = [...hourly];
  if (sun?.rise && sun?.set && hourly.length) {
    const first = hourly[0].d, last = hourly[hourly.length - 1].d;
    const at = (base: Date, hhmm: string) => { const [H, M] = hhmm.split(":").map(Number); const x = new Date(base); x.setHours(H, M, 0, 0); return x; };
    for (const off of [0, 1]) {
      const base = new Date(first); base.setDate(base.getDate() + off);
      for (const k of ["rise", "set"] as const) {
        const t = at(base, k === "rise" ? sun.rise : sun.set);
        if (t > first && t <= last) hourlyItems.push({ kind: k, d: t });
      }
    }
    hourlyItems.sort((a, b) => a.d.getTime() - b.d.getTime());
  }
  const nowMs = hourly[0]?.d.getTime();

  return (
    <>
      <h2 className={h2First}>พยากรณ์อากาศ</h2>

      {/* hero — live sky (time of day + sun position + current weather) */}
      <WeatherHero weather={w} force={skyForce()} />

      {/* production forecast — what the panels are likely to make next */}
      {effCap > 0 && fc.length > 1 && (
        <div className={`${cardP} mt-3`}>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: "var(--color-pv-soft)", color: "var(--color-pv)" }}>
              <IconSun className="w-5 h-5" />
            </span>
            <div className="font-bold text-[16px] text-title">คาดการณ์การผลิตไฟ</div>
            <InfoTip className="ml-1" text={`ค่าประมาณการผลิตไฟแต่ละวัน คิดจากกำลังผลิตอ้างอิง ${effCap.toFixed(1)} kW — สอบเทียบจากวันแดดดีจริงของระบบนี้เมื่อมีประวัติพอ (ไม่งั้นใช้ขนาดระบบตามป้าย) × ปริมาณแสงแดดที่คาดไว้ ค่าจริงขึ้นกับเมฆ ฝน และการใช้งานจริงครับ`} />
          </div>
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            {fc.slice(0, 3).map((f, i) => (
              <div key={i} className="bg-canvas rounded-2xl px-2 py-3 text-center">
                <div className="text-[12px] text-body">{DAYLBL[i] || shortDate(f.time)}</div>
                <div className="text-[19px] font-extrabold tabnum text-pv-high mt-1">{f.kwh.toFixed(1)}<span className="text-[11px] text-body font-semibold ml-0.5">หน่วย</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* sun & solar reception */}
      {sun && (
        <>
          {isPrimary && <ForecastAccuracyCard skyDays={model.skyDays} />}
          <h2 className={h2Mid}>ดวงอาทิตย์และการรับแสง</h2>
          <div className={cardP}>
            <SunPath sun={sun} />

            <div className="mt-3 bg-pv-soft rounded-2xl px-4 py-3">
              <div className="font-bold text-[15px] text-[#9a6500]">ช่วงรับพลังงานแสงสูงสุด {sun.peakStart} – {sun.peakEnd} น.</div>
              <div className="text-[13px] text-[#9a6500] mt-1 leading-snug">แนะนำให้ใช้เครื่องใช้ไฟฟ้าขนาดใหญ่ เช่น เครื่องปรับอากาศและเครื่องซักผ้า ในช่วงเวลานี้ เพื่อใช้พลังงานจากแสงอาทิตย์ได้อย่างคุ้มค่าที่สุด</div>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-3">
              <div className="bg-canvas rounded-2xl px-4 py-3 text-center">
                <div className="text-[12px] text-body leading-snug">พลังงานแสงที่ใช้ได้วันนี้</div>
                <div className="text-[19px] font-extrabold tabnum mt-1 text-pv-high">≈ {sun.psh}<span className="text-[12px] font-semibold text-body ml-1">ชั่วโมง</span></div>
              </div>
              <div className="bg-canvas rounded-2xl px-4 py-3 text-center">
                <div className="text-[12px] text-body leading-snug">ระยะเวลากลางวัน</div>
                <div className="text-[19px] font-extrabold tabnum mt-1">{sun.dayHours}<span className="text-[12px] font-semibold text-body ml-1">ชั่วโมง</span></div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* hourly */}
      <div className={`${h2Mid} flex items-center gap-2`}>
        <span>ราย 1 ชั่วโมง</span>
        {effCap > 0 && <InfoTip text="ตัวเลขสีส้ม (~หน่วย) ใต้แต่ละชั่วโมง คือไฟที่คาดว่าจะผลิตได้ในชั่วโมงนั้น คิดจากมุมแสงแดด × สภาพอากาศครับ" />}
      </div>
      <div className="flex gap-2.5 overflow-x-auto hscroll snap-x pb-2.5 -mx-[18px] px-[18px]">
        {hourlyItems.map((it, i) =>
          it.kind === "hour" ? (
            <div key={i} className="shrink-0 snap-start w-[70px] py-3 px-2 text-center rounded-[18px] bg-white/55 border border-white/70">
              <div className="text-[13px] font-bold text-body">{it.d.getTime() === nowMs ? "ตอนนี้" : it.d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
              <WxIcon cond={it.h.cond} night={isNightAt(it.h.time)} className="w-10 h-10 mx-auto my-1.5" />
              <div className="text-[17px] font-extrabold">{Math.round(it.h.tc)}°</div>
              {effCap > 0 && (() => { const kwh = hourlyKwh(elevAt(it.d), it.h.cond, effCap, model.sky); return (
                <div className="text-[10px] font-bold text-pv-high leading-none mt-1 min-h-[12px] whitespace-nowrap">{kwh > 0.05 ? `~${kwh.toFixed(1)} หน่วย` : ""}</div>
              ); })()}
              <div className="text-[11px] font-bold text-grid min-h-[14px] leading-none mt-1">{it.h.rain > 0 ? `${(+it.h.rain).toFixed(1)}มม` : ""}</div>
            </div>
          ) : (
            <div key={i} className="shrink-0 snap-start w-[70px] py-3 px-2 text-center rounded-[18px] bg-[#fff6e0]/85 border border-[#f3d68c]/70">
              <div className="text-[13px] font-bold text-[#9a6500]">{it.d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
              <SunMarkIcon up={it.kind === "rise"} className="w-10 h-10 mx-auto my-1.5" />
              <div className="text-[11px] font-bold text-[#9a6500] leading-tight min-h-[28px] flex items-center justify-center">{it.kind === "rise" ? "อาทิตย์ขึ้น" : "อาทิตย์ตก"}</div>
            </div>
          )
        )}
      </div>

      {/* 7 days */}
      <div className={`${h2Mid} flex items-center gap-2`}>
        <span>7 วันข้างหน้า</span>
        {effCap > 0 && <InfoTip text="ตัวเลขสีส้ม (~หน่วย) คือไฟที่คาดว่าจะผลิตได้ในแต่ละวัน · แถบสีส้มคือปริมาณแสงแดด · ไอคอนบอกสภาพอากาศครับ" />}
      </div>
      <div className={`${card} px-5`}>
        {(w.daily || []).map((d, i) => {
          const si = solarInfo(d.cond, d.swdown);
          return (
            <div key={i} className="flex items-center gap-2.5 py-3.5 border-b border-line last:border-0">
              <div className="w-[50px] font-bold text-[14px] shrink-0">{DAYLBL[i] || shortDate(d.time)}</div>
              <WxIcon cond={d.cond} className="w-9 h-9 shrink-0" />
              <div className="flex-1 min-w-0">
                {/* lead with the production estimate (the headline); the icon carries the sky condition */}
                {effCap > 0 && fc[i]
                  ? <div className="text-[14px] font-extrabold tabnum text-pv-high leading-none">~{fc[i].kwh.toFixed(0)}<span className="text-[11px] text-muted font-semibold"> หน่วย</span></div>
                  : <div className="text-[13px] text-body truncate">{condText(d.cond)}</div>}
                <div className="h-1.5 rounded-full bg-canvas mt-1.5 overflow-hidden max-w-[120px]">
                  <div className="h-full rounded-full" style={{ width: `${si.pct}%`, background: amber }} />
                </div>
              </div>
              <div className="w-[38px] text-right text-[12px] font-bold text-grid shrink-0">{d.rain > 0 ? `${(+d.rain).toFixed(1)}` : "—"}</div>
              <div className="w-[66px] text-right text-[15px] font-extrabold shrink-0">{Math.round(d.tc_max)}°<small className="text-muted font-semibold"> {Math.round(d.tc_min)}°</small></div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-muted text-[13px] mt-4">ข้อมูล: {w.source === "tmd" ? "กรมอุตุนิยมวิทยา (TMD)" : "Open-Meteo (สำรอง)"}</p>
    </>
  );
}
