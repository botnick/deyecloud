import { useState } from "react";
import { postLogin } from "../lib/api";
import { IconSun } from "../lib/icons";

export function PinGate({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const r = await postLogin(pin).catch(() => ({ ok: false, error: "เชื่อมต่อไม่ได้" }));
    setBusy(false);
    if (r.ok) onOk();
    else setErr(r.error || "รหัสไม่ถูกต้อง");
  };

  return (
    <div className="fixed inset-0 z-50 bg-canvas flex flex-col items-center justify-center gap-5 px-7">
      <div className="w-20 h-20 rounded-3xl bg-primary grid place-items-center shadow-[0_8px_24px_rgba(17,17,17,0.10)]">
        <IconSun className="w-11 h-11 text-ink" />
      </div>
      <h1 className="text-2xl font-extrabold">โซลาร์บ้านคุณนิก</h1>
      <p className="text-body text-center">ใส่รหัสผ่านเพื่อเข้าดูข้อมูล</p>
      <form onSubmit={submit} className="contents">
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="• • • •"
          className="w-full max-w-[280px] h-[60px] rounded-2xl border-2 border-line bg-white text-center text-[30px] tracking-[12px] outline-none focus:border-secondary"
        />
        <div className="text-warn text-sm min-h-5">{err}</div>
        <button
          disabled={busy}
          className="w-full max-w-[280px] min-h-[60px] rounded-2xl bg-primary text-ink font-extrabold text-lg active:bg-primary-press active:scale-[.99] disabled:opacity-60"
        >
          เข้าใช้งาน
        </button>
      </form>
    </div>
  );
}
