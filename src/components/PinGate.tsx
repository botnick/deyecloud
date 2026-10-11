import { useCallback, useEffect, useRef, useState } from "react";
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
  // the in-flight guard is a ref, not state: two Enter presses / taps in the same frame both
  // read the same render's `busy`, a ref flips synchronously
  const busyRef = useRef(false);
  const pinRef = useRef("");
  const firstKey = useRef<HTMLButtonElement>(null);
  const setPinBoth = (v: string) => { pinRef.current = v; setPin(v); };

  const submit = useCallback(async () => {
    const value = pinRef.current;
    if (busyRef.current || !value) return;
    busyRef.current = true; setBusy(true); setErr("");
    const r = await postLogin(value).catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }));
    busyRef.current = false; setBusy(false);
    if (r.ok) { onOk(); return; }
    setErr(r.error || "รหัสไม่ถูกต้อง"); setPinBoth(""); setShake(true); setTimeout(() => setShake(false), 450);
    firstKey.current?.focus(); // the submit key is now disabled — keep keyboard/AT focus on the pad
  }, [onOk]);

  const press = useCallback((d: string) => {
    if (busyRef.current || pinRef.current.length >= MAX) return;
    haptic(); setErr(""); setPinBoth(pinRef.current + d);
  }, []);
  const del = useCallback(() => { if (busyRef.current || !pinRef.current) return; haptic(); setPinBoth(pinRef.current.slice(0, -1)); }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); del(); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
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
        {keys.map((k, i) => <button key={k} ref={i === 0 ? firstKey : undefined} onClick={() => press(k)} aria-label={k}>{k}</button>)}
        <button className="ghost" onClick={del} aria-label="ลบ" disabled={busy || !pin}>ลบ</button>
        <button onClick={() => press("0")} aria-label="0">0</button>
        <button className="ok" onClick={submit} disabled={busy || !pin} aria-label="เข้าใช้งาน">
          {busy ? "…" : <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
        </button>
      </div>
    </div>
  );
}
