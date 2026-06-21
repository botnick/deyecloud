import { useEffect, useState } from "react";
import { cardP } from "../lib/ui";
import { DEFAULT_SETTINGS, type Settings } from "../lib/settings";
import type { RawSettings } from "../lib/api";

// Inline economics editor (shown in the Lifetime tab). Drives the ฿ figures app-wide.
// Empty input = "use default"; the system cost is optional and unlocks payback when set.
function Field({ label, hint, value, placeholder, onChange }: {
  label: string; hint?: string; value: string; placeholder: string; onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-[13px] font-bold text-title">{label}</div>
      {hint && <div className="text-[11.5px] text-muted mt-0.5 leading-snug">{hint}</div>}
      <input
        type="number" inputMode="decimal" min="0" step="any" value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full h-11 rounded-xl bg-canvas border border-line px-3.5 text-[16px] font-semibold tabnum outline-none focus:border-primary transition-colors"
      />
    </label>
  );
}

export function SettingsCard({ settings, raw, onSave }: {
  settings: Settings;
  raw: RawSettings;
  onSave: (patch: RawSettings) => Promise<void> | void;
}) {
  // Local draft as strings (so a field can be blank = "use default"); blank persists as null.
  const str = (v: number | null | undefined) => (v == null ? "" : String(v));
  const [rate, setRate] = useState(str(raw.rate));
  const [sell, setSell] = useState(str(raw.sellRate));
  const [cost, setCost] = useState(str(raw.systemCost));
  const [saved, setSaved] = useState(false);
  // Re-sync the draft if settings arrive/refresh from the server after mount.
  useEffect(() => { setRate(str(raw.rate)); setSell(str(raw.sellRate)); setCost(str(raw.systemCost)); }, [raw.rate, raw.sellRate, raw.systemCost]);

  const dirty = rate !== str(raw.rate) || sell !== str(raw.sellRate) || cost !== str(raw.systemCost);
  const submit = async () => {
    const n = (s: string) => (s.trim() === "" ? null : Number(s));
    await onSave({ rate: n(rate) ?? undefined, sellRate: n(sell) ?? undefined, systemCost: n(cost) });
    setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  return (
    <section className={`${cardP} mt-3`}>
      <div className="font-bold text-[17px] text-title">ตั้งค่าการคำนวณ</div>
      <div className="text-[12.5px] text-muted mt-0.5 leading-snug">ใช้คำนวณเงินที่ประหยัด/ขายคืน และระยะคืนทุน (เก็บไว้ที่ระบบ ใช้ร่วมทุกเครื่อง)</div>
      <div className="grid gap-3.5 mt-3.5">
        <Field label="ค่าไฟ (฿/หน่วย)" hint={`ถ้าเว้นว่างจะใช้ค่าเริ่มต้น ${DEFAULT_SETTINGS.rate}`} value={rate} placeholder={String(DEFAULT_SETTINGS.rate)} onChange={setRate} />
        <Field label="ค่าขายคืน (฿/หน่วย)" hint="ราคาที่การไฟฟ้ารับซื้อไฟที่ไหลย้อน (ถ้าไม่ขายใส่ 0)" value={sell} placeholder={String(DEFAULT_SETTINGS.sellRate)} onChange={setSell} />
        <Field label="ทุนติดตั้งระบบ (฿)" hint="ใส่เพื่อดูระยะคืนทุน — ไม่ใส่ก็ได้" value={cost} placeholder="เช่น 250000" onChange={setCost} />
      </div>
      <button onClick={submit} disabled={!dirty && !saved}
        className={`mt-4 w-full h-12 rounded-2xl text-[16px] font-bold transition-all active:scale-[.98] ${saved ? "bg-secondary text-white" : dirty ? "bg-primary text-ink shadow-[0_8px_20px_-7px_rgba(255,204,0,0.6)]" : "bg-canvas text-muted"}`}>
        {saved ? "บันทึกแล้ว ✓" : "บันทึก"}
      </button>
    </section>
  );
}
