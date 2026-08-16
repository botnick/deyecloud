# ARCHITECTURE — โซลาร์มอนิเตอร์ (Deye Solar Monitor)

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
| Offline / PWA | **vite-plugin-pwa** (Workbox generateSW; `globPatterns` รวม svg/webp/woff → precache ครบ ใช้ offline ได้จริง) + `InstallPrompt` (แถบ "เพิ่มลงหน้าจอโฮม" ปรับตาม device: Android/Chrome one-tap, iOS/iPad/macOS Safari, Firefox) |
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
> **Open API เท่านั้น** — ไม่มี fallback ภายในอื่น (เอา session-token internal API ออกแล้ว)

### Weather — primary = **TMD NWP** (กรมอุตุฯ) / fallback = Open-Meteo
- พิกัด **ดึงจาก station เอง** (locationLat/Lng) — ไม่ hardcode
- cond 1–12 → map เป็น Meteocons (clear-day/clear-night/partly/overcast/rain/storm ฯลฯ แยกกลางวัน-กลางคืน) + คำไทย + คำนวณ "พลังงานแสง" จาก swdown (`src/lib/wxicon.tsx`)
- **ดัชนี UV** ดึงจาก Open-Meteo `uv_index` (TMD ไม่มี field นี้) ผ่าน `fetchUV()` — แสดงค่า + ระดับ/สีตามมาตรฐาน WHO

---

## 4. Dynamic — ไม่ hardcode อะไรเลย
- **Station**: `listStations()` ค้นจาก API → `getStationMeta()` เลือกตัวแรก + cache ใน D1. ไม่มี stationId คาไว้ในโค้ด (ปักเจาะจงได้ด้วย env `DEYE_STATION_ID`)
- **พิกัดอากาศ / ชื่อ / กำลังติดตั้ง**: มาจาก station ที่ค้นเจอ (override ได้ด้วย `WEATHER_LAT`/`LON`/`PLACE`)
- **ค่าบัญชี / ติดต่อ / endpoint เป็น env ล้วน**: `DEYE_APP_ID`/`DEYE_EMAIL` ตั้งต่อ Worker (ไม่ commit), `DEYE_COMPANY_ID`/`CONTACT_EMAIL`/`DEYE_BASE_URL`/`TMD_BASE` ปรับได้; ค่าไฟ/CO₂ ที่ `src/lib/config.ts`
- **หลายสถานี (multi-station) — ทำแล้ว**: `/api/stations` คืน array; `/api/latest|device|history` รับ `?station=` param (cache แยก key ต่อสถานี). UI มี **ตัวสลับสถานี** (`StationSwitcher` — bottom sheet) บนหัวจอ โผล่เฉพาะตอนมี >1 สถานี, จำค่าที่เลือก. สถานีเดียว = ไม่ส่ง param → พฤติกรรมเดิมเป๊ะ (อากาศยังอิงพิกัดสถานีหลัก เพราะ Open API `/station/list` ไม่ส่งพิกัดรายสถานี)

---

## 5. API routes (Hono — `src/worker/index.ts`)

| Route | ใช้ |
|---|---|
| `POST /api/login` | ตรวจ PIN → ตั้ง cookie HMAC |
| `GET /api/session` | เช็ค auth |
| `GET /api/station` / `GET /api/stations` | station ที่เลือก / ทั้งหมด |
| `GET /api/latest` | realtime + พลังงานวันนี้ (cache 60s) · **503 `{offline:true}`** ถ้าเชื่อม Deye ไม่ได้ · รับ `?station=` |
| `GET /api/device` | ค่าเครื่อง (เฟส/PV/BMS) cache 60s · รับ `?station=` |
| `GET /api/weather` | TMD/Open-Meteo + UV (cache 30 นาที) |
| `GET /api/history?range=day\|month\|year` | กราฟย้อนหลัง (D1 ก่อน → Deye) · รับ `?station=` |
| `GET /api/device/history?sn=&days=&keys=` | แนวโน้มค่าเครื่องจาก `device_samples` (bucket ≤240 จุด/คีย์, memo 10 นาที) |
| `GET /api/export?range=day\|month\|year\|all&date=` | CSV จาก D1 ของสถานีหลัก (BOM, attachment) — สำหรับสคริปต์ · ปุ่มในแอปสร้าง CSV ฝั่ง client จากข้อมูลที่แสดงอยู่ (ทุกสถานี) |
| `GET /api/settings` / `POST /api/settings` | ค่าไฟ/ขายคืน/ทุน/CO₂ (whitelist) |
| `GET /api/_health` | **public** — `ok:false` + **503** เมื่อ sample ล่าสุดเก่ากว่า `STALE_AFTER_S` (2 รอบ cron + 120 วิ) · `lastPollError` · `deyeLogin` (fails/hold) |
| `POST /api/_backfill?from=&to=` | **operator** — เติมข้อมูลจาก Deye history (json_each 1 statement/วัน, cap วัน/ครั้งคำนวณจากงบ D1+fetch, หยุดเมื่อ auth พัง, `nextFrom/retryFrom`) |
| `POST /api/_alert_test` | **operator** — ส่งข้อความทดสอบทุกช่องทาง (`ok` เฉพาะเมื่อได้ 2xx) |

