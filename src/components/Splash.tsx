export function Splash() {
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center"
      style={{ background: "radial-gradient(120% 90% at 50% 22%, #fffaf0 0%, #f6f7fb 62%)" }}
    >
      <div className="flex flex-col items-center" style={{ animation: "fadeup .6s ease both" }}>
        {/* sleek rotating gradient ring — modern, on-brand */}
        <div className="w-[60px] h-[60px]" style={{ animation: "rayspin 1.05s linear infinite" }}>
          <svg viewBox="0 0 50 50" className="w-full h-full">
            <defs>
              <linearGradient id="spin-g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ffd54a" /><stop offset="1" stopColor="#ff9500" />
              </linearGradient>
            </defs>
            <circle cx="25" cy="25" r="21" fill="none" stroke="#ededf2" strokeWidth="5" />
            <circle cx="25" cy="25" r="21" fill="none" stroke="url(#spin-g)" strokeWidth="5" strokeLinecap="round" strokeDasharray="92 140" />
          </svg>
        </div>

        <div className="text-center mt-7">
          <div className="text-[22px] font-extrabold text-title tracking-tight">โซลาร์บ้านคุณนิก</div>
          <div className="text-muted text-[13px] mt-2" style={{ letterSpacing: ".5px" }}>ระบบติดตามพลังงานแสงอาทิตย์</div>
        </div>
      </div>
    </div>
  );
}
