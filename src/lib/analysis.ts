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

  // ----- 0) คำแนะนำ (ดูจากค่าจริงตอนนี้ แล้วบอกว่าควรทำอะไร) -----
  const buying = l.gridPower > 20;
  const surplus = l.genPower - l.usePower; // ผลิตมากกว่าที่ใช้ = มีไฟเหลือ
  const discharging = bs.includes("DIS");
  const socR = Math.round(l.soc);
  let rec: string;
  if (!daytime) {
    rec = discharging
      ? `ตอนนี้กลางคืน ใช้ไฟจากแบตเตอรี่ที่เก็บไว้ (แบตเหลือ ${socR}%) — ${l.soc <= 25 ? "แบตใกล้หมด แนะนำลดเครื่องใช้ไฟฟ้าขนาดใหญ่ รอแดดเช้ามาชาร์จ" : "ระบบทำงานปกติ ไม่ต้องปรับอะไร"}`
      : `ตอนนี้กลางคืน ใช้ไฟจากการไฟฟ้า ${kw(Math.max(0, l.gridPower))} kW — ช่วงนี้ไม่มีแดด เครื่องใช้ไฟฟ้ากำลังสูงควรเลื่อนไปใช้ตอนกลางวัน จะประหยัดกว่า`;
  } else if (surplus > 200) {
    rec = `แดดกำลังดี ผลิตได้มากกว่าที่ใช้อยู่ ~${kw(surplus)} kW — ช่วงนี้เหมาะเปิดเครื่องใช้ไฟฟ้ากำลังสูง (แอร์ เครื่องซักผ้า ปั๊มน้ำ) ได้ใช้ไฟจากแสงอาทิตย์เต็มที่ ไม่เสียค่าไฟ`;
  } else if (buying) {
    rec = `แดดยังไม่พอกับที่ใช้ กำลังซื้อไฟ ${kw(l.gridPower)} kW — ถ้าเลื่อนได้ ควรใช้เครื่องใช้ไฟฟ้ากำลังสูงช่วงแดดแรง (ราว 9:00–15:00 น.) จะคุ้มกว่า`;
  } else {
    rec = `ระบบสมดุล — แสงอาทิตย์ที่ผลิตกำลังพอดีกับที่บ้านใช้อยู่`;
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
