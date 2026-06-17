import type { Weather } from "../lib/api";
import { condText, solarInfo, DAYLBL, shortDate, isNightAt, isNightNow } from "../lib/weather";
import { WxIcon } from "../lib/wxicon";
import { card, cardP, plateP, h2First, h2Mid } from "../lib/ui";
import { SunPath } from "./SunPath";

const amber = "linear-gradient(90deg,#ffd84d,#ff9d00)";

// UV index → Thai level + color (WHO scale).
function uvInfo(uv: number): { level: string; color: string } {
  if (uv < 3) return { level: "ต่ำ", color: "#18a673" };
  if (uv < 6) return { level: "ปานกลาง", color: "#c79100" };
  if (uv < 8) return { level: "สูง", color: "#ef7d1a" };
  if (uv < 11) return { level: "สูงมาก", color: "#e8603c" };
  return { level: "อันตราย", color: "#8b5cf6" };
}

function Stat({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className={`${card} px-3 py-3 text-center`}>
      <div className="text-[12px] text-body">{label}</div>
      <div className="text-[15px] font-bold mt-0.5" style={color ? { color } : undefined}>
        {value}{sub && <span className="text-[12px] font-bold ml-1">{sub}</span>}
      </div>
    </div>
  );
}

export function WeatherView({ weather }: { weather: Weather | null }) {
  if (!weather || weather.temp == null) {
    return (
      <>
        <h2 className={h2First}>พยากรณ์อากาศ</h2>
        <div className="skeleton h-48 rounded-[20px]" />
      </>
    );
  }
  const w = weather;
  const night = isNightNow();
  const d0 = w.daily?.[0];
  const s = solarInfo(w.cond, d0?.swdown);
  const sun = w.sun;

  return (
    <>
      <h2 className={h2First}>พยากรณ์อากาศ</h2>

      {/* hero */}
      <div className={plateP}>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-body truncate">{w.place} · {night ? "กลางคืน" : "กลางวัน"}</div>
            <div className="text-[62px] font-extrabold leading-none mt-1 tabnum">{Math.round(w.temp)}°</div>
            <div className="text-[17px] font-bold mt-1">{condText(w.cond, night)}</div>
            {d0 && <div className="text-[14px] text-body mt-0.5">สูง {Math.round(d0.tc_max)}° · ต่ำ {Math.round(d0.tc_min)}°</div>}
          </div>
          <WxIcon cond={w.cond} night={night} className="w-[104px] h-[104px] shrink-0 [filter:drop-shadow(0_8px_14px_rgba(0,0,0,.12))]" />
        </div>
        {night ? (
          <div className="mt-4 rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: "#eef1f7" }}>
            <span className="text-[14px] font-bold text-[#5b6472]">กลางคืน · แผงหยุดผลิตชั่วคราว</span>
            <span className="text-[13px] font-semibold text-muted">รอแสงแดดพรุ่งนี้</span>
          </div>
        ) : (
          <div className="mt-4 bg-pv-soft rounded-2xl px-4 py-3">
            <div className="flex items-center justify-between text-[14px] font-bold text-[#9a6500]">
              <span>แสงแดดวันนี้ · {s.label}</span>
              <span>{s.pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/70 mt-2 overflow-hidden">
              <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${s.pct}%`, background: amber }} />
            </div>
          </div>
        )}
      </div>

      {/* sun & solar reception */}
      {sun && (
        <>
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
      <h2 className={h2Mid}>ราย 1 ชั่วโมง</h2>
      <div className="flex gap-2.5 overflow-x-auto hscroll snap-x pb-2.5 -mx-[18px] px-[18px]">
        {(w.hourly || []).slice(0, 12).map((h, i) => (
          <div key={i} className="shrink-0 snap-start w-[70px] py-3 px-2 text-center rounded-[18px] bg-white/55 border border-white/70">
            <div className="text-[13px] font-bold text-body">{i === 0 ? "ตอนนี้" : new Date(h.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</div>
            <WxIcon cond={h.cond} night={isNightAt(h.time)} className="w-10 h-10 mx-auto my-1.5" />
            <div className="text-[17px] font-extrabold">{Math.round(h.tc)}°</div>
            <div className="text-[11px] font-bold text-grid min-h-[14px] leading-none">{h.rain > 0 ? `${(+h.rain).toFixed(1)}มม` : ""}</div>
          </div>
        ))}
      </div>

      {/* 7 days */}
      <h2 className={h2Mid}>7 วันข้างหน้า</h2>
      <div className={`${card} px-5`}>
        {(w.daily || []).map((d, i) => {
          const si = solarInfo(d.cond, d.swdown);
          return (
            <div key={i} className="flex items-center gap-3 py-3.5 border-b border-line last:border-0">
              <div className="w-[58px] font-bold text-[14px]">{DAYLBL[i] || shortDate(d.time)}</div>
              <WxIcon cond={d.cond} className="w-10 h-10 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-body truncate">{condText(d.cond)}</div>
                <div className="h-1.5 rounded-full bg-canvas mt-1 overflow-hidden max-w-[110px]">
                  <div className="h-full rounded-full" style={{ width: `${si.pct}%`, background: amber }} />
                </div>
              </div>
              <div className="w-[46px] text-right text-[12px] font-bold text-grid">{d.rain > 0 ? `${(+d.rain).toFixed(1)}` : "—"}</div>
              <div className="w-[78px] text-right text-[15px] font-extrabold">{Math.round(d.tc_max)}°<small className="text-muted font-semibold"> {Math.round(d.tc_min)}°</small></div>
            </div>
          );
        })}
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-2.5 mt-3.5">
        <Stat label="ความชื้น" value={`${Math.round(w.humidity)}%`} />
        <Stat label="ลม" value={w.wind != null ? `${w.wind} กม/ชม` : "—"} />
        <Stat label="ฝน" value={w.rain != null ? `${(+w.rain).toFixed(1)} มม` : "—"} />
        {w.uv != null
          ? <Stat label="ดัชนียูวี (UV)" value={String(w.uv)} color={uvInfo(w.uv).color} sub={uvInfo(w.uv).level} />
          : <Stat label="ดัชนียูวี (UV)" value="—" />}
      </div>

      <p className="text-center text-muted text-[13px] mt-4">ข้อมูล: {w.source === "tmd" ? "กรมอุตุนิยมวิทยา (TMD)" : "Open-Meteo (สำรอง)"}</p>
    </>
  );
}
