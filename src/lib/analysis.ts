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
  // ชนิดระบบ: ตรวจว่ามีแบตไหม → on-grid (ไม่มีแบต) จะไม่แสดงการ์ดแบต/บรรทัดแบตที่ทำให้เข้าใจผิด
  const hasBatt = (l.soc || 0) > 0.5 || l.chargeToday > 0.05 || l.dischargeToday > 0.05 || Math.abs(l.battPower) > 15 || /CHARGE|DIS/.test(bs);

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
    const sub = [`ใช้กับบ้านเลย ${u(pvDirect)} หน่วย`];
    if (hasBatt) sub.push(`เก็บเข้าแบต ${u(l.chargeToday)} หน่วย`);
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
        ...(hasBatt ? [`จากแบตเตอรี่ ${u(l.dischargeToday)} หน่วย`] : []),
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

  // ----- 5) แบตเตอรี่ (เฉพาะระบบที่มีแบต — on-grid ไม่มีแบตจะข้ามการ์ดนี้) -----
  if (hasBatt) {
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
  }

  return out;
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const monthTh = (ym: string) => { const m = Number(String(ym).slice(5, 7)); return TH_MONTH[m - 1] || ym; };

// ค่าการปล่อย CO₂ ของไฟฟ้าในระบบของไทย ~0.5 กก./หน่วย (อ้างอิง อบก./TGO)
const CO2_PER_KWH = 0.5;
const pad2 = (n: number) => String(n).padStart(2, "0");
const clockOf = (ts: number) => { const d = new Date(ts * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const clamp100 = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

// วิเคราะห์ข้อมูลย้อนหลังของช่วงที่เลือก (วัน = เส้นกำลังไฟ / เดือน·ปี = พลังงานรวมจาก Deye).
// ทุกค่าคำนวณจากตัวเลขจริง — รายวัน integrate เส้นกำลังไฟ (W) เป็นพลังงาน (หน่วย),
// รายเดือน/ปีรวมจากยอด Deye โดยตรง อ้างอิงค่าไฟ ~4.4 บาท/หน่วย.
export interface DayTotals { gen: number; use: number; buy: number; sell: number; charge: number; discharge: number; }
export function analyzeHistory(range: "day" | "month" | "year", points: any[], capacityKw?: number, totals?: DayTotals | null): Insight[] {
  if (!points || !points.length) return [];
  const cap = capacityKw && capacityKw > 0 ? capacityKw : 0;
  return range === "day" ? analyzeDay(points, cap, totals) : analyzeSpan(range, points, cap);
}

// ---------- รายวัน: ยอดพลังงานจริงจาก Deye (ถ้ามี) + integrate เส้นกำลังไฟทำ peak/เวลา/SOC ----------
function analyzeDay(points: any[], cap: number, totals?: DayTotals | null): Insight[] {
  const out: Insight[] = [];
  const kw = (w: number) => (w / 1000).toFixed(2);
  const fr = points.filter((p) => p.ts != null).sort((a, b) => a.ts - b.ts);

  // peak ใช้ได้แม้ frame เดียว
  let pkGen = 0, pkGenTs = 0, pkUse = 0, pkUseTs = 0;
  for (const p of fr) {
    const g = p.gen_power || 0, us = p.use_power || 0;
    if (g > pkGen) { pkGen = g; pkGenTs = p.ts; }
    if (us > pkUse) { pkUse = us; pkUseTs = p.ts; }
  }

  // integrate กำลัง (W) → พลังงาน (kWh) แบบ trapezoid, ตัด gap > 30 นาที กันข้อมูลขาดทำให้เกินจริง
  const integ = (val: (p: any) => number) => {
    let wh = 0;
    for (let i = 1; i < fr.length; i++) {
      const dt = Math.min(fr[i].ts - fr[i - 1].ts, 1800);
      if (dt <= 0) continue;
      wh += ((val(fr[i - 1]) + val(fr[i])) / 2) * (dt / 3600);
    }
    return wh / 1000;
  };
  // ยอดพลังงานจริงจาก Deye (granularity=day) แม่นกว่า integrate — ใช้เป็นตัวเลขหลัก
  // ส่วนเส้น frame (กำลังไฟ) เอาไว้หา peak / เวลา / ช่วงแดด / SOC. ไม่มี totals → fallback integrate.
  const exact = !!(totals && ((totals.gen || 0) > 0 || (totals.use || 0) > 0));
  const genKwh = exact ? totals!.gen : integ((p) => Math.max(0, p.gen_power || 0));
  const useKwh = exact ? totals!.use : integ((p) => Math.max(0, p.use_power || 0));
  const expKwh = exact ? totals!.sell : integ((p) => Math.max(0, -(p.grid_power || 0)));  // grid<0 = ไหลย้อน/ขาย
  const impKwh = exact ? totals!.buy : integ((p) => Math.max(0, p.grid_power || 0));        // grid>0 = ซื้อ
  const chgKwh = exact ? totals!.charge : integ((p) => Math.max(0, -(p.batt_power || 0)));  // batt<0 = ชาร์จ
  const disKwh = exact ? totals!.discharge : integ((p) => Math.max(0, p.batt_power || 0));  // batt>0 = จ่าย
  const toLoad = Math.max(0, genKwh - chgKwh - expKwh);            // แดดที่ใช้กับบ้านโดยตรง

  // SOC ต่ำสุด/สูงสุด + เวลาที่ต่ำสุด
  let socMin: number | null = null, socMinTs = 0, socMax: number | null = null;
  for (const p of fr) {
    if (p.soc == null) continue;
    if (socMin == null || p.soc < socMin) { socMin = p.soc; socMinTs = p.ts; }
    if (socMax == null || p.soc > socMax) socMax = p.soc;
  }

  // ตรวจชนิดระบบจากข้อมูลจริง → on-grid (ไม่มีแบต) / hybrid / off-grid (ไม่ใช้กริด)
  const hasBatt = socMax != null || chgKwh > 0.05 || disKwh > 0.05 || fr.some((p) => Math.abs(p.batt_power || 0) > 15);
  const usedGrid = impKwh > 0.05 || expKwh > 0.05 || fr.some((p) => Math.abs(p.grid_power || 0) > 8);

  // ไม่มียอดจริงจาก Deye + เฟรมน้อยเกินไป → สรุปพีคพอ ไม่ integrate ให้เพี้ยน
  if (!exact && fr.length < 3) {
    out.push({
      tone: "tip", title: "สรุปทั้งวัน",
      detail: pkGen > 50 ? `แผงผลิตสูงสุด ${kw(pkGen)} kW ตอน ${clockOf(pkGenTs)} น.` : "ยังไม่มีการผลิตที่ชัดเจนในวันนี้ (กลางคืน/แดดน้อย)",
    });
    if (pkUse > 50) out.push({ tone: "info", title: `ใช้ไฟสูงสุด ${kw(pkUse)} kW`, detail: `ตอน ${clockOf(pkUseTs)} น.` });
    return out;
  }

  // ช่วงเวลาที่แผงผลิตจริง (gen > 100W) + รูปทรงเส้นกลางวัน (เมฆบัง?)
  const prod = fr.filter((p) => (p.gen_power || 0) > 100);
  const sunStart = prod.length ? prod[0].ts : 0;
  const sunEnd = prod.length ? prod[prod.length - 1].ts : 0;
  const sunHrs = sunStart && sunEnd ? (sunEnd - sunStart) / 3600 : 0;
  const psh = cap ? genKwh / cap : 0; // ชั่วโมงแดดเต็มกำลังเทียบเท่า
  const clouds = middayClouds(fr);
  // ฐานโหลด: กำลังใช้ต่ำสุดช่วงไม่มีแดด (อุปกรณ์ที่เปิดทิ้งไว้ตลอด)
  let baseLoad = Infinity;
  for (const p of fr) if ((p.gen_power || 0) < 50 && (p.use_power || 0) > 0) baseLoad = Math.min(baseLoad, p.use_power);
  if (!Number.isFinite(baseLoad)) baseLoad = 0;

  const selfCons = genKwh > 0.05 ? clamp100(((genKwh - expKwh) / genKwh) * 100) : 0; // ใช้แดดเอง
  const selfSuff = useKwh > 0.05 ? clamp100(((useKwh - impKwh) / useKwh) * 100) : 0;  // พึ่งพาตัวเอง

  // 1) ผลิต
  if (genKwh > 0.05) {
    const capPct = cap ? ` (พีคแตะ ${Math.round((pkGen / 1000 / cap) * 100)}% ของระบบ ${cap} kW)` : "";
    out.push({
      tone: "tip", title: `ผลิตไฟวันนี้ ~${u(genKwh)} หน่วย`,
      detail: `กำลังผลิตสูงสุด ${kw(pkGen)} kW ตอน ${clockOf(pkGenTs)} น.${capPct}`,
      sub: [
        sunHrs > 0 ? `แผงทำงานช่วง ${clockOf(sunStart)}–${clockOf(sunEnd)} น. (~${sunHrs.toFixed(1)} ชม.)` : "",
        cap ? `เทียบแดดเต็มกำลัง ~${psh.toFixed(1)} ชม./วัน` : "",
      ].filter(Boolean),
    });
  } else {
    out.push({ tone: "info", title: "วันนี้แทบไม่มีการผลิต", detail: "กลางคืน หรือแดดน้อย/ฝนเกือบทั้งวัน" });
  }

  // 2) ใช้
  if (useKwh > 0.05) {
    out.push({
      tone: "info", title: `ใช้ไฟวันนี้ ~${u(useKwh)} หน่วย`,
      detail: `ใช้สูงสุด ${kw(pkUse)} kW ตอน ${clockOf(pkUseTs)} น.`,
      sub: baseLoad > 60 ? [`ฐานโหลดช่วงไม่มีแดด ~${kw(baseLoad)} kW (อุปกรณ์ที่เปิดค้างไว้ตลอด)`] : undefined,
    });
  }

  // 3) แสงอาทิตย์ไปไหนบ้าง
  if (genKwh > 0.1) {
    const sub = [`ใช้กับบ้านโดยตรง ~${u(toLoad)} หน่วย`];
    if (hasBatt) sub.push(`เก็บเข้าแบต ~${u(chgKwh)} หน่วย`);
    if (expKwh > 0.05) sub.push(`ไหลย้อนเข้าระบบ ~${u(expKwh)} หน่วย`);
    out.push({
      tone: "ok", title: `ใช้แสงอาทิตย์ที่ผลิตเองได้ ${selfCons}%`,
      detail: expKwh > genKwh * 0.15 ? "มีไฟไหลย้อนทิ้งพอควร — เพิ่มการใช้ตอนกลางวันจะคุ้มกว่า" : "แทบไม่มีไฟไหลย้อนทิ้ง ใช้แดดได้คุ้ม",
      sub,
    });
  }

  // 4) แบตเตอรี่
  if (chgKwh > 0.05 || disKwh > 0.05 || socMin != null) {
    const low = socMin != null && socMin <= 15;
    out.push({
      tone: low ? "warn" : "ok",
      title: `แบตเตอรี่ — ชาร์จ ~${u(chgKwh)} / จ่าย ~${u(disKwh)} หน่วย`,
      detail: low ? `แบตลงไปต่ำสุด ${Math.round(socMin!)}% ตอน ${clockOf(socMinTs)} น. — ระวังช่วงไม่มีแดด` : "หมุนเวียนพลังงานในแบตได้ปกติดี",
      sub: socMin != null ? [`SOC ต่ำสุด ${Math.round(socMin)}%${socMax != null ? ` · สูงสุด ${Math.round(socMax)}%` : ""}`] : undefined,
    });
  }

  // 5) พึ่งพาตัวเอง vs การไฟฟ้า
  if (impKwh > 0.05) {
    out.push({
      tone: selfSuff >= 70 ? "ok" : "info",
      title: `พึ่งพาตัวเองได้ ${selfSuff}% ของไฟที่ใช้`,
      detail: `ซื้อจากการไฟฟ้า ~${u(impKwh)} หน่วย${expKwh > 0.05 ? ` · ไหลย้อน/ขาย ~${u(expKwh)} หน่วย` : ""}`,
    });
  } else if (useKwh > 0.1) {
    const offGrid = hasBatt && !usedGrid;
    out.push({
      tone: "ok",
      title: offGrid ? "ทำงานแบบ off-grid วันนี้" : "พึ่งพาตัวเองเกือบ 100%",
      detail: offGrid ? "ทั้งวันใช้แสงอาทิตย์ + แบตเตอรี่ ไม่ได้พึ่งการไฟฟ้าเลย" : "วันนี้แทบไม่ต้องซื้อไฟจากการไฟฟ้าเลย",
    });
  }

  // 6) เงินที่ประหยัด
  if (useKwh > 0.1) {
    const woSolar = useKwh * RATE, cost = impKwh * RATE;
    out.push({
      tone: "ok", title: `วันนี้ประหยัด ~${b(woSolar - cost)} บาท`,
      detail: `ถ้าไม่มีโซลาร์ต้องจ่าย ~${b(woSolar)} · จ่ายจริง ~${b(cost)} บาท`,
      sub: ["ค่าไฟอ้างอิง ~4.4 บาท/หน่วย (โดยประมาณ)"],
    });
  }

  // 7) บทวิเคราะห์ (สังเคราะห์ภาพรวมแบบคนอ่าน ปรับตามชนิดระบบ)
  out.push({ tone: "tip", title: "บทวิเคราะห์", detail: dayVerdict({ genKwh, useKwh, selfSuff, impKwh, expKwh, cap, psh, socMin, socMinTs, baseLoad, hasBatt, usedGrid, clouds }) });
  return out;
}

// อ่านรูปทรงเส้นผลิตช่วงกลางวัน (10:00–14:00 น. เวลาเครื่อง) → แดดต่อเนื่อง / มีเมฆบังเป็นช่วงๆ / ครึ้มทั้งวัน
function middayClouds(fr: any[]): "clear" | "intermittent" | "overcast" | null {
  const core = fr.filter((p) => { const h = new Date(p.ts * 1000).getHours(); return h >= 10 && h < 14; });
  if (core.length < 4) return null;
  let peak = 0;
  for (const p of core) peak = Math.max(peak, p.gen_power || 0);
  if (peak < 500) return "overcast"; // กลางวันแทบไม่ผลิต = เมฆครึ้มทั้งวัน
  let below = 0;
  for (const p of core) if ((p.gen_power || 0) < peak * 0.5) below++;
  const ratio = below / core.length;
  return ratio > 0.3 ? "intermittent" : ratio < 0.1 ? "clear" : null;
}

// สรุปวันแบบประโยคต่อเนื่อง — ประเมินคุณภาพแดด เมฆ ความสมดุล การพึ่งพาตัวเอง และคำแนะนำที่ทำได้จริง
// ปรับตรรกะตามชนิดระบบ: on-grid (ไม่มีแบต) เน้นใช้ไฟกลางวัน, off-grid เน้นสำรองแบต
function dayVerdict(m: {
  genKwh: number; useKwh: number; selfSuff: number; impKwh: number; expKwh: number; cap: number; psh: number;
  socMin: number | null; socMinTs: number; baseLoad: number; hasBatt: boolean; usedGrid: boolean;
  clouds: "clear" | "intermittent" | "overcast" | null;
}): string {
  const parts: string[] = [];
  // คุณภาพแดด
  if (m.cap && m.genKwh > 0.1) {
    if (m.psh >= 4.5) parts.push("วันนี้แดดดีมาก ผลิตได้เต็มประสิทธิภาพ");
    else if (m.psh >= 3) parts.push("แดดอยู่ในเกณฑ์ดี ผลิตได้ตามปกติ");
    else if (m.psh >= 1.2) parts.push("แดดน้อยกว่าปกติ (มีเมฆ/ฝนบ้าง) ผลิตได้ไม่เต็มที่");
    else parts.push("แดดน้อยมากเกือบทั้งวัน ผลิตได้ต่ำ");
  } else if (m.genKwh <= 0.1) {
    parts.push(m.hasBatt ? "ทั้งวันแทบไม่มีแดด ใช้ไฟจากแบตและการไฟฟ้าเป็นหลัก" : "ทั้งวันแทบไม่มีแดด ใช้ไฟจากการไฟฟ้าเป็นหลัก");
  }
  // เมฆบังกลางวัน (อ่านจากเส้นกราฟจริง)
  if (m.clouds === "intermittent") parts.push("ช่วงกลางวันมีเมฆบังเป็นช่วงๆ เส้นผลิตตกลงบ้าง");
  else if (m.clouds === "clear" && m.cap && m.genKwh > m.cap) parts.push("แดดต่อเนื่องเกือบทั้งวัน เส้นผลิตเรียบสม่ำเสมอ");

  // ความสมดุลผลิต vs ใช้
  if (m.genKwh > m.useKwh * 1.05) parts.push(`ผลิตได้มากกว่าที่ใช้ (เหลือ ~${u(m.genKwh - m.useKwh)} หน่วย${m.hasBatt ? "ไปเก็บแบต/ไหลย้อน" : "ไหลย้อนเข้าระบบ"})`);
  else if (m.genKwh > 0.1) parts.push(`ผลิตยังไม่พอกับที่ใช้ทั้งวัน ต้องเสริมจาก${m.hasBatt ? "แบต+" : ""}การไฟฟ้า`);

  // การพึ่งพาตัวเอง
  if (m.hasBatt && !m.usedGrid && m.useKwh > 0.1) parts.push("พึ่งพาตัวเองเต็มตัว — ทั้งวันไม่ได้ใช้ไฟจากการไฟฟ้า (off-grid)");
  else if (m.selfSuff >= 80) parts.push(`พึ่งพาตัวเองได้สูงถึง ${m.selfSuff}% ระบบทำงานคุ้มค่า`);
  else if (m.selfSuff >= 50) parts.push(`พึ่งพาตัวเองได้ปานกลาง (${m.selfSuff}%)`);
  else if (m.impKwh > 0.1) parts.push(`ยังพึ่งการไฟฟ้าค่อนข้างมาก (${m.selfSuff}%)`);

  // คำแนะนำที่ทำได้จริง 1 ข้อ — ตามชนิดระบบ + จุดที่ปรับปรุงได้มากสุด
  const lowSoc = m.socMin != null && m.socMin <= 15;
  const lowAtNight = lowSoc && (() => { const h = new Date(m.socMinTs * 1000).getHours(); return h < 6 || h >= 18; })();
  if (m.hasBatt && !m.usedGrid && m.socMin != null && m.socMin <= 12) parts.push("แบตลงต่ำมากและไม่มีกริดสำรอง — เสี่ยงไฟดับ ควรลดโหลดและรอแดดมาชาร์จ");
  else if (!m.hasBatt && m.genKwh > 0.1 && m.expKwh > m.genKwh * 0.2) parts.push("ระบบไม่มีแบต ไฟที่ผลิตเกินจะไหลย้อนทิ้ง — ใช้ไฟตอนกลางวันให้มากที่สุดจะคุ้มสุด");
  else if (m.genKwh > 0.1 && m.expKwh > m.genKwh * 0.2) parts.push("มีไฟไหลย้อนทิ้งเยอะ — ลองเลื่อนเครื่องใช้ไฟฟ้าหนักมาช่วงกลางวันจะคุ้มกว่า");
  else if (lowAtNight) parts.push("แบตลงต่ำช่วงกลางคืน — ถ้าเป็นบ่อยควรลดโหลดกลางคืนหรือเพิ่มความจุแบต");
  else if (lowSoc) parts.push("แบตลงต่ำช่วงแดดน้อย — ระวังใช้ไฟเกินกำลังที่ผลิตได้");
  else if (m.baseLoad > 300) parts.push(`ฐานโหลดช่วงไม่มีแดดค่อนข้างสูง (~${(m.baseLoad / 1000).toFixed(2)} kW) — มีอุปกรณ์กินไฟตลอดเวลา ลองหาดูจะช่วยลดค่าไฟ`);

  return parts.join(" · ") || "ข้อมูลวันนี้ยังไม่พอสำหรับวิเคราะห์เชิงลึก";
}

// ---------- รายเดือน/ปี: รวมยอดพลังงานจริงจาก Deye + คาดการณ์ + CO₂ ----------
function analyzeSpan(range: "month" | "year", points: any[], cap: number): Insight[] {
  const out: Insight[] = [];
  const s = points.reduce(
    (a, p) => ({ gen: a.gen + (p.gen || 0), use: a.use + (p.use || 0), buy: a.buy + (p.buy || 0), sell: a.sell + (p.sell || 0) }),
    { gen: 0, use: 0, buy: 0, sell: 0 }
  );
  const span = range === "month" ? "เดือนนี้" : "ปีนี้";
  const unit = range === "month" ? "วัน" : "เดือน";
  const n = points.length || 1;
  const selfSuff = s.use > 0 ? clamp100(((s.use - s.buy) / s.use) * 100) : 0;
  const selfCons = s.gen > 0 ? clamp100(((s.gen - s.sell) / s.gen) * 100) : 0;
  const saved = (s.use - s.buy) * RATE;
  const co2 = Math.max(0, (s.use - s.buy)) * CO2_PER_KWH; // ไฟที่ไม่ต้องดึงจากระบบ = CO₂ ที่ลดได้

  let best = points[0], worst = points.find((p) => (p.gen || 0) > 0) || points[0];
  for (const p of points) {
    if ((p.gen || 0) > (best.gen || 0)) best = p;
    if ((p.gen || 0) > 0 && (p.gen || 0) < (worst.gen || 0)) worst = p;
  }
  const lbl = (p: any) => range === "month" ? `วันที่ ${Number(String(p.day || "").slice(8)) || "-"}` : monthTh(p.month || "");
  const posDays = points.filter((p) => (p.gen || 0) >= (p.use || 0)).length;
  const noBuyDays = points.filter((p) => (p.buy || 0) < 0.5).length;

  // ช่วงนี้คือช่วงปัจจุบันที่ยังไม่จบหรือไม่ (ไว้คาดการณ์ทั้งช่วง)
  const todayUTC = new Date().toISOString().slice(0, 10);
  const last = points[points.length - 1] || {};
  const isCurrent = range === "month"
    ? String(last.day || "").slice(0, 7) === todayUTC.slice(0, 7)
    : String(last.month || "").slice(0, 4) === todayUTC.slice(0, 4);

  out.push({
    tone: "tip", title: "สรุปภาพรวม",
    detail: `${span}ผลิตได้ ${u(s.gen)} หน่วย ใช้ไป ${u(s.use)} หน่วย — พึ่งพาไฟตัวเองได้ ${selfSuff}% (ส่วนที่ไม่ต้องซื้อ)`,
  });

  // คาดการณ์ทั้งช่วง (เฉพาะช่วงปัจจุบันที่ยังไม่จบ)
  if (isCurrent && n >= 2) {
    const total = range === "month" ? new Date(Date.UTC(Number(todayUTC.slice(0, 4)), Number(todayUTC.slice(5, 7)), 0)).getUTCDate() : 12;
    if (n < total) {
      const projGen = (s.gen / n) * total, projSaved = (saved / n) * total;
      out.push({
        tone: "info", title: `คาดทั้ง${range === "month" ? "เดือน" : "ปี"} ~${u(projGen)} หน่วย`,
        detail: `ผ่านไป ${n}/${total} ${unit} · ประหยัดได้แล้ว ~${b(saved)} บาท → ทั้ง${range === "month" ? "เดือน" : "ปี"}คาด ~${b(projSaved)} บาท`,
        sub: ["คาดการณ์จากค่าเฉลี่ยที่ผ่านมา — ขึ้นกับสภาพอากาศจริง"],
      });
    }
  }

  out.push({
    tone: "ok", title: `${span}ประหยัดค่าไฟ ~${b(saved)} บาท`,
    detail: `ถ้าไม่มีโซลาร์ต้องจ่าย ~${b(s.use * RATE)} บาท · จ่ายจริง ~${b(s.buy * RATE)} บาท`,
    sub: [`ค่าไฟ ~4.4 บาท/หน่วย · ลดการปล่อย CO₂ ~${b(co2)} กก.`],
  });
  out.push({
    tone: "info", title: `เฉลี่ยต่อ${unit} ${u(s.gen / n)} หน่วย`,
    detail: `ผลิตเฉลี่ย ${u(s.gen / n)} · ใช้เฉลี่ย ${u(s.use / n)} หน่วยต่อ${unit} (จาก ${n} ${unit})`,
    sub: cap ? [`ผลิตต่อขนาดระบบ ~${(s.gen / n / cap).toFixed(2)} หน่วยต่อกิโลวัตต์ ในแต่ละ${unit}`] : undefined,
  });
  out.push({
    tone: "ok", title: range === "month" ? `วันแดดจัดที่สุด: ${lbl(best)}` : `เดือนที่ผลิตดีที่สุด: ${lbl(best)}`,
    detail: `ผลิตได้ ${u(best.gen || 0)} หน่วย`,
    sub: [`${range === "month" ? "วันเมฆหนาที่สุด" : "เดือนที่ผลิตน้อยสุด"}: ${lbl(worst)} (${u(worst.gen || 0)} หน่วย)`, `ผลิตได้มากกว่าที่ใช้ ${posDays} จาก ${n} ${unit}`],
  });
  if (s.sell > 0.5) {
    out.push({ tone: "info", title: `ไฟไหลย้อน ${u(s.sell)} หน่วย`, detail: `ใช้ไฟแดดที่ผลิตเองทันที ${selfCons}% · ที่เหลือไหลย้อนเข้าระบบ` });
  } else {
    out.push({ tone: "ok", title: `ใช้ไฟแดดที่ผลิตเองได้ ${selfCons}%`, detail: "แทบไม่มีไฟไหลย้อนทิ้ง — ใช้แดดที่ผลิตได้คุ้มค่า" });
  }
  if (noBuyDays > 0) out.push({ tone: "ok", title: `แทบไม่ต้องซื้อไฟ ${noBuyDays} ${unit}`, detail: `${unit}ที่ใช้แสงอาทิตย์และแบตเตอรี่ได้เกือบทั้งหมด` });
  return out;
}