middleware: `ensureSchema` → auth gate (`/api/*` ยกเว้น login/session/_health) → **operator gate** (`/api/_*` ต้องมี `APP_PIN` ตั้งไว้ + login — ไม่ตั้ง PIN = ดูได้แต่เขียน/ดู raw ไม่ได้) · debug: `/api/_poll` `/api/_debug` `/api/_hist` `/api/_dev` · `onError` ส่งข้อความเต็มเฉพาะ operator

**ความทนทาน (resilience):**
- **token**: memory → D1 → login · login เป็น single-flight และมี **hold ทวีคูณ 60 วิ→6 ชม.** หลังล้มเหลว (6 ชม.ทันทีถ้า Deye บอกเหลือ ≤2 attempt) · error ทั่วไป ≥400 จะ re-login เฉพาะเมื่อ token อายุ ≥10 นาที · token ใหม่ที่ถูกปฏิเสธซ้ำนับเป็น fail · ล้าง fail เมื่อ API call สำเร็จจริง
- **memo 30 วิ** สำหรับ `/device/latest` `/station/device` `/station/list` `/station/alertList` — cron 1 รอบเรียก inverter ครั้งเดียว
- `/station/latest` ส่ง power ที่ top-level (จับให้ถูก ไม่งั้นขึ้น offline ผิด) · เชื่อมไม่ได้ → frontend ขึ้นแถบ "เชื่อมต่อระบบไม่ได้" + คงข้อมูลล่าสุด + ลองใหม่ทุก 20s
- cron **ไม่บันทึกค่า 0** ตอน Deye ล่ม · day-totals ล้มเหลว → เก็บ sample แต่**ไม่**ทับ `daily` (`Latest.totalsOk`) · scheduled catch เก็บ `last_poll_error` · **self-heal**: กลับมาแล้วเห็นช่องว่าง > STALE → `backfillRange` เติมวันล่าสุด (cap คำนวณจากงบของ tick)
- **PIN**: claim ที่นั่งแบบ CAS ก่อนเทียบ (`meta.pin_guard = fails|nextAllowed`) → 3 ครั้งฟรี แล้วหน่วง 5 วิ ×2 ≤15 นาที; คำขอที่ถูกปฏิเสธไม่แตะ state · cookie = `iat.HMAC(APP_PIN, scheme+iat)` หมดอายุเอง เทียบ constant-time

---

## 6. D1 schema (auto-migrate แบบ versioned — `schema_v` ใน `meta`, รันเองตอน request แรก ไม่ต้องสั่ง migration)
- `meta(k,v)` — token (+`_exp`,`_at`), login guard (`deye_login_fails/_at/_msg`), station cache, latest/device/weather cache, `schema_v`, `last_prune`, `last_telemetry`, `last_poll_error`, `pin_guard`, `alert_state`, `settings`, hist cache
- `samples(ts, gen_power, use_power, grid_power, batt_power, soc, *_today, gen_total)` — snapshot ทุก 5 นาที · **prune >90 วัน** (`SAMPLES_RETENTION_DAYS`) — backfill/self-heal เขียนด้วย DO NOTHING (แถวจาก cron ชนะ)
- `device_samples(sn, ts, data)` — measure point ทั้งหมดของทุก inverter ทุก ~15 นาที · **prune >180 วัน** (`DEVICE_RETENTION_DAYS`) — อ่านโดย `/api/device/history`
- `daily(day, gen, use, buy, sell, charge, discharge, peak_power, peak_ts)` — สรุปรายวัน เก็บถาวร · peak ขยับขึ้นเท่านั้น

---

## 7. Auth
PIN → cookie `deye_auth` = `iat.HMAC-SHA256(APP_PIN, "deye-monitor-v2:"+iat)` (HttpOnly, Secure เฉพาะ https, หมดอายุตาม iat, เทียบ constant-time). ล็อกอินมี brute-force guard (ดู §5).
ไม่มี PIN = หน้าแอปเปิด public แต่ route ผู้ดูแล `/api/_*` ปิด (ยกเว้น `_health`). secret ฝั่ง Deye อยู่ใน Worker เท่านั้น — ผู้ใช้ไม่ต้อง login บัญชี Deye

