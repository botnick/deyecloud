import type { Latest, Weather } from "../lib/api";
import { fmtKwh, timeStr } from "../lib/format";
import { IconAlert } from "../lib/icons";
import { cardP, h2Mid } from "../lib/ui";
import { ELECTRICITY_RATE } from "../lib/config";
import { HeroHome } from "./HeroHome";
import { ProductionRing } from "./ProductionRing";

function Skeleton() {
  return (
    <>
      <div className="skeleton rounded-[22px]" style={{ aspectRatio: "390 / 404" }} />
      <div className="skeleton h-[320px] rounded-[20px] mt-7" />
    </>
  );
}

export function HomeView({ latest, weather, capacity, stationName, onDevice }: { latest: Latest | null; weather: Weather | null; capacity?: number; stationName?: string; onDevice: () => void }) {
  if (!latest) return <Skeleton />;
  const ok = (latest.warningStatus || "NORMAL") === "NORMAL";
  const potential = capacity ? capacity * 4.5 : 0; // ~peak-sun-hours in Thailand
  const prodPct = potential > 0 ? Math.round(Math.min(100, (latest.genToday / potential) * 100)) : Math.min(100, Math.round(latest.genToday));
  const savings = Math.max(0, Math.round((latest.useToday - latest.buyToday) * ELECTRICITY_RATE)); // self-consumed kWh × tariff

  return (
    <>
      {/* live house hero — the whole system (energy flow + weather + day/night) at a glance */}
      <HeroHome latest={latest} weather={weather} title={stationName} />
      <div className="mt-2.5 mb-7 text-center text-[12px] text-muted">อัปเดตล่าสุด {timeStr(latest.updatedAt)}</div>

      {/* alert surfaces only when something is wrong — keeps the happy path clean */}
      {!ok && (
        <button onClick={onDevice} className={`${cardP} w-full text-left mb-7 flex items-center gap-3 border border-warn/25 active:scale-[.99] transition-transform`}>
          <span className="grid place-items-center w-11 h-11 rounded-full shrink-0 text-white bg-warn"><IconAlert className="w-6 h-6" /></span>
          <div className="min-w-0">
            <div className="text-[17px] font-bold leading-tight">มีการแจ้งเตือน</div>
            <div className="text-[14px] text-body mt-0.5">ระบบมีสถานะผิดปกติ · แตะดูรายละเอียด</div>
          </div>
        </button>
      )}

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
    </>
  );
}
