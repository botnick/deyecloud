import { useCallback, useEffect, useState } from "react";
import { postLogin } from "../lib/api";
import { IconSun } from "../lib/icons";
import { APP_NAME } from "../lib/brand";
import { haptic } from "../lib/haptics";

const MAX = 8; // PINs are 4–8 digits; length isn't known up-front, so entry ends with "เข้าใช้งาน"

/* iPhone-style passcode screen: big round keys (universal design — easy to hit, easy to
   read), dots for entered digits, and the hardware keyboard still works on desktop. */
export function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = useCallback(async () => {
    if (busy || !pin) return; // guard against double-submit
    setErr("");
    setBusy(true);
    const r = await postLogin(pin).catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }));
    setBusy(false);
    if (r.ok) onOk();
    else { setErr(r.error || "รหัสไม่ถูกต้อง"); setPin(""); setShake(true); setTimeout(() => setShake(false), 450); }
  }, [busy, pin, onOk]);

  const press = useCallback((d: string) => { if (busy) return; haptic(); setErr(""); setPin((p) => (p.length < MAX ? p + d : p)); }, [busy]);
  const del = useCallback(() => { haptic(); setPin((p) => p.slice(0, -1)); }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") del();
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [press, del, submit]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div className="pin-screen">
      <div className="w-[72px] h-[72px] rounded-[22px] bg-primary grid place-items-center shadow-[0_10px_26px_-8px_rgba(179,143,0,.55)]">
        <IconSun className="w-10 h-10 text-ink" />
      </div>
      <h1 className="text-[24px] font-extrabold mt-4">{APP_NAME}</h1>
      <p className="text-[16px] text-body mt-1">ใส่รหัสเพื่อเข้าดูข้อมูล</p>

      <div className={`pin-dots ${shake ? "shake" : ""}`} aria-label={`ใส่แล้ว ${pin.length} หลัก`} role="status">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => <i key={i} className={i < pin.length ? "on" : ""} />)}
      </div>
      <div className="text-warn text-[15px] font-semibold min-h-6 mt-1" role="alert">{err}</div>

      <div className="pin-pad">
        {keys.map((k) => <button key={k} onClick={() => press(k)} aria-label={k}>{k}</button>)}
        <button className="ghost" onClick={del} aria-label="ลบ" disabled={!pin}>ลบ</button>
        <button onClick={() => press("0")} aria-label="0">0</button>
        <button className="ok" onClick={submit} disabled={busy || !pin} aria-label="เข้าใช้งาน">
          {busy ? "…" : <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
      </div>
    </div>
  );
}