## 7b. สถานะ / แจ้งเตือน (แยก 3 เรื่อง ไม่ปนกัน)
- **availability** (`dev.availability`) — เครื่องส่งข้อมูลอยู่ไหม: `deviceState/connectStatus` + อายุ `collectionTime` → online/offline/unknown (unknown = ไม่เดา) · ฝั่งแอป `StaleBanner` เป็นเจ้าของเรื่องนี้
- **ALARM** — Deye's own alarm log: `POST /station/alertList` (unix **วินาที**, หน้าต่าง ≤180 วัน, paged) → `dev.alarms{active,recent}` · `Latest.warningStatus="ALARM"`
- **ATTENTION** — heuristics ของเราจาก measure point (`src/lib/diagnostics.ts` เฉพาะ tone `warn`) → `warningReasons` — ป้ายบอกชัดว่า "วิเคราะห์จากค่าที่วัดได้" ไม่ใช่ alarm ของ Deye
- **outbound alerts** (`src/worker/alerts.ts`) — ประเมินท้าย `pollAndStore` จากข้อมูลที่มีอยู่แล้ว (ไม่เรียก Deye เพิ่ม) + จาก scheduled catch (poll_failed) · state 1 แถวใน `meta.alert_state` · **commit สถานะ "ส่งแล้ว" เฉพาะเมื่อมีช่องทางตอบ 2xx** ไม่งั้นลองใหม่รอบถัดไป · กติกาทุกข้อ "เงียบเมื่อไม่มีข้อมูล"

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
scripts/setup.mjs       one-command setup (D1 + secrets + deploy)
src/
  main.tsx App.tsx index.css
  lib/      api.ts (ApiError + ?station=) format.ts weather.ts analysis.ts device.ts
            diagnostics.ts (สุขภาพเครื่อง — config-or-silent) forecast.ts (PSH จาก sun) useCapacity.ts (kWp หรือ peakPower)
            economics.ts (savings signed + savingsLabel, co2Of(settings)) settings.ts (rate/sellRate/systemCost/co2Factor)
            config.ts (ค่าเริ่มต้น) ui.ts (glass/plate tokens) icons.tsx wxicon.tsx (Meteocons) haptics.ts scenarios.ts brand.ts
  components/ Splash PinGate Header BottomNav StationSwitcher PullToRefresh DevPanel InstallPrompt
              HomeView TodayView WeatherView HistoryView (compare + CSV) LifetimeView DeviceView (alarm log + DeviceTrends)
              FlowDiagram ProductionRing PowerProfile SunPath SelfConsumption
              AnalysisCard InsightList Tile AnimatedNumber Chart
  worker/
    index.ts  Hono app + /api/* + cron (poll, self-heal, telemetry, cache warm, alerts) + weather (+UV) + D1 schema/prune + backfill + export
    deye.ts   Deye client (Open API only) + station discovery + token lifecycle/hold + memo + alertList (Env config)
    alerts.ts กติกาแจ้งเตือน + ช่องทาง (webhook/telegram) + state
    sun.ts    NOAA sunrise + Haurwitz clear-sky (การรับแดดคำนวณจริง)
```

---

## 10. Deploy ($0)

**คำสั่งเดียว** (CLI): ใส่ secret ใน `.dev.vars` แล้ว `npx wrangler login` → `npm run setup` (`scripts/setup.mjs` สร้าง D1 + เขียน id ลง wrangler.jsonc + `secret bulk` + build + deploy). อัปเดต: `npm run deploy`.

**One-click**: ปุ่ม *Deploy to Cloudflare* ใน README (`deploy.workers.cloudflare.com/?url=<repo>`) — CF อ่าน wrangler.jsonc provision D1 + ถาม secret จาก `.dev.vars.example`. ต้องเปิด repo เป็น **public** ก่อน (และลบ `.dev.vars` ออกจาก history).

table สร้างเองตอน request แรก. cron เริ่มอัตโนมัติ. เปิดบนมือถือ → Add to Home Screen = แอป PWA offline. รายละเอียดเต็มใน `DEPLOY.md`

---

## 11. UI / Design system (ออกแบบทิศทางเดียว — เน้นผู้สูงอายุ)

ธีม **Solurna**: Primary **เหลือง #FFCC00** (ปุ่ม) + Secondary **ม่วง #A20DDD** (nav active) บนพื้น **"sunrise wash"** gradient. พื้นผิวเป็น **iOS glass-lite**: `.glass-card`/`.glass-sm` (กระจกฝ้า, recipe ใน `index.css`) + **`.metric-plate`** (พื้นทึบ รองกราฟ + ตัวเลขใหญ่ ให้คมชัดสำหรับผู้สูงอายุ). token รวมที่ `src/lib/ui.ts` (`card`/`cardP`/`cardSm`/`plate`/`plateP`/`h2…`) — แก้ที่เดียวเปลี่ยนทั้งแอป. เคารพ `prefers-reduced-motion` + fallback เป็นพื้นทึบเมื่อ blur ไม่ได้.

**สีพลังงาน (เอกภาพทั้งแอป):** โซลาร์ `#f5a623` · บ้าน `#0d4add` · กริด `#8b5cf6` · แบต `#18a673`. หน้าอากาศมี **SunPath (golden hour)** — ท้องฟ้าไล่สี + แสงเรืองดวงอาทิตย์ + ไฮไลต์ช่วงแดดดีสุด, และแถบ offline "เชื่อมต่อระบบไม่ได้" เมื่อดึงข้อมูลไม่ได้.

**เน้นผู้สูงอายุ:**
- nav **4 ปุ่ม** (หน้าหลัก / วันนี้ / อากาศ / ย้อนหลัง) — หน้า "เครื่อง" (technical) ซ่อนหลังปุ่ม "รายละเอียด" บน Home (มีปุ่มย้อนกลับ)
- **status banner ใหญ่มีคำ+ไอคอน** บนสุด Home → ดู "ปกติ/มีปัญหา" ใน 1 วิ
- ตัวเลขใหญ่ ตัวอักษร ≥14px คอนทราสต์สูง ภาษาไทยง่าย ปุ่มหลักแตะง่าย ไม่มี emoji
- **การ์ดคำแนะนำ** (`AnalysisCard`/`InsightList`) วิเคราะห์จากเลขจริงตามสมการสมดุลพลังงาน (`src/lib/analysis.ts`) — ปรับตามชนิดระบบ on/hybrid/off-grid, ไม่ใช้ AI/สุ่ม

**ภาพ/แอนิเมชัน:** hero "Card_Home" = บ้าน solar **วาดด้วย inline SVG เอง** (ไม่ใช้รูป raster) + แดดหมุน/บ้านลอย; weather = หน้า immersive ม่วง night-sky + ดาว + Meteocons; energy FlowDiagram เส้นวิ่ง. ทุก animation เคารพ `prefers-reduced-motion`.

---

## 12. ข้อตกลงในโค้ด (conventions — อย่าเผลอแก้)

- คำว่า **"ไฟย้อน"** ตั้งใจใช้ (ไฟย้อนกลับเข้ากริด) — **อย่าเปลี่ยนเป็น "ขายไฟ"**
- คีย์ข้อมูลหน้า "เครื่อง" (Device) จาก Deye เป็น **ภาษาอังกฤษ** (`GridVoltageL1`, `LoadPhasePowerA` …) แมป → ไทย ที่ `src/lib/device.ts`
- หน้า "เครื่อง" เข้าผ่านปุ่ม "รายละเอียด" บน Home ไม่ใช่แท็บที่ 5
- การคำนวณทุกอย่างเป็น **ค่าจริง** จาก API / สูตรดาราศาสตร์ — ไม่ใส่ค่าสมมติ
- **"ไม่ hardcode" ≠ "เดาจากข้อมูลที่กำลังตรวจ"** — เกณฑ์ที่ได้จากค่าที่มันเองต้องตัดสิน (เช่น เดา nominal จากแรงดันที่วัด) จะซ่อนความผิดปกติแบบทั้งไซต์ → ให้ **ตั้งค่า** และ **เงียบเมื่อไม่ตั้ง** เสมอ (`GRID_NOMINAL_*`)
- ขีดจำกัดต่อ invocation (D1 query / subrequest) ต้อง **คำนวณ** ในโค้ด (`BACKFILL_MAX_DAYS`, `SELF_HEAL_MAX_DAYS`) ไม่ใช่ตัวเลขลอย
- ทุก batch คิดว่า "แต่ละ statement = 1 query" · ห้าม batch หลายร้อย statement — ใช้ `json_each` 1 statement
- ข้อมูลที่ Deye ให้ไม่ได้ = **unknown** ไม่ใช่ 0 (`Latest.totalsOk`, `availability.unknown`, `alarms undefined`)
