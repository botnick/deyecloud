import type { DeviceData } from "./api";

export interface DGroup { id: string; title: string; items: DeviceData[]; }

// Thai labels for the common inverter measure points (fallback = the raw key).
const LABEL: Record<string, string> = {
  RatedPower: "กำลังพิกัด",
  DCVoltagePV1: "แรงดัน PV1", DCVoltagePV2: "แรงดัน PV2", DCVoltagePV3: "แรงดัน PV3", DCVoltagePV4: "แรงดัน PV4",
  DCCurrentPV1: "กระแส PV1", DCCurrentPV2: "กระแส PV2", DCCurrentPV3: "กระแส PV3", DCCurrentPV4: "กระแส PV4",
  DCPowerPV1: "กำลัง PV1", DCPowerPV2: "กำลัง PV2", DCPowerPV3: "กำลัง PV3", DCPowerPV4: "กำลัง PV4",
  TotalSolarPower: "กำลังรวมแผง",
  ACVoltageRUA: "แรงดัน AC L1", ACVoltageSVB: "แรงดัน AC L2", ACVoltageTWC: "แรงดัน AC L3",
  ACCurrentRUA: "กระแส AC L1", ACCurrentSVB: "กระแส AC L2", ACCurrentTWC: "กระแส AC L3",
  ACOutputFrequencyR: "ความถี่ AC",
  InverterOutputPowerL1: "กำลังออก L1", InverterOutputPowerL2: "กำลังออก L2", InverterOutputPowerL3: "กำลังออก L3",
  TotalInverterOutputPower: "กำลังออกรวม", TotalActiveProduction: "ผลิตสะสม", DailyActiveProduction: "ผลิตวันนี้",
  GridVoltageL1: "แรงดันกริด L1", GridVoltageL2: "แรงดันกริด L2", GridVoltageL3: "แรงดันกริด L3",
  GridCurrentL1: "กระแสกริด L1", GridCurrentL2: "กระแสกริด L2", GridCurrentL3: "กระแสกริด L3",
  GridPowerL1: "กำลังกริด L1", GridPowerL2: "กำลังกริด L2", GridPowerL3: "กำลังกริด L3",
  ExternalCT1Power: "CT1", ExternalCT2Power: "CT2", ExternalCT3Power: "CT3", TotalExternalCTPower: "CT รวม",
  GridFrequency: "ความถี่กริด", TotalGridPower: "กำลังกริดรวม",
  DailyGridFeedIn: "ไฟย้อนวันนี้", DailyEnergyPurchased: "ซื้อไฟวันนี้", TotalEnergyBuy: "ซื้อสะสม", TotalEnergySell: "ไฟย้อนสะสม",
  LoadVoltageL1: "แรงดันโหลด L1", LoadVoltageL2: "แรงดันโหลด L2", LoadVoltageL3: "แรงดันโหลด L3",
  LoadPowerL1: "กำลังโหลด L1", LoadPowerL2: "กำลังโหลด L2", LoadPowerL3: "กำลังโหลด L3",
  TotalConsumptionPower: "กำลังใช้รวม", TotalConsumptionApparentPower: "กำลังปรากฏ",
  DailyConsumption: "ใช้วันนี้", TotalConsumption: "ใช้สะสม", LoadFrequency: "ความถี่โหลด",
  LoadPhasePowerA: "โหลดเฟส A", LoadPhasePowerB: "โหลดเฟส B", LoadPhasePowerC: "โหลดเฟส C",
  BatteryVoltage: "แรงดันแบต", BatteryCurrent1: "กระแสแบต 1", BatteryCurrent2: "กระแสแบต 2", BatteryPower: "กำลังแบต",
  SOC: "ระดับแบต", TotalChargeEnergy: "ชาร์จสะสม", TotalDischargeEnergy: "จ่ายสะสม",
  DailyChargingEnergy: "ชาร์จวันนี้", DailyDischargingEnergy: "จ่ายวันนี้", BatteryRatedCapacity: "ความจุแบต",
  BatteryTotalCurrent: "กระแสแบตรวม",
  BMSVoltage: "BMS แรงดัน", BMSCurrent: "BMS กระแส", BMSChargeVoltage: "BMS แรงดันชาร์จ",
  BMSDisChargeVoltage: "BMS แรงดันจ่าย", BMSSOC: "BMS SOC",
  "Temperature- Battery": "อุณหภูมิแบต", "AC Temperature": "อุณหภูมิเครื่อง",
  GenPowerL1: "กำลัง L1", GenPowerL2: "กำลัง L2", GenPowerL3: "กำลัง L3",
  GenVoltageL1: "แรงดัน L1", GenVoltageL2: "แรงดัน L2", GenVoltageL3: "แรงดัน L3",
  GeneratorActivePower: "กำลังเครื่องปั่น", TotalGeneratorPower: "กำลังรวม", TotalGeneratorProduction: "ผลิตสะสม",
  UPSLoadPower: "กำลัง UPS",
};

const GROUPS: { id: string; title: string; test: RegExp }[] = [
  { id: "pv", title: "แผงโซลาร์ (PV)", test: /PV[1-4]|SolarPower|^RatedPower$/ },
  { id: "ac", title: "ไฟขาออก (AC)", test: /^AC|InverterOutputPower|ActiveProduction/ },
  { id: "grid", title: "การไฟฟ้า (Grid)", test: /Grid|ExternalCT|Energy(Purchased|Buy|Sell)|FeedIn/ },
  { id: "load", title: "โหลดบ้าน (Load)", test: /Load|Consumption/ },
  { id: "batt", title: "แบตเตอรี่ + BMS", test: /Battery|^SOC$|BMS|Charge|Discharge|Temperature/ },
  { id: "gen", title: "เครื่องปั่นไฟ (Generator)", test: /Gen/ },
  { id: "other", title: "อื่นๆ", test: /.*/ },
];

export function groupDevice(dataList: DeviceData[]): DGroup[] {
  const groups: DGroup[] = GROUPS.map((g) => ({ id: g.id, title: g.title, items: [] }));
  for (const d of dataList || []) {
    const item: DeviceData = { ...d, key: LABEL[d.key] || d.key };
    const g = GROUPS.find((x) => x.test.test(d.key)) || GROUPS[GROUPS.length - 1];
    groups.find((x) => x.id === g.id)!.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}

export const INVERTER_TYPE_TH = (t: string) =>
  /three phase/i.test(t) ? "อินเวอร์เตอร์ 3 เฟส ไฮบริด" : /hybrid/i.test(t) ? "อินเวอร์เตอร์ไฮบริด" : t;
