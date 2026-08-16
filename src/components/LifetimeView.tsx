import { useEffect, useState } from "react";
import { getTotals, type Totals } from "../lib/api";
import { useSettings } from "../lib/settings";
import { savingsOf, co2Of, treesOf, baht } from "../lib/economics";
import { cardP, plate, h2Mid } from "../lib/ui";
import { IconSun } from "../lib/icons";
import { BarChart, Legend } from "./Chart";
import { InfoTip } from "./InfoTip";
import { SettingsCard } from "./SettingsCard";

const kInt = (n: number) => Math.round(Math.max(0, n)).toLocaleString("th-TH");
const thDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("th-TH-u-ca-gregory", { day: "numeric", month: "short", year: "numeric" });

function Stat({ label, value, unit, color, sub, info }: { label: string; value: string; unit?: string; color?: string; sub?: string; info?: string }) {
  return (
    <div className="bg-canvas rounded-2xl px-4 py-3.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[12px] text-body">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className="text-[20px] font-extrabold tabnum mt-0.5 leading-none" style={color ? { color } : undefined}>
        {value}{unit && <span className="text-[12px] text-body font-semibold ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[11.5px] text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function LifetimeView({ active }: { active: boolean }) {
  const [t, setT] = useState<Totals | null>(null);
  const [err, setErr] = useState(false);
  const { settings, raw, save } = useSettings();

  useEffect(() => {
    if (!active) return;
    setErr(false);
    getTotals().then(setT).catch(() => setErr(true));
  }, [active]);

  if (err) return <div className={`${plate} p-4 mt-3`}><p className="text-center text-muted py-12">โหลดข้อมูลไม่ได้ ลองใหม่อีกครั้ง</p></div>;
  if (!t) return <div className="skeleton h-[320px] rounded-[20px] mt-3" />;
  if (!t.days) return <div className={`${plate} p-4 mt-3`}><p className="text-center text-muted py-12">ยังไม่มีข้อมูลสะสม<br />ระบบกำลังเริ่มบันทึก — กลับมาดูใหม่ในอีกสักพักครับ</p></div>;

  const production = t.genTotal > 0 ? t.genTotal : t.gen;       // lifetime kWh
  const co2 = co2Of(production);
  const trees = treesOf(co2);
  const saved = savingsOf({ use: t.use, buy: t.buy, sell: t.sell }, settings);

  // payback (only when the user entered a system cost)
  const cost = settings.systemCost;
  const yearsElapsed = Math.max(t.days / 365, 0.05);
  const annual = saved / yearsElapsed;
  const paid = cost && cost > 0;
  const pct = paid ? Math.min(100, (saved / cost!) * 100) : 0;
  const yearsLeft = paid && annual > 0 && saved < cost! ? (cost! - saved) / annual : 0;

  const years = (t.years || []).filter((y) => y.gen > 0 || y.use > 0);

  return (
    <>
      {/* headline — lifetime production */}
      <section className={`${cardP} mt-3 text-center`}>
        <span className="inline-grid place-items-center w-12 h-12 rounded-2xl mx-auto" style={{ background: "var(--color-pv-soft)", color: "var(--color-pv)" }}>
          <IconSun className="w-7 h-7" />
        </span>
        <div className="text-[13px] text-body mt-2.5">ผลิตไฟสะสมตลอดการใช้งาน</div>
        <div className="text-[40px] font-extrabold tabnum leading-none mt-1 text-pv-high">{kInt(production)}<span className="text-[16px] text-body font-bold ml-1.5">หน่วย</span></div>
        {t.firstDay && <div className="text-[12.5px] text-muted mt-2">ตั้งแต่ {thDate(t.firstDay)} · รวม {kInt(t.days)} วัน</div>}
      </section>

      {/* impact stats */}
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        <Stat label="ประหยัดค่าไฟรวม" value={baht(saved)} color="var(--color-secondary)" sub={`ที่ ${settings.rate} บาท/หน่วย`}
          info={`รวมเงินที่ประหยัดได้ตั้งแต่เริ่มบันทึก = ไฟที่ใช้เองจากระบบ × ค่าไฟ ${settings.rate} บาท/หน่วย${settings.sellRate > 0 ? ` + ขายคืน ${settings.sellRate} บาท/หน่วย` : ""}`} />
        <Stat label="ลดคาร์บอน (CO₂)" value={kInt(co2)} unit="กก." color="#18a673" sub={`≈ ปลูกต้นไม้ ${kInt(trees)} ต้น/ปี`}
          info="คาร์บอนที่ลดได้ = ไฟที่ผลิตจากแสงอาทิตย์ทั้งหมด × 0.5 กก./หน่วย (ค่ามาตรฐานไฟไทย) เทียบเท่าการดูดซับของต้นไม้ ~21 กก./ต้น/ปี" />
      </div>

      {/* payback — only when a system cost is set */}
      {paid && (
        <section className={`${cardP} mt-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-[16px] text-title">ระยะคืนทุน</span>
              <InfoTip text="เทียบเงินที่ประหยัดสะสมกับทุนติดตั้งที่ใส่ไว้ · ปีที่คาดคืนทุนครบ คำนวณจากอัตราประหยัดเฉลี่ยต่อปีที่ผ่านมา" />
            </div>
            <div className="text-[15px] font-extrabold tabnum text-secondary">{Math.round(pct)}%</div>
          </div>
          <div className="h-2.5 rounded-full bg-canvas mt-2.5 overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#34d399,#059669)" }} />
          </div>
          <div className="text-[13px] text-body mt-2.5 leading-snug">
            {saved >= cost!
              ? <>คืนทุนครบแล้ว 🎉 — ตอนนี้ประหยัดเกินทุน {baht(saved - cost!)} แล้ว</>
              : <>คืนทุนแล้ว {baht(saved)} จาก {baht(cost!)} · คาดคืนทุนครบในอีก ~{yearsLeft.toFixed(1)} ปี (ประหยัดเฉลี่ย {baht(annual)}/ปี)</>}
          </div>
        </section>
      )}

      {/* per-year production vs use */}
      {years.length > 0 && (
        <>
          <h2 className={h2Mid}>รายปี</h2>
          <div className={`${plate} p-4`}>
            <BarChart labels={years.map((y) => y.year)} series={[
              { color: "var(--color-pv)", data: years.map((y) => y.gen) },
              { color: "var(--color-use)", data: years.map((y) => y.use) },
            ]} />
            <Legend items={[["ผลิต (หน่วย)", "var(--color-pv)"], ["ใช้ (หน่วย)", "var(--color-use)"]]} />
          </div>
        </>
      )}

      {/* economics editor — drives every ฿ figure in the app */}
      <SettingsCard settings={settings} raw={raw} onSave={save} />
    </>
  );
}
