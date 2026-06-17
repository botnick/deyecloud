# ARCHITECTURE — โซลาร์บ้านคุณนิก (Deye Solar Monitor)

PWA ดูข้อมูลระบบโซลาร์เซลล์แบบเรียลไทม์ ภาษาไทย สำหรับผู้สูงอายุ
รันบน **Cloudflare Workers ฟรี 100% ($0 free plan)**

---

## 1. Stack

| Layer | Tech |
|---|---|
| Build | **Vite 6** + `@cloudflare/vite-plugin` (dev + build + deploy รวบเดียว) |
| UI | **React 19 + TypeScript** |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, theme เป็น `@theme` ใน `src/index.css`) + design tokens รวมที่ `src/lib/ui.ts` |
| Weather icons | **Meteocons** (`@meteocons/svg`, MIT) — animated SVG จริงตามหลัก meteorology, bundle ลง assets → precache (offline) |
| Offline / PWA | **vite-plugin-pwa** (Workbox generateSW; `globPatterns` รวม svg/webp/woff → precache ครบ ใช้ offline ได้จริง) |
| API / Worker | **Hono 4** บน Cloudflare Workers |
| Database | **Cloudflare D1** (SQLite) — เก็บ history + cache + token |
| Cron | **Cloudflare Cron Triggers** (poll ทุก 5 นาที) |
| Static hosting | **Workers Static Assets** (binding `ASSETS`, SPA fallback) |

ทุกอย่างอยู่ใน Worker เดียว: เสิร์ฟ SPA + `/api/*` + cron + D1

---

## 2. Data flow

```
            ┌─────────────────────── Browser (PWA) ───────────────────────┐
            │  React SPA  ──fetch /api/*──►  (cookie: PIN HMAC)            │
            └───────────────────────────────┬─────────────────────────────┘
                                             │
                              ┌──────────────▼──────────────┐
                              │   Cloudflare Worker (Hono)   │
                              │  assets + /api/* + scheduled │
                              └───┬───────────┬───────────┬──┘
                                  │           │           │
                   ┌──────────────▼──┐   ┌────▼─────┐   ┌─▼───────────────┐
                   │ Deye Open API   │   │   D1     │   │ TMD NWP (อุตุฯ)  │
                   │ developer.deye  │   │ history  │   │ + Open-Meteo     │
                   │ cloud.com/v1.0  │   │ cache    │   │ (fallback)       │
                   └─────────────────┘   └──────────┘   └──────────────────┘
```

---

## 3. แหล่งข้อมูล (data sources)

### Deye — primary = **Open API** (`https://eu1-developer.deyecloud.com/v1.0`)
- Token: `POST /account/token?appId=` ด้วย `appSecret + email + sha256(password) + companyId` → token อายุ ~60 วัน, **renew อัตโนมัติ** (cache ใน D1 `meta`, ขอใหม่เมื่อเหลือ <1 วัน)
- Realtime: `POST /station/latest` → power (generationPower, consumptionPower, wirePower, batteryPower, batterySOC)
- พลังงานรายวัน: `POST /station/history` granularity=2 (day) → generationValue, consumptionValue, purchaseValue, gridValue, chargeValue, dischargeValue
- กราฟ: `POST /station/history` granularity=1 (frame, 5 นาที 288 จุด)
- Device detail: `POST /device/latest` + `/device/measurePoints` (PV strings, AC phase, BMS)

> **Latest = latest + day-history ประกอบกัน** เพราะ Open API แยกค่า realtime กับพลังงานรายวันคนละ endpoint
> `selfSufficiency` คำนวณเอง = `(1 − purchaseValue / consumptionValue) × 100` (พึ่งพาตัวเอง = ไฟที่ใช้โดยไม่ซื้อ)

### Deye — fallback = internal API (session token)
- ถ้าไม่มี password แต่มี `DEYE_SESSION_TOKEN` → ใช้ `eu1.deyecloud.com/maintain-s/*` (ข้อมูลตรง dashboard)
- กันจอเปล่าระหว่างยังไม่ใส่ password. logic เลือก source อยู่ที่ `passwordReady()` ใน `src/worker/deye.ts`

### Weather — primary = **TMD NWP** (กรมอุตุฯ) / fallback = Open-Meteo
- พิกัด **ดึงจาก station เอง** (locationLat/Lng) — ไม่ hardcode
- cond 1–12 → map เป็น Meteocons (clear-day/clear-night/partly/overcast/rain/storm ฯลฯ แยกกลางวัน-กลางคืน) + คำไทย + คำนวณ "พลังงานแสง" จาก swdown (`src/lib/wxicon.tsx`)

---

## 4. Dynamic — ไม่ hardcode อะไรเลย
- **Station**: `listStations()` ค้นจาก API → `getStationMeta()` เลือก + cache ใน D1. ไม่มี stationId คาไว้ในโค้ด
- **พิกัดอากาศ / ชื่อ / กำลังติดตั้ง**: มาจาก station ที่ค้นเจอ
- **รองรับหลาย station / หลายเครื่องในอนาคต**: `/api/stations` คืน array; endpoint รับ `stationId`/`deviceId` param ได้ → ต่อ UI switcher ได้ทันที

