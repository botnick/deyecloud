import { useState } from "react";
import { SCENARIOS, scenarioByKey } from "../lib/scenarios";

// Dev-only scenario simulator. Lets you preview the whole UI in states the live
// system rarely produces. Toggle with the floating "ทดสอบ" button.
export function DevPanel({ current, onPick }: { current: string | null; onPick: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const cur = scenarioByKey(current);

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed right-3 bottom-[calc(104px+env(safe-area-inset-bottom))] z-50 px-3.5 py-2 rounded-full bg-title text-white text-[12px] font-bold shadow-[0_6px_18px_rgba(0,0,0,0.3)] active:scale-95"
      >
        {cur ? `ทดสอบ: ${cur.name.split(" ")[0]}` : "ทดสอบ"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-[24px] p-4 pb-[calc(20px+env(safe-area-inset-bottom))] max-h-[78vh] overflow-auto shadow-[0_-8px_30px_rgba(0,0,0,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 rounded-full bg-line mx-auto mb-3" />
            <div className="font-bold text-[18px] mb-1">จำลองสถานการณ์ (โหมดทดสอบ)</div>
            <div className="text-body text-[13px] mb-3">ข้อมูลจริงมาจาก API 100% — อันนี้แค่ป้อนค่าจำลองให้ดูว่า UI รับทุกสถานะไหวไหม</div>
            <button
              onClick={() => { onPick(null); setOpen(false); }}
              className={`w-full text-left px-4 py-3 rounded-2xl mb-2 font-semibold ${!current ? "bg-primary text-ink" : "bg-canvas text-title"}`}
            >
              ข้อมูลจริง (API)
            </button>
            {SCENARIOS.map((s) => (
              <button
                key={s.key}
                onClick={() => { onPick(s.key); setOpen(false); }}
                className={`w-full text-left px-4 py-3 rounded-2xl mb-2 font-semibold ${current === s.key ? "bg-primary text-ink" : "bg-canvas text-title"}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
