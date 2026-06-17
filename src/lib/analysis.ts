import type { Latest } from "./api";

export interface Insight { tone: "ok" | "info" | "warn" | "tip"; title: string; detail: string; sub?: string[]; }

// ค่าไฟบ้านเฉลี่ย (บาท/หน่วย) — โครงสร้างก้าวหน้า + Ft โดยประมาณปี 2026
const RATE = 4.4;
const b = (n: number) => Math.round(n).toLocaleString("th-TH");
const u = (n: number) => (Number(n) || 0).toFixed(1);

// วิเคราะห์ทั้งหมดคำนวณจากเลขจริง ยึดสมการสมดุลพลังงาน:
//   ผลิต = ใช้เอง + ชาร์จแบต + ไหลย้อน
//   ใช้   = แสงแดดตรง + แบตจ่าย + ซื้อไฟ
export function analyze(l: Latest, capacityKw?: number): Insight[] {
  const out: Insight[] = [];
  const bs = (l.battStatus || "").toUpperCase();
  const hour = new Date((l.updatedAt || Date.now() / 1000) * 1000).getHours();
  const daytime = hour >= 6 && hour < 18;
  const kw = (w: number) => (Math.abs(w) / 1000).toFixed(2);

  // ----- 0) คำแนะนำ (ดูจากการไหลของไฟจริงตอนนี้ ไม่อิงแค่นาฬิกา) -----
  const producing = l.genPower > 100; // แผงกำลังผลิตจริง = มีแดด ไม่ว่านาฬิกาจะกี่โมง
  const buying = l.gridPower > 20;
  const surplus = l.genPower - l.usePower; // ผลิตมากกว่าที่ใช้ = มีไฟเหลือ
  const discharging = bs.includes("DIS");
  const socR = Math.round(l.soc);
  let rec: string;
  if (producing && surplus > 200) {
    rec = `แดดกำลังดี ผลิตได้มากกว่าที่ใช้อยู่ ~${kw(surplus)} kW — ช่วงนี้เหมาะเปิดเครื่องใช้ไฟฟ้ากำลังสูง (แอร์ เครื่องซักผ้า ปั๊มน้ำ) ได้ใช้ไฟจากแสงอาทิตย์เต็มที่ ไม่เสียค่าไฟ`;
  } else if (producing && buying) {
    rec = `แผงผลิตอยู่แต่ยังไม่พอกับที่ใช้ กำลังซื้อไฟเสริม ${kw(l.gridPower)} kW — ถ้าเลื่อนได้ ควรใช้เครื่องใช้ไฟฟ้ากำลังสูงตอนแดดแรง (ราว 9:00–15:00 น.) จะคุ้มกว่า`;
  } else if (producing) {
    rec = `ระบบสมดุล — แสงอาทิตย์ที่ผลิตกำลังพอดีกับที่บ้านใช้อยู่ ไม่ต้องซื้อไฟ`;
  } else if (discharging) {
    rec = `ตอนนี้แผงไม่ผลิต ใช้ไฟจากแบตเตอรี่ที่เก็บไว้ (แบตเหลือ ${socR}%) — ${l.soc <= 25 ? "แบตใกล้หมด แนะนำลดเครื่องใช้ไฟฟ้าขนาดใหญ่ รอแดดมาชาร์จ" : "ระบบทำงานปกติ ไม่ต้องปรับอะไร"}`;
  } else if (buying) {
    rec = `ตอนนี้แผงไม่ผลิต${daytime ? " (แดดน้อย/มีเมฆ)" : " (กลางคืน)"} ใช้ไฟจากการไฟฟ้า ${kw(l.gridPower)} kW — เครื่องใช้ไฟฟ้ากำลังสูงควรใช้ตอนกลางวันที่มีแดด จะประหยัดกว่า`;
  } else {
    rec = `ตอนนี้ใช้ไฟไม่มาก ระบบทำงานปกติ`;
  }
  out.push({ tone: "tip", title: "คำแนะนำ", detail: rec });

  // ----- 1) ตอนนี้ (สมดุลกำลังไฟแบบเรียลไทม์) -----
  const now: string[] = [];
  if (l.genPower > 5) now.push(`แผงผลิต ${kw(l.genPower)} kW`);
  else now.push(daytime ? "แผงยังไม่ผลิต (แดดน้อย/มีเมฆ)" : "กลางคืน แผงไม่ผลิต");
  if (l.gridPower > 5) now.push(`ดึงจากการไฟฟ้า ${kw(l.gridPower)} kW`);
  else if (l.gridPower < -5) now.push(`ไหลย้อนเข้าระบบ ${kw(l.gridPower)} kW`);
  if (bs.includes("CHARGE")) now.push(`แบตชาร์จ ${kw(l.battPower)} kW`);
  else if (bs.includes("DIS")) now.push(`แบตจ่าย ${kw(l.battPower)} kW`);
  out.push({
    tone: "info",
    title: `ตอนนี้ ${String(hour).padStart(2, "0")}:00 น. — บ้านใช้ ${kw(l.usePower)} kW`,
    detail: now.join(" · "),
  });

  // ----- 2) ผลิตวันนี้ + แยกปลายทาง -----
  const pvDirect = Math.max(0, l.genToday - l.chargeToday - l.sellToday); // แสงอาทิตย์ที่ใช้กับโหลดโดยตรง
  const selfCons = l.genToday > 0.1 ? ((l.genToday - l.sellToday) / l.genToday) * 100 : 0;
  if (l.genToday > 0.1) {
    const sub = [
      `ใช้กับบ้านเลย ${u(pvDirect)} หน่วย`,
      `เก็บเข้าแบต ${u(l.chargeToday)} หน่วย`,
    ];
    if (l.sellToday > 0.05) sub.push(`ไหลย้อนทิ้ง ${u(l.sellToday)} หน่วย`);
    const psh = capacityKw && capacityKw > 0 ? ` · เทียบแดดเต็มกำลัง ${(l.genToday / capacityKw).toFixed(1)} ชม.` : "";
    out.push({
      tone: "ok",
      title: `ผลิตไฟวันนี้ ${u(l.genToday)} หน่วย`,
      detail: `ใช้แสงอาทิตย์คุ้ม ${Math.round(selfCons)}%${psh}`,
      sub,
    });
  }

  // ----- 3) ใช้ไฟวันนี้ + แยกที่มา -----
  if (l.useToday > 0.1) {
    const selfSuff = Math.max(0, Math.min(100, ((l.useToday - l.buyToday) / l.useToday) * 100));
    out.push({
      tone: selfSuff >= 60 ? "ok" : "info",
      title: `ใช้ไฟวันนี้ ${u(l.useToday)} หน่วย`,
      detail: `พึ่งพาตัวเอง ${Math.round(selfSuff)}% (ไฟที่ใช้โดยไม่ต้องซื้อ)`,
      sub: [
        `จากแสงอาทิตย์ตรง ${u(pvDirect)} หน่วย`,
        `จากแบตเตอรี่ ${u(l.dischargeToday)} หน่วย`,
        `ซื้อจากการไฟฟ้า ${u(l.buyToday)} หน่วย`,
      ],
    });
  }

  // ----- 4) เงินที่ประหยัด (อ้างค่าไฟ ~4.4 บาท/หน่วย) -----
  if (l.useToday > 0.1) {
    const woSolar = l.useToday * RATE; // ถ้าไม่มีโซลาร์ ต้องซื้อทั้งหมด
    const cost = l.buyToday * RATE; // จ่ายจริง
    const saved = woSolar - cost;
    out.push({
      tone: "ok",
      title: `วันนี้ประหยัด ~${b(saved)} บาท`,
      detail: `ถ้าไม่มีโซลาร์ต้องจ่าย ~${b(woSolar)} บาท · จ่ายจริงแค่ ~${b(cost)} บาท`,
      sub: ["คิดที่ค่าไฟ ~4.4 บาท/หน่วย (โดยประมาณ)"],
    });
  }

  // ----- 5) แบตเตอรี่ -----
  const battNet = l.chargeToday - l.dischargeToday;
  if (l.soc <= 20) {
    out.push({
      tone: "warn",
      title: `แบตเตอรี่ต่ำ เหลือ ${Math.round(l.soc)}%`,
      detail: bs.includes("CHARGE") ? "กำลังชาร์จอยู่ เดี๋ยวเพิ่มขึ้น" : "ควรลดการใช้ไฟ รอแดดมาชาร์จ",
    });
  } else {
    out.push({
      tone: "ok",
      title: `แบตเตอรี่ ${Math.round(l.soc)}%`,
      detail: `วันนี้ชาร์จ ${u(l.chargeToday)} · จ่าย ${u(l.dischargeToday)} หน่วย (สุทธิ ${battNet >= 0 ? "+" : ""}${u(battNet)})`,
    });
  }

  return out;
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthTh = (ym: string) => { const m = Number(String(ym).slice(5, 7)); return TH_MONTH[m - 1] || ym; };

// วิเคราะห์ข้อมูลย้อนหลังของช่วงที่เลือก (วัน = เส้นกำลังไฟ / เดือน·ปี = พลังงานรวมจาก Deye)
export function analyzeHistory(range: "day" | "month" | "year", points: any[]): Insight[] {
  const out: Insight[] = [];
  if (!points || !points.length) return out;

  if (range === "day") {
    // power frames (W): หากำลังผลิตสูงสุดและช่วงเวลา + กำลังใช้สูงสุด
    let pkGen = 0, pkGenTs = "", pkUse = 0;
    for (const p of points) {
      const g = p.gen_power || 0, us = p.use_power || 0;
      if (g > pkGen) { pkGen = g; pkGenTs = p.ts; }
      if (us > pkUse) pkUse = us;
    }
    const kw = (w: number) => (w / 1000).toFixed(2);
    const tm = pkGenTs ? new Date(pkGenTs).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
    out.push({
      tone: "tip", title: "สรุปวันนี้",
      detail: pkGen > 50
        ? `แผงผลิตได้สูงสุด ${kw(pkGen)} kW ตอน ${tm} น. — ช่วงนั้นแดดแรงที่สุดของวัน เหมาะใช้เครื่องใช้ไฟฟ้ากำลังสูง`
        : "ยังไม่มีการผลิตที่ชัดเจนในวันนี้ (กลางคืน/แดดน้อย)",
    });
    if (pkUse > 50) out.push({ tone: "info", title: `ใช้ไฟสูงสุด ${kw(pkUse)} kW`, detail: "จุดที่บ้านดึงกำลังไฟมากที่สุดในวันนี้" });
    return out;
  }

  // month / year — พลังงานรวม (หน่วย) จาก Deye: gen/use/buy/sell ต่อวัน/เดือน
  const s = points.reduce(
    (a, p) => ({ gen: a.gen + (p.gen || 0), use: a.use + (p.use || 0), buy: a.buy + (p.buy || 0), sell: a.sell + (p.sell || 0) }),
    { gen: 0, use: 0, buy: 0, sell: 0 }
  );
  const span = range === "month" ? "เดือนนี้" : "ปีนี้";
  const unit = range === "month" ? "วัน" : "เดือน";
  const n = points.length || 1;
  const selfSuff = s.use > 0 ? Math.max(0, Math.min(100, ((s.use - s.buy) / s.use) * 100)) : 0;
  const saved = (s.use - s.buy) * RATE;
  let best = points[0];
  for (const p of points) if ((p.gen || 0) > (best.gen || 0)) best = p;
  const bestLabel = range === "month" ? `วันที่ ${Number(String(best.day || "").slice(8)) || "-"}` : monthTh(best.month || "");

  out.push({
    tone: "tip", title: "สรุปภาพรวม",
    detail: `${span}ผลิตได้ ${u(s.gen)} หน่วย ใช้ไป ${u(s.use)} หน่วย — พึ่งพาแสงอาทิตย์เองได้ ${Math.round(selfSuff)}% ของที่ใช้ทั้งหมด`,
  });
  out.push({
    tone: "ok", title: `${span}ประหยัด ~${b(saved)} บาท`,
    detail: `ถ้าไม่มีโซลาร์ต้องจ่าย ~${b(s.use * RATE)} บาท · จ่ายจริง ~${b(s.buy * RATE)} บาท`,
    sub: ["คิดที่ค่าไฟ ~4.4 บาท/หน่วย (โดยประมาณ)"],
  });
  out.push({
    tone: "info", title: `เฉลี่ยต่อ${unit} ${u(s.gen / n)} หน่วย`,
    detail: `ผลิตเฉลี่ย ${u(s.gen / n)} · ใช้เฉลี่ย ${u(s.use / n)} หน่วยต่อ${unit} (จาก ${n} ${unit})`,
  });
  out.push({ tone: "ok", title: `ผลิตได้ดีที่สุด: ${bestLabel}`, detail: `ผลิตได้ ${u(best.gen || 0)} หน่วยใน${unit}นั้น` });
  if (s.sell > 0.5) out.push({ tone: "info", title: `ไฟไหลย้อน ${u(s.sell)} หน่วย`, detail: "ไฟที่ผลิตเกินแล้วไหลย้อนเข้าระบบ (ส่วนนี้ยังไม่ได้นำกลับมาใช้)" });
  return out;
}