---

## 5. API routes (Hono — `src/worker/index.ts`)

| Route | ใช้ |
|---|---|
| `POST /api/login` | ตรวจ PIN → ตั้ง cookie HMAC |
| `GET /api/session` | เช็ค auth |
| `GET /api/station` / `GET /api/stations` | station ที่เลือก / ทั้งหมด |
| `GET /api/latest` | realtime + พลังงานวันนี้ (cache 60s ใน D1) |
| `GET /api/weather` | TMD/Open-Meteo (cache 30 นาที) |
| `GET /api/history?range=day\|month\|year` | กราฟย้อนหลัง |

middleware: `ensureSchema` (สร้าง table) + auth gate (`/api/*` ยกเว้น login/session)

---

## 6. D1 schema (auto-migrate ตอน request แรก — ไม่ต้องรัน migration)
- `meta(k,v)` — token + expiry, station cache, latest/weather cache
- `samples(ts, gen_power, use_power, grid_power, batt_power, soc, gen_today, use_today)` — snapshot ทุก 5 นาที
- `daily(day, gen, use, buy, sell, charge, discharge)` — สรุปรายวัน

---

## 7. Auth
PIN → `HMAC-SHA256(APP_PIN)` เป็น cookie `deye_auth` (HttpOnly, Secure เฉพาะ https).
ไม่มี PIN = เปิด public. secret ฝั่ง Deye อยู่ใน Worker เท่านั้น — ผู้ใช้ไม่ต้อง login บัญชี Deye

---

## 8. ทำไม $0 (Cloudflare free plan)

| Resource | Free limit | ใช้จริง |
|---|---|---|
| Workers requests | 100,000/วัน | cron 288 + ผู้ใช้ไม่กี่คน → << limit |
| Workers Static Assets | ฟรี ไม่จำกัด | เสิร์ฟ SPA |
| D1 | 5GB, 5M reads/วัน | ~288 แถว/วัน |
| Cron Triggers | ฟรี | ทุก 5 นาที |
| TMD / Open-Meteo | ฟรี | cache 30 นาที (TMD limit 60 req/min) |

→ ไม่มีทางเกิน free tier

---

## 9. โครงสร้างโปรเจกต์
```
wrangler.jsonc          main=worker, assets, D1, cron, vars
vite.config.ts          react + tailwind + cloudflare + pwa
src/
  main.tsx App.tsx index.css
  lib/      api.ts format.ts weather.ts analysis.ts device.ts
            ui.ts (design tokens) icons.tsx (line icons) wxicon.tsx (Meteocons map)
  components/ Splash PinGate Header BottomNav FlowDiagram
              HomeView TodayView WeatherView HistoryView DeviceView
              Tile AnalysisCard AnimatedNumber Chart
  worker/
    index.ts  Hono app + cron + weather
    deye.ts   Deye client (Open API + fallback) + station discovery
```

---

## 10. Deploy ($0)
```bash
npm install
npx wrangler login
npx wrangler d1 create deye-monitor      # เอา id ใส่ wrangler.jsonc
npx wrangler secret put DEYE_APP_SECRET
npx wrangler secret put DEYE_PASSWORD
npx wrangler secret put APP_PIN
npx wrangler secret put TMD_TOKEN
npm run deploy                            # vite build + wrangler deploy
```
table สร้างเองตอน request แรก. cron เริ่มอัตโนมัติ. เปิดบนมือถือ → Add to Home Screen = แอป PWA offline

---

## 11. UI / Design system (ออกแบบทิศทางเดียว — เน้นผู้สูงอายุ)

ธีม **Solurna** (อิง Figma kit): Primary **เหลือง #FFCC00** (ปุ่ม, ตัวอักษรดำบนปุ่ม) + Secondary **ม่วง #A20DDD** (nav active, accent), card ขาว `rounded-[20px]` เงานุ่ม, พื้น `#f5f5f6`. token รวมที่ `src/lib/ui.ts` (`card`, `cardP`, `cardSm`, `h2/h2First/h2Mid`) — แก้ที่เดียวเปลี่ยนทั้งแอป.

**เน้นผู้สูงอายุ:**
- nav **4 ปุ่ม** (หน้าหลัก / วันนี้ / อากาศ / ย้อนหลัง) — หน้า "เครื่อง" (technical) ซ่อนหลังปุ่ม "รายละเอียด" บน Home (มีปุ่มย้อนกลับ)
- **status banner ใหญ่มีคำ+ไอคอน** บนสุด Home → ดู "ปกติ/มีปัญหา" ใน 1 วิ
- ตัวเลขใหญ่ ตัวอักษร ≥14px คอนทราสต์สูง ภาษาไทยง่าย ปุ่มแตะ ≥44px ไม่มี emoji

**ภาพ/แอนิเมชัน:** hero "Card_Home" = บ้าน solar **วาดด้วย inline SVG เอง** (ไม่ใช้รูป raster) + แดดหมุน/บ้านลอย; weather = หน้า immersive ม่วง night-sky + ดาว + Meteocons; energy FlowDiagram เส้นวิ่ง. ทุก animation เคารพ `prefers-reduced-motion`.
