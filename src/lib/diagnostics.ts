import type { DeviceData } from "./api";
import type { Insight } from "./analysis";
import { batteryChannels } from "./device";

// วิเคราะห์ระดับ "เครื่อง" จาก measure point ของอินเวอร์เตอร์ (ที่ /api/device ดึงมาอยู่แล้ว)
// ต่างจาก analysis.ts ที่ดูภาพรวมพลังงาน (ผลิต/ใช้/เงิน) — ไฟล์นี้ดูสุขภาพระบบไฟฟ้า
// แบบที่ช่างจะดู: สมดุลเฟส, แบตแชร์โหลดกันไหม, โหลดเครื่อง, แรงดัน/ความถี่, อุณหภูมิ.
//
// กติกา: ทุกข้อ "เงียบ" ถ้าไม่มีข้อมูลหรือค่ายังไม่ถึงเกณฑ์ — ไม่เดา ไม่เตือนมั่ว
// เพราะการเตือนผิดบ่อย ๆ ทำให้คนเลิกอ่าน.

const f1 = (n: number) => n.toFixed(1);
const w = (n: number) => Math.round(n).toLocaleString("th-TH");

// Grid nominals are a property of the SITE (230 V/50 Hz here, 120 V/60 Hz in North
// America), so they are NOT hardcoded — they come in from config via `GridNominal`.
//
// They are also deliberately NOT inferred from the live readings. Snapping the
// measured voltage to the nearest standard sounds adaptive but is self-defeating:
// on a 230 V site where every phase has sagged to 200 V, the "inferred nominal"
// becomes 200 and the brownout is declared healthy — the inference hides exactly
// the common-mode fault the check exists to catch. A measurement cannot be both
// the baseline and the anomaly.
//
// So: absolute V/Hz alarms run only when a nominal is supplied independently.
// Without one they are skipped, and only the RELATIVE checks (phase-to-phase
// spread) run — those compare phases against each other and stay valid with no
// baseline at all.
export interface GridNominal { v?: number; hz?: number; }
const TOLERANCE_V = 0.1; // ±10% — the band virtually every grid code uses
const TOLERANCE_HZ = 0.01; // ±1% → ±0.5 Hz on a 50 Hz grid, ±0.6 Hz on 60 Hz
const PHASE_V_SPREAD_PCT = 6; // healthy 3-phase supplies sit well inside this

function reader(list: DeviceData[]) {
  const map = new Map<string, number>();
  for (const d of list || []) {
    const v = Number(d.value);
    if (!Number.isNaN(v)) map.set(d.key, v);
  }
  return (k: string) => map.get(k);
}

// ความไม่สมดุลของชุดค่า = (มากสุด − น้อยสุด) / มากสุด
function spread(vals: number[]): { max: number; min: number; sum: number; pct: number } {
  const max = Math.max(...vals), min = Math.min(...vals);
  const sum = vals.reduce((a, x) => a + x, 0);
  return { max, min, sum, pct: max > 0 ? ((max - min) / max) * 100 : 0 };
}

