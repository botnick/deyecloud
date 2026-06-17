import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getDevice, type Device, type DeviceData, type Latest } from "../lib/api";
import { groupDevice, INVERTER_TYPE_TH } from "../lib/device";
import { useSmartPoll } from "../lib/usePoll";
import { timeStr } from "../lib/format";
import { IconChevron, IconBack } from "../lib/icons";
import { card, cardP, h2 } from "../lib/ui";
import { FlowDiagram } from "./FlowDiagram";

const tcol = (t: number) => (t >= 60 ? "#e8603c" : t >= 45 ? "#d98c00" : "#18a673");
function TempChip({ label, t }: { label: string; t: number }) {
  const c = tcol(t);
  const pct = Math.max(6, Math.min(100, (t / 80) * 100)); // 0–80°C scale
  return (
    <div className={`${card} px-4 py-3.5`}>
      <div className="flex items-center gap-2 text-[13px] text-body">
        <span className="grid place-items-center w-6 h-6 rounded-lg shrink-0" style={{ background: `${c}22`, color: c }}>
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z" /></svg>
        </span>
        <span className="leading-tight">{label}</span>
      </div>
      <div className="text-[24px] font-extrabold tabnum mt-1.5 leading-none" style={{ color: c }}>{t.toFixed(1)}<span className="text-[14px] font-bold ml-0.5">°C</span></div>
      <div className="mt-2.5 h-1.5 rounded-full bg-line overflow-hidden"><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: c }} /></div>
    </div>
  );
}

// keys rendered inside the per-phase tables — excluded from the key/value lists
const TABLE_KEYS =
  /^(DCVoltagePV|DCCurrentPV|DCPowerPV)[1-4]$|^AC(Voltage|Current)(RUA|SVB|TWC)$|^InverterOutputPowerL[1-3]$|^Grid(Voltage|Current|Power)L[1-3]$|^LoadVoltageL[1-3]$|^LoadPhasePower[ABC]$|^Gen(Voltage|Power)L[1-3]$/;

/* Deye-style data table — colored category tag in the header, phase rows below.
   Values are flush-RIGHT so the last column lines up with the scalar rows'
   right edge (keeps the whole card balanced, not left-heavy).
   cols = column names (without the row-label column); each row = [label, ...values]. */
function DataTable({ tag, tagColor, cols, rows }: { tag: string; tagColor: string; cols: string[]; rows: string[][] }) {
  const tmpl = `minmax(40px,auto) repeat(${cols.length}, 1fr)`;
  return (
    <div>
      <div className="grid gap-x-3 pb-2.5 items-center" style={{ gridTemplateColumns: tmpl }}>
        <div><span className="inline-block px-2 py-[3px] rounded-md text-[12px] font-bold text-white leading-none" style={{ background: tagColor }}>{tag}</span></div>
        {cols.map((c, i) => <div key={i} className="text-[12px] text-muted font-semibold text-right">{c}</div>)}
      </div>
      {rows.map((r, ri) => (
        <div key={ri} className="grid gap-x-3 py-2.5 border-t border-line items-baseline" style={{ gridTemplateColumns: tmpl }}>
          <div className="font-bold text-body text-[14px]">{r[0]}</div>
          {r.slice(1).map((c, ci) => <div key={ci} className="font-semibold tabnum text-[14px] text-right">{c}</div>)}
        </div>
      ))}
    </div>
  );
}

