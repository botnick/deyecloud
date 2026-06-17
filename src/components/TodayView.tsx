import type { Latest } from "../lib/api";
import { fmtKwh } from "../lib/format";
import { IconSun, IconHouse, IconGrid, IconBattery } from "../lib/icons";
import { cardP, plateP, h2First, h2Mid } from "../lib/ui";
import { Tile } from "./Tile";
import { AnalysisCard } from "./AnalysisCard";
import { SelfConsumption } from "./SelfConsumption";

const C = 2 * Math.PI * 54;

export function TodayView({ latest, capacity }: { latest: Latest | null; capacity?: number }) {
  if (!latest) return <div className="skeleton h-40 rounded-[20px]" />;
  const self = Math.round(latest.selfSufficiency || 0);
  const fromGrid = Math.max(0, 100 - self);

  return (
    <>
      <h2 className={h2First}>สรุปวันนี้</h2>
      <div className={`${plateP} flex items-center`}>
        <div>
          <div className="text-[46px] font-extrabold leading-none">
            <span className="tabnum">{fmtKwh(latest.genToday)}</span>
            <span className="text-[22px] text-muted font-bold"> หน่วย</span>
          </div>
          <div className="text-[15px] text-body mt-1.5">ผลิตไฟได้วันนี้</div>
        </div>
        <span className="ml-auto w-[54px] h-[54px] rounded-2xl bg-pv-soft text-pv grid place-items-center"><span className="w-7 h-7 block"><IconSun /></span></span>
      </div>

      <div className="grid grid-cols-2 gap-3.5 mt-3.5">
        <Tile tone="use" icon={<IconHouse />} label="ใช้ไฟวันนี้" value={latest.useToday} format={fmtKwh} unit="หน่วย" />
        <Tile tone="grid" icon={<IconGrid />} label="ซื้อไฟ" value={latest.buyToday} format={fmtKwh} unit="หน่วย" note="จากการไฟฟ้า" />
        <Tile tone="grid" icon={<IconGrid />} label="ไฟย้อน" value={latest.sellToday} format={fmtKwh} unit="หน่วย" note="ไหลกลับระบบ" />
        <Tile tone="batt" icon={<IconBattery />} label="ชาร์จแบต" value={latest.chargeToday} format={fmtKwh} unit="หน่วย" note="วันนี้" />
      </div>

      <h2 className={h2Mid}>พึ่งพาไฟตัวเอง</h2>
      <div className={`${cardP} flex items-center gap-5`}>
        <svg viewBox="0 0 130 130" className="w-[130px] h-[130px] shrink-0">
          <circle cx="65" cy="65" r="54" fill="none" stroke="var(--color-grid-soft)" strokeWidth="16" />
          <circle cx="65" cy="65" r="54" fill="none" stroke="var(--color-pv)" strokeWidth="16" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - self / 100)} transform="rotate(-90 65 65)"
            style={{ transition: "stroke-dashoffset .7s ease" }} />
          <text x="65" y="60" textAnchor="middle" fontSize="30" fontWeight="800" fill="var(--color-title)">{self}%</text>
          <text x="65" y="82" textAnchor="middle" fontSize="13" fill="var(--color-body)">พึ่งตัวเอง</text>
        </svg>
        <div className="grid gap-3">
          <div className="flex items-center gap-2.5 text-[15px]"><span className="w-3.5 h-3.5 rounded-[5px] bg-pv" /><div>ใช้ไฟที่ผลิตเอง<br /><b className="text-lg">{self}%</b></div></div>
          <div className="flex items-center gap-2.5 text-[15px]"><span className="w-3.5 h-3.5 rounded-[5px] bg-grid" /><div>ซื้อจากการไฟฟ้า<br /><b className="text-lg">{fromGrid}%</b></div></div>
        </div>
      </div>

      <div className="mt-7">
        <SelfConsumption latest={latest} />
      </div>

      <h2 className={h2Mid}>วิเคราะห์</h2>
      <AnalysisCard latest={latest} capacity={capacity} />
    </>
  );
}