export function analyzeDevice(dataList: DeviceData[], nominal: GridNominal = {}): Insight[] {
  const out: Insight[] = [];
  if (!dataList || !dataList.length) return out;
  const n = reader(dataList);
  const phases = ["A", "B", "C"] as const;

  // ---- 1) สมดุลโหลด 3 เฟส -------------------------------------------------
  // ไฟบ้าน 3 เฟสควรกระจายใกล้เคียงกัน ถ้าเฟสเดียวรับหนักจะร้อน สายเสื่อมเร็ว
  // และนิวทรัลมีกระแสไหลมาก — เป็นปัญหาที่แก้ได้ด้วยการย้ายวงจร
  const load = phases.map((p) => n(`LoadPhasePower${p}`)).filter((x): x is number => x != null);
  if (load.length === 3) {
    const s = spread(load.map(Math.abs));
    if (s.sum > 500 && s.pct >= 40) {
      const heavy = phases[load.map(Math.abs).indexOf(s.max)];
      out.push({
        tone: s.pct >= 65 ? "warn" : "info",
        title: `โหลด 3 เฟสไม่สมดุล (${Math.round(s.pct)}%)`,
        detail:
          `เฟส ${heavy} รับหนักสุด ${w(s.max)} W คิดเป็น ${Math.round((s.max / s.sum) * 100)}% ของโหลดทั้งบ้าน` +
          ` — เฟสที่เบาสุดใช้แค่ ${w(s.min)} W`,
        sub: [
          phases.map((p, i) => `เฟส ${p} ${w(Math.abs(load[i]))} W`).join(" · "),
          "โหลดเทไปเฟสเดียวทำให้สายและเบรกเกอร์เฟสนั้นร้อนกว่าปกติ ลองย้ายวงจรใหญ่ (แอร์/เครื่องทำน้ำอุ่น) ไปเฟสที่เบากว่า",
        ],
      });
    }
  }

  // ---- 2) ช่องแบตแชร์โหลดกันหรือไม่ -----------------------------------------
  // ช่องแบตที่ต่อขนานควรจ่าย/รับกระแสใกล้เคียงกัน ถ้าช่องหนึ่งนิ่งสนิทขณะอีกช่องทำงาน
  // มักแปลว่าเบรกเกอร์ปิด สายหลวม BMS ตัด หรือแรงดันสองฝั่งต่างกันมาก
  // (เป็น "ช่อง" ของอินเวอร์เตอร์ ไม่ใช่จำนวนลูกแบต — หนึ่งช่องอาจต่อหลายลูกขนานกัน)
  const chans = batteryChannels(dataList);
  if (chans.length >= 2) {
    const cur = chans.map((ch) => n(`BatteryCurrent${ch}`) ?? 0);
    const mag = cur.map(Math.abs);
    const s = spread(mag);
    const idle = chans.filter((_, i) => mag[i] < Math.max(0.5, s.max * 0.15));
    const detail = chans.map((ch, i) => `ช่อง ${ch} ${f1(cur[i])} A`).join(" · ");
    if (s.max >= 2 && idle.length) {
      out.push({
        tone: "warn",
        title: `ช่องแบตไม่แชร์โหลด — ช่อง ${idle.join(", ")} แทบไม่จ่ายกระแส`,
        detail: `${detail} (ช่องที่ทำงานหนักสุด ${f1(s.max)} A)`,
        sub: [
          "ช่องที่นิ่งอาจเบรกเกอร์ปิด สายหลวม BMS ตัด หรือแรงดันต่างจากอีกฝั่งมาก",
          "ถ้าปล่อยไว้ ฝั่งที่ทำงานคนเดียวจะเสื่อมเร็วกว่า และใช้ความจุได้ไม่เต็มระบบ",
        ],
      });
    }
  }

  // ---- 3) โหลดของอินเวอร์เตอร์เทียบพิกัด ------------------------------------
  const rated = n("RatedPower");
  const outPow = n("TotalInverterOutputPower");
  if (rated && rated > 0 && outPow != null && outPow > 50) {
    const pct = (outPow / rated) * 100;
    if (pct >= 85) {
      out.push({
        tone: pct >= 95 ? "warn" : "info",
        title: `อินเวอร์เตอร์ทำงานหนัก ${Math.round(pct)}% ของพิกัด`,
        detail: `จ่ายอยู่ ${w(outPow)} W จากพิกัด ${w(rated)} W — ใกล้เต็มกำลัง ระวังโหลดเกิน`,
      });
    }
  }

  // ---- 4) แรงดันกริด -------------------------------------------------------
  const gv = [1, 2, 3].map((i) => ({ ph: `L${i}`, v: n(`GridVoltageL${i}`) })).filter((x) => x.v != null && x.v! > 50) as { ph: string; v: number }[];

  // 4a) เทียบกับ nominal — ทำเฉพาะเมื่อมีการตั้งค่ามาจากภายนอกเท่านั้น
  // (ถ้าไม่ได้ตั้ง จะข้ามไปเลย ดีกว่าเดา nominal จากค่าที่วัดแล้วกลบ fault ทั้งระบบ)
  if (gv.length && nominal.v && nominal.v > 0) {
    const lo = nominal.v * (1 - TOLERANCE_V), hi = nominal.v * (1 + TOLERANCE_V);
    const bad = gv.filter((x) => x.v < lo || x.v > hi);
    if (bad.length) {
      out.push({
        tone: "warn",
        title: "แรงดันไฟจากการไฟฟ้าอยู่นอกเกณฑ์",
        detail:
          bad.map((x) => `${x.ph} ${f1(x.v)} V`).join(" · ") +
          ` — เกณฑ์ ${Math.round(lo)}–${Math.round(hi)} V (${nominal.v} V ±${Math.round(TOLERANCE_V * 100)}%)`,
        sub: ["ถ้าเป็นบ่อย ควรแจ้งการไฟฟ้า — แรงดันผิดปกติทำให้อินเวอร์เตอร์ตัดและเครื่องใช้ไฟฟ้าเสียหายได้"],
      });
    }
  }

  // 4b) แรงดันสามเฟสต่างกันเอง — เป็นการเทียบ "กันเอง" ไม่ต้องรู้ nominal
  // จึงใช้ได้เสมอ และจับอาการเฟสหลุด/นิวทรัลหลวมได้ตรงกว่าค่าสัมบูรณ์
  if (gv.length === 3) {
    const s = spread(gv.map((x) => x.v));
    if (s.pct >= PHASE_V_SPREAD_PCT) {
      out.push({
        tone: "warn",
        title: `แรงดันสามเฟสต่างกันมาก (${Math.round(s.pct)}%)`,
        detail: gv.map((x) => `${x.ph} ${f1(x.v)} V`).join(" · "),
        sub: ["ปกติสามเฟสควรใกล้เคียงกัน — ต่างกันมากมักมาจากโหลดเอียงหนัก สายนิวทรัลหลวม หรือหม้อแปลงมีปัญหา"],
      });
    }
  }

  // ---- 5) ความถี่กริด — เช่นเดียวกัน ต้องมี nominal จากภายนอกก่อน -------------
  const hz = n("GridFrequency") ?? n("ACOutputFrequencyR");
  if (hz != null && hz > 0 && nominal.hz && nominal.hz > 0) {
    const tol = nominal.hz * TOLERANCE_HZ;
    if (Math.abs(hz - nominal.hz) > tol) {
      out.push({
        tone: "warn",
        title: `ความถี่ไฟผิดปกติ ${hz.toFixed(2)} Hz`,
        detail: `ปกติควรอยู่ราว ${nominal.hz.toFixed(2)} Hz (±${tol.toFixed(2)}) — ถ้าค้างนอกเกณฑ์ อินเวอร์เตอร์อาจตัดตัวเองออกจากกริด`,
      });
    }
  }

  // ---- 6) อุณหภูมิ ----------------------------------------------------------
  const tInv = n("AC Temperature");
  if (tInv != null && tInv >= 60) {
    out.push({
      tone: tInv >= 75 ? "warn" : "info",
      title: `อินเวอร์เตอร์ร้อน ${f1(tInv)}°C`,
      detail: tInv >= 75 ? "ร้อนมาก — เช็คพัดลมและการระบายอากาศ เครื่องอาจลดกำลังเองเพื่อป้องกัน" : "เริ่มร้อน ควรดูการระบายอากาศรอบเครื่อง",
    });
  }
  const tBat = n("Temperature- Battery");
  if (tBat != null && (tBat >= 45 || tBat <= 5)) {
    out.push({
      tone: "warn",
      title: `อุณหภูมิแบตผิดปกติ ${f1(tBat)}°C`,
      detail: tBat >= 45 ? "แบตร้อนเกินไป — BMS อาจจำกัดการชาร์จ/จ่าย และอายุแบตสั้นลง" : "แบตเย็นเกินไป — ลิเธียมชาร์จตอนอุณหภูมิต่ำจะเสื่อมเร็ว",
    });
  }

  // ---- 7) อัตราส่วนจ่ายออก/ชาร์จเข้า (ตัวเลขสะสมตลอดอายุ) --------------------
  // ตั้งใจ *ไม่* เรียกว่า "ประสิทธิภาพ round-trip" — ค่า round-trip จริงต้องวัดจาก
  // ช่วงที่ SOC ต้นทาง/ปลายทางเท่ากัน ส่วนนี่คือมิเตอร์สะสมสองตัวหารกัน ซึ่งยังมี
  // พลังงานค้างในแบตปนอยู่ ใช้ดูแนวโน้มคร่าว ๆ ได้ แต่อย่าอ่านเป็นค่าประสิทธิภาพ
  // เงียบเมื่อค่าปกติ — ขึ้นเฉพาะตอนต่ำผิดสังเกต ไม่งั้นจะเป็นการ์ดถาวรที่ไม่มีใครอ่าน
  const chg = n("TotalChargeEnergy"), dis = n("TotalDischargeEnergy");
  if (chg && dis && chg > 50) {
    const ratio = (dis / chg) * 100;
    if (ratio < 85) {
      out.push({
        tone: "info",
        title: `แบตจ่ายออก/ชาร์จเข้า ~${Math.round(ratio)}%`,
        detail: `ตลอดอายุการใช้งาน ชาร์จเข้า ${w(chg)} หน่วย · จ่ายออก ${w(dis)} หน่วย`,
        sub: ["เป็นอัตราส่วนมิเตอร์สะสม ไม่ใช่ประสิทธิภาพ round-trip จริง (ยังมีพลังงานค้างในแบตปนอยู่) — ใช้ดูแนวโน้มระยะยาว"],
      });
    }
  }

  // ---- 8) สตริง PV ไม่เท่ากัน (เฉพาะตอนแดดออกจริง) --------------------------
  // เทียบเฉพาะสตริงที่ "ต่ออยู่" (มีแรงดัน) — สตริงว่างแรงดัน 0 ไม่ใช่ความผิดปกติ
  const strings = [1, 2, 3, 4]
    .map((i) => ({ i, v: n(`DCVoltagePV${i}`) ?? 0, p: n(`DCPowerPV${i}`) ?? 0 }))
    .filter((x) => x.v > 50);
  if (strings.length >= 2) {
    const s = spread(strings.map((x) => x.p));
    if (s.sum > 500 && s.pct >= 40) {
      const weak = strings.filter((x) => x.p < s.max * 0.6).map((x) => `PV${x.i}`);
      out.push({
        tone: "info",
        title: `สตริงแผงผลิตไม่เท่ากัน (${Math.round(s.pct)}%)`,
        detail: strings.map((x) => `PV${x.i} ${w(x.p)} W`).join(" · ") + ` — ${weak.join(", ")} ผลิตต่ำกว่าเพื่อน`,
        sub: ["สาเหตุที่พบบ่อย: เงาบัง (ต้นไม้/เสา) แผงสกปรก หรือจำนวนแผงต่อสตริงไม่เท่ากัน"],
      });
    }
  }

  return out;
}