/* balanced reading list — label left (muted), value flush-right (bold), hairline rows */
function KVList({ items }: { items: DeviceData[] }) {
  return (
    <div>
      {items.map((it, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2.5 border-t border-line first:border-t-0">
          <span className="text-[14px] text-body leading-snug">{it.key}</span>
          <span className="text-[15px] font-bold tabnum whitespace-nowrap shrink-0">
            {it.value}
            <span className="text-[12px] text-muted font-medium ml-0.5">{it.unit}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, count, open, onToggle, children }: { title: string; count?: number; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className={`${card} mt-3.5 overflow-hidden`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-5 text-left">
        <span className="text-[17px] font-bold">{title}</span>
        <span className="flex items-center gap-2 text-muted text-[13px]">{count != null ? `${count} ค่า` : ""}<IconChevron className={`w-5 h-5 transition-transform duration-300 ${open ? "rotate-90" : ""}`} /></span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden"><div className="px-5 pb-5">{children}</div></div>
      </div>
    </div>
  );
}

export function DeviceView({ latest, active, stationId, onBack }: { latest: Latest | null; active: boolean; stationId?: number | null; onBack: () => void }) {
  const [dev, setDev] = useState<Device | null>(null);
  const [err, setErr] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({ pv: true, ac: true, grid: true, load: true });

  // Monotonic request id — a stale in-flight fetch (after a station switch or tab
  // wake) is ignored so it can't overwrite the current inverter's readings.
  const reqRef = useRef(0);
  const load = useCallback(() => {
    const id = ++reqRef.current;
    getDevice(stationId)
      .then((d) => { if (id === reqRef.current) { setDev(d); setErr(!!d.error); } })
      .catch(() => { if (id === reqRef.current) setErr(true); });
  }, [stationId]);

  useEffect(() => {
    if (!active) return;
    setDev(null); setErr(false); // reset when (re)opened or station changes
    load();
  }, [active, load]);

  // Keep the inverter readings live while open; pauses when the tab is hidden.
  useSmartPoll(load, 60000, active);

  if (!dev || dev.error || err) {
    const failed = err || !!dev?.error;
    return (
      <>
        <div className="flex items-center gap-1.5 mt-1 mb-3.5">
          <button onClick={onBack} aria-label="กลับหน้าหลัก" className="w-10 h-10 -ml-1.5 rounded-full grid place-items-center text-title active:bg-line transition-colors">
            <IconBack className="w-6 h-6" />
          </button>
          <h2 className={h2}>เครื่องแปลงไฟ (Inverter)</h2>
        </div>
        {failed ? (
          <div className={`${cardP} text-center py-8`}>
            <div className="text-[16px] font-bold text-title">ดึงข้อมูลเครื่องไม่ได้</div>
            <div className="text-[14px] text-body mt-1">เชื่อมต่อระบบไม่ได้ในขณะนี้</div>
            <button onClick={load} className="mt-4 h-11 px-5 rounded-xl bg-primary text-ink font-bold active:scale-95 transition-transform">ลองใหม่</button>
          </div>
        ) : (
          <div className="space-y-3.5">
            <div className="skeleton h-[88px] rounded-[20px]" />
            <div className="grid grid-cols-2 gap-3">
              <div className="skeleton h-[76px] rounded-2xl" /><div className="skeleton h-[76px] rounded-2xl" />
              <div className="skeleton h-[76px] rounded-2xl" /><div className="skeleton h-[76px] rounded-2xl" />
            </div>
            <div className="skeleton h-[300px] rounded-[20px]" />
            <div className="skeleton h-[60px] rounded-[20px]" /><div className="skeleton h-[60px] rounded-[20px]" />
          </div>
        )}
      </>
    );
  }

  const byKey = (k: string) => dev.dataList.find((d) => d.key === k);
  const cell = (k: string) => { const d = byKey(k); return d ? `${d.value}${d.unit ? " " + d.unit : ""}` : "—"; };
  const has = (k: string) => !!byKey(k);
  const numOf = (re: RegExp) => { const r = dev.dataList.find((d) => re.test(d.key)); const n = r ? Number(r.value) : NaN; return Number.isNaN(n) ? undefined : n; };
  const temps = { inv: numOf(/AC Temperature|Inverter.*[Tt]emp|Radiator|IGBT|Heat ?[Ss]ink/), batt: numOf(/Temperature.*Battery|Battery.*[Tt]emp/) };
  const freq = numOf(/[Ff]requenc/);

  // Deye-dashboard summary tiles (real values; "—" when unavailable)
  const summary = [
    { label: "ผลิตวันนี้", v: latest ? latest.genToday.toFixed(2) : "—", u: "kWh", a: "#3aa0e6", b: "#2d79cf" },
    { label: "ผลิตสะสม", v: latest && latest.genTotal ? latest.genTotal.toFixed(0) : "—", u: "kWh", a: "#2bb6a8", b: "#1d9486" },
    { label: "ความถี่ไฟ", v: freq != null ? freq.toFixed(2) : "—", u: "Hz", a: "#7b86e8", b: "#5860d4" },
    { label: "กำลังผลิตตอนนี้", v: latest ? String(Math.round(latest.genPower)) : "—", u: "W", a: "#f3a64c", b: "#ed8a36" },
  ];

  // per-phase tables (rows = phases, columns = แรงดัน/กระแส/กำลัง)
  const pvRows = [1, 2, 3, 4].filter((i) => has(`DCVoltagePV${i}`)).map((i) => [`PV${i}`, cell(`DCVoltagePV${i}`), cell(`DCCurrentPV${i}`), cell(`DCPowerPV${i}`)]);
  const acDefs: [string, string, number][] = [["L1", "RUA", 1], ["L2", "SVB", 2], ["L3", "TWC", 3]];
  const acRows = acDefs.filter(([, s]) => has(`ACVoltage${s}`)).map(([ph, s, n]) => [ph, cell(`ACVoltage${s}`), cell(`ACCurrent${s}`), cell(`InverterOutputPowerL${n}`)]);
  const gridRows = [1, 2, 3].filter((i) => has(`GridVoltageL${i}`)).map((i) => [`L${i}`, cell(`GridVoltageL${i}`), cell(`GridCurrentL${i}`), cell(`GridPowerL${i}`)]);
  const loadDefs: [string, string][] = [["L1", "A"], ["L2", "B"], ["L3", "C"]];
  const loadRows = loadDefs.filter(([i]) => has(`LoadVoltage${i}`)).map(([i, abc]) => [i, cell(`LoadVoltage${i}`), cell(`LoadPhasePower${abc}`)]);
  const genRows = [1, 2, 3].filter((i) => has(`GenVoltageL${i}`) || has(`GenPowerL${i}`)).map((i) => [`L${i}`, cell(`GenVoltageL${i}`), cell(`GenPowerL${i}`)]);

  // remaining scalar readings, grouped + Thai-labelled (table keys removed)
  const grouped = groupDevice(dev.dataList.filter((d) => !TABLE_KEYS.test(d.key)));
  const gItems = (id: string) => grouped.find((g) => g.id === id)?.items || [];
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  const sections: { id: string; title: string; tag?: string; tagColor?: string; cols?: string[]; rows?: string[][] }[] = [
    { id: "pv", title: "แผงโซลาร์ (PV)", tag: "DC", tagColor: "#f5a623", cols: ["แรงดัน", "กระแส", "กำลัง"], rows: pvRows },
    { id: "ac", title: "ไฟขาออก (AC)", tag: "AC", tagColor: "#0ea5a4", cols: ["แรงดัน", "กระแส", "กำลัง"], rows: acRows },
    { id: "grid", title: "การไฟฟ้า (Grid)", tag: "Grid", tagColor: "#0d4add", cols: ["แรงดัน", "กระแส", "กำลัง"], rows: gridRows },
    { id: "load", title: "โหลดบ้าน (Load)", tag: "Load", tagColor: "#18a673", cols: ["แรงดัน", "กำลัง"], rows: loadRows },
    { id: "batt", title: "แบตเตอรี่ + BMS" },
    { id: "gen", title: "เครื่องปั่นไฟ (Generator)", tag: "Gen", tagColor: "#94a3b8", cols: ["แรงดัน", "กำลัง"], rows: genRows },
    { id: "other", title: "อื่นๆ" },
  ];

  return (
    <>
      <div className="flex items-center gap-1.5 mt-1 mb-3.5">
        <button onClick={onBack} aria-label="กลับหน้าหลัก" className="w-10 h-10 -ml-1.5 rounded-full grid place-items-center text-title active:bg-line transition-colors">
          <IconBack className="w-6 h-6" />
        </button>
        <h2 className={h2}>เครื่องแปลงไฟ (Inverter)</h2>
      </div>

      <div className={cardP}>
        <div className="flex items-center gap-2.5">
          <span className={`w-3 h-3 rounded-full ${dev.online ? "bg-ok shadow-[0_0_0_4px_rgba(24,166,115,.15)]" : "bg-muted"}`} />
          <span className="font-bold">{dev.online ? "ออนไลน์" : "ออฟไลน์"}</span>
          <span className="ml-auto text-[14px] text-muted">อัปเดต {timeStr(dev.collectionTime)}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
          <div className="text-body">รุ่น</div><div className="text-right font-semibold">{INVERTER_TYPE_TH(dev.type)}</div>
          <div className="text-body">หมายเลขเครื่อง</div><div className="text-right font-semibold tabnum">{dev.sn}</div>
          {has("RatedPower") && (<><div className="text-body">กำลังพิกัด</div><div className="text-right font-semibold tabnum">{(Number(byKey("RatedPower")!.value) / 1000).toFixed(0)} kW</div></>)}
        </div>
      </div>

      {/* Deye-style summary cards */}
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        {summary.map((s, i) => (
          <div key={i} className="rounded-2xl p-4 text-white shadow-[0_10px_22px_-10px_rgba(17,17,17,0.45)]" style={{ background: `linear-gradient(135deg, ${s.a}, ${s.b})` }}>
            <div className="text-[13px] font-semibold text-white/85 leading-snug">{s.label}</div>
            <div className="text-[23px] font-extrabold leading-none mt-2 tabnum">{s.v}<span className="text-[13px] font-semibold text-white/80 ml-1">{s.u}</span></div>
          </div>
        ))}
      </div>

      {latest && (
        <div className="mt-3.5 space-y-3">
          <div className={`${card} px-2 py-3`}><FlowDiagram latest={latest} /></div>
          {(temps.inv != null || temps.batt != null) && (
            <div className="grid grid-cols-2 gap-3">
              {temps.inv != null && <TempChip label="อุณหภูมิเครื่อง" t={temps.inv} />}
              {temps.batt != null && <TempChip label="อุณหภูมิแบตเตอรี่" t={temps.batt} />}
            </div>
          )}
        </div>
      )}

      {sections.map((s) => {
        const items = gItems(s.id);
        const hasTable = !!s.rows && s.rows.length > 0;
        if (!hasTable && items.length === 0) return null;
        return (
          <Section key={s.id} title={s.title} count={hasTable ? undefined : items.length} open={!!open[s.id]} onToggle={() => toggle(s.id)}>
            {hasTable && <DataTable tag={s.tag!} tagColor={s.tagColor!} cols={s.cols!} rows={s.rows!} />}
            {items.length > 0 && <div className={hasTable ? "mt-4 pt-4 border-t border-line" : ""}><KVList items={items} /></div>}
          </Section>
        );
      })}
    </>
  );
}
