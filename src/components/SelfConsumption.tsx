import type { Latest } from "../lib/api";
import { cardP } from "../lib/ui";

/** One slice of a stacked bar. */
interface Seg {
  label: string;
  color: string;
  value: number;
}

const clamp0 = (n: number): number => (n > 0 ? n : 0);
const pctOf = (value: number, total: number): number =>
  total > 0 ? (value / total) * 100 : 0;

/** A labeled group: title + total + stacked bar + legend. */
function BarGroup({ title, total, segs }: { title: string; total: number; segs: Seg[] }) {
  const hasData = total > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-title">{title}</span>
        <span className="text-[16px] font-extrabold tabnum text-title">
          {total.toFixed(1)} <span className="text-[12px] font-semibold text-body">kWh</span>
        </span>
      </div>

      {/* stacked bar */}
      <div
        className="mt-2 flex h-3 w-full overflow-hidden rounded-full"
        style={{ background: "#eeeeee" }}
        role="img"
        aria-label={title}
      >
        {hasData &&
          segs.map((s, i) => {
            const w = pctOf(s.value, total);
            if (w <= 0) return null;
            return (
              <span
                key={i}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${w}%`,
                  background: s.color,
                  marginLeft: i === 0 ? 0 : 1,
                }}
              />
            );
          })}
      </div>

      {/* legend */}
      {hasData ? (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {segs.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-[12px] text-body">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span>{s.label}</span>
              <span className="tabnum text-title">
                {pctOf(s.value, total).toFixed(0)}% · {s.value.toFixed(1)} kWh
              </span>
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-[13px] text-body">—</div>
      )}
    </div>
  );
}

export function SelfConsumption({ latest }: { latest: Latest }) {
  const { genToday, useToday, buyToday, sellToday, chargeToday, dischargeToday } = latest;

  // GROUP 1 — การใช้ไฟ: where the consumed energy came from (source entity colors).
  const useSegs: Seg[] = [
    { label: "จากแผงโซลาร์", color: "#f5a623", value: clamp0(useToday - buyToday - dischargeToday) },
    { label: "จากแบตเตอรี่", color: "#18a673", value: clamp0(dischargeToday) },
    { label: "จากการไฟฟ้า", color: "#8b5cf6", value: clamp0(buyToday) },
  ];

  // GROUP 2 — การผลิต: where the produced energy went (destination entity colors).
  const genSegs: Seg[] = [
    { label: "ใช้เอง", color: "#0d4add", value: clamp0(genToday - chargeToday - sellToday) },
    { label: "ชาร์จแบต", color: "#18a673", value: clamp0(chargeToday) },
    { label: "ไฟย้อน", color: "#8b5cf6", value: clamp0(sellToday) },
  ];

  return (
    <div className={cardP}>
      <h2 className="text-[18px] font-bold text-title">การหมุนเวียนพลังงาน</h2>

      <div className="mt-4 space-y-5">
        <BarGroup title="การใช้ไฟ" total={clamp0(useToday)} segs={useSegs} />
        <BarGroup title="การผลิต" total={clamp0(genToday)} segs={genSegs} />
      </div>
    </div>
  );
}
