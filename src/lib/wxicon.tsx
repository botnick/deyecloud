// Real meteorological weather icons (Meteocons by Bas Milius, MIT).
// Bundled via npm + Vite -> hashed assets -> precached by the PWA (works offline).
import clearDay from "@meteocons/svg/fill/clear-day.svg";
import clearNight from "@meteocons/svg/fill/clear-night.svg";
import partlyDay from "@meteocons/svg/fill/partly-cloudy-day.svg";
import partlyNight from "@meteocons/svg/fill/partly-cloudy-night.svg";
import cloudy from "@meteocons/svg/fill/cloudy.svg";
import overcastDay from "@meteocons/svg/fill/overcast-day.svg";
import overcastNight from "@meteocons/svg/fill/overcast-night.svg";
import drizzle from "@meteocons/svg/fill/drizzle.svg";
import rain from "@meteocons/svg/fill/rain.svg";
import storm from "@meteocons/svg/fill/thunderstorms-rain.svg";

// TMD condition code (1-12) + day/night -> Meteocons asset URL.
export function wxIconSrc(cond: number, night = false): string {
  switch (cond) {
    case 1: // ท้องฟ้าแจ่มใส
    case 12: // ร้อนจัด
      return night ? clearNight : clearDay;
    case 2: // มีเมฆบางส่วน
    case 11: // อากาศเย็น
      return night ? partlyNight : partlyDay;
    case 3: // เมฆเป็นส่วนมาก
      return cloudy;
    case 4: // มีเมฆมาก
    case 9: // หนาวจัด
    case 10: // อากาศหนาว
      return night ? overcastNight : overcastDay;
    case 5: // ฝนเล็กน้อย
      return drizzle;
    case 6: // ฝนปานกลาง
    case 7: // ฝนหนัก
      return rain;
    case 8: // ฝนฟ้าคะนอง
      return storm;
    default:
      return cloudy;
  }
}

export function WxIcon({ cond, night = false, className }: { cond: number; night?: boolean; className?: string }) {
  return <img src={wxIconSrc(cond, night)} alt="" draggable={false} className={className} />;
}
