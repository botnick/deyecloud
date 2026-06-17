import type { Latest, Weather } from "../lib/api";
import { fmtKwh, timeStr } from "../lib/format";
import { condText, isNightNow } from "../lib/weather";
import { IconChevron, IconCheck, IconAlert } from "../lib/icons";
import { WxIcon } from "../lib/wxicon";
import { card, cardP, h2Mid } from "../lib/ui";
import { FlowDiagram } from "./FlowDiagram";
import { ProductionRing } from "./ProductionRing";

function Skeleton() {
  return (
    <>
      <div className="h-[80px] rounded-[20px] bg-white/70 animate-pulse" />
      <div className="h-[320px] rounded-[20px] bg-white/70 animate-pulse mt-7" />
    </>
  );
}

export function HomeView({ latest, weather, capacity, onWeather, onDevice }: { latest: Latest | null; weather: Weather | null; capacity?: number; onWeather: () => void; onDevice: () => void }) {
  if (!latest) return <Skeleton />;
  const ok = (latest.warningStatus || "NORMAL") === "NORMAL";
  const potential = capacity ? capacity * 4.5 : 0; // ~peak-sun-hours in Thailand
  const prodPct = potential > 0 ? Math.round(Math.min(100, (latest.genToday / potential) * 100)) : Math.min(100, Math.round(latest.genToday));
  const savings = Math.max(0, Math.round((latest.useToday - latest.buyToday) * 4.4)); // self-consumed kWh × tariff

  return (
    <>
      {/* status */}
      <div className={`${cardP} flex items-center gap-3`}>
        <span className={`grid place-items-center w-11 h-11 rounded-full shrink-0 text-white ${ok ? "bg-ok" : "bg-warn"}`}>
          {ok ? <IconCheck className="w-6 h-6" /> : <IconAlert className="w-6 h-6" />}
        </span>
        <div className="min-w-0">
          <div className="text-[18px] font-bold leading-tight">{ok ? "ระบบทำงานปกติ" : "มีการแจ้งเตือน"}</div>
          <div className="text-[14px] text-body mt-0.5">อัปเดตล่าสุด {timeStr(latest.updatedAt)}</div>
        </div>
      </div>

      {/* production today */}
      <h2 className={h2Mid}>ผลิตไฟวันนี้</h2>
      <div className={cardP}>
        <div className="w-[160px] mx-auto mb-1.5">
          <ProductionRing pct={prodPct} center={fmtKwh(latest.genToday)} unit="หน่วยวันนี้" />
        </div>
        <div className="text-center text-[13px] text-body mb-4">ผลิตได้ {prodPct}% ของศักยภาพวันนี้</div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-canvas rounded-2xl px-4 py-3">
            <div className="text-[12px] text-body">ขนาดระบบ</div>
            <div className="text-[18px] font-extrabold tabnum mt-0.5">{capacity ? `${capacity} kW` : "—"}</div>
          </div>
          <div className="bg-canvas rounded-2xl px-4 py-3">
            <div className="text-[12px] text-body">ประหยัดวันนี้</div>
            <div className="text-[18px] font-extrabold tabnum mt-0.5 text-secondary">฿{savings}</div>
          </div>
        </div>
        <button onClick={onDevice} className="mt-3.5 w-full h-[52px] bg-primary rounded-[16px] flex items-center justify-center gap-2 text-[16px] font-bold text-ink shadow-[0_8px_20px_-7px_rgba(255,204,0,0.6)] active:scale-[.98] transition-transform">
          ดูรายละเอียดเครื่อง
          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
        </button>
      </div>

      {/* live energy flow */}
      <h2 className={h2Mid}>พลังงานตอนนี้</h2>
      <div className={`${card} px-2 py-3`}>
        <FlowDiagram latest={latest} />
      </div>

      {/* weather */}
      {weather && weather.temp != null && (
        <>
          <h2 className={h2Mid}>อากาศ</h2>
          <button onClick={onWeather} className={`${cardP} w-full text-left flex items-center gap-4 active:scale-[.99] transition-transform`}>
            <WxIcon cond={weather.cond} night={isNightNow()} className="w-[52px] h-[52px] shrink-0" />
            <div className="min-w-0">
              <div className="text-[24px] font-extrabold leading-none">{Math.round(weather.temp)}°</div>
              <div className="text-[14px] text-body mt-1 truncate">{condText(weather.cond, isNightNow())} · {weather.place}</div>
            </div>
            <div className="ml-auto flex items-center gap-1 text-[14px] font-semibold text-muted shrink-0">ดู 7 วัน<IconChevron className="w-5 h-5" /></div>
          </button>
        </>
      )}
    </>
  );
}
