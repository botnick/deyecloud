# สถาปัตยกรรม — โซลาร์มอนิเตอร์ (Deye Solar Monitor)

> **English:** architecture of Deye Solar Monitor — a real-time Deye inverter dashboard on Cloudflare Workers + D1: Worker routes, cron polling of the Deye Cloud Open API, data model, forecast and battery models. [Website](https://botnick.github.io/deyecloud/en/)

PWA ดูข้อมูลระบบโซลาร์เซลล์แบบเรียลไทม์ ภาษาไทย สำหรับผู้สูงอายุ
รันบน **Cloudflare Workers ฟรี 100% ($0 free plan)**

---

## 1. Stack

| Layer | Tech |
|---|---|
| Build | **Vite 6** + `@cloudflare/vite-plugin` (dev + build + deploy รวบเดียว) |
| UI | **React 19 + TypeScript** |
| 3D | **three.js** — บ้าน 3D บนหน้าหลัก (`src/three/`, lazy chunk แยก) |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, theme เป็น `@theme` ใน `src/index.css`) + design tokens รวมที่ `src/lib/ui.ts` |
| Weather icons | **Meteocons** (`@meteocons/svg`, MIT) — animated SVG จริงตามหลัก meteorology, bundle ลง assets แล้ว precache (ใช้ offline ได้) |
| Offline / PWA | **vite-plugin-pwa** (Workbox generateSW; `globPatterns` รวม svg/webp/woff จึง precache ครบ ใช้ offline ได้จริง) + `InstallPrompt` (แถบ "เพิ่มลงหน้าจอโฮม" ปรับตาม device: Android/Chrome one-tap, iOS/iPad/macOS Safari, Firefox) |
| API / Worker | **Hono 4** บน Cloudflare Workers |
| Database | **Cloudflare D1** (SQLite) — เก็บ history + cache + token |
| Cron | **Cloudflare Cron Triggers** (poll ทุก 5 นาที) |
| Static hosting | **Workers Static Assets** (binding `ASSETS`, SPA fallback, `run_worker_first` สำหรับ `/api/*`) |
| Tests / CI | **Vitest** (`src/lib/__tests__`) · GitHub Actions `ci.yml` = typecheck + test + build |

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

ถ้า Deye ตอบหน้า 403 ของ CloudFront (บล็อกเครือข่าย Workers) และตั้ง `DEYE_RELAY_URL` ไว้ ระบบจะส่งคำขอเดิมซ้ำผ่าน relay (`scripts/deye-relay.mjs` บนเครื่องอื่น) แล้วใช้ relay ต่อ 15 นาทีก่อนลองตรงอีก (ดู §3)

---

## 3. แหล่งข้อมูล (data sources)

### Deye — primary = **Open API** (`https://eu1-developer.deyecloud.com/v1.0`)
- Token: `POST /account/token?appId=` ด้วย `appSecret + email + sha256(password) + companyId` ได้ token อายุ ~60 วัน, **renew อัตโนมัติ** (cache ใน D1 `meta`, ขอใหม่เมื่อเหลือ <1 วัน)
- Realtime: `POST /station/latest` ได้ค่ากำลังไฟ (generationPower, consumptionPower, wirePower, batteryPower, batterySOC) แล้วนำค่าตามเวลาจริงของอินเวอร์เตอร์ตัวแรกมาทับจาก `POST /device/latest` (TotalSolarPower, TotalConsumptionPower, TotalGridPower, BatteryPower, SOC) ให้ตรงกับแอป Deye
- พลังงานรายวัน: `POST /station/history` granularity=2 (day) ได้ generationValue, consumptionValue, purchaseValue, gridValue, chargeValue, dischargeValue
- กราฟ: `POST /station/history` granularity=1 (frame, 5 นาที 288 จุด)
- Device detail: `POST /station/device` (รายการเครื่อง) + `POST /device/latest` (measure point ทั้งหมด: PV string, เฟส AC, BMS) · `/device/measurePoints` ใช้เฉพาะ `/api/_dev`
- Alarm: `POST /station/alertList` (ดู §7b)

> **Latest = latest + day-history ประกอบกัน** เพราะ Open API แยกค่า realtime กับพลังงานรายวันคนละ endpoint
> `selfSufficiency` คำนวณเอง = `(1 − purchaseValue / consumptionValue) × 100` (พึ่งพาตัวเอง = ไฟที่ใช้โดยไม่ซื้อ)
> **Open API เท่านั้น** — ไม่มี fallback ภายในอื่น (เอา session-token internal API ออกแล้ว)
> **ค่าค้าง (frozen)**: เมื่อตัวส่งข้อมูลหลุดแล้ว Deye ส่งค่าเดิมซ้ำ หาก `observedAt` (เวลาของแหล่งที่เก่าสุด) เก่ากว่า `STALE_AFTER_S` = cron ไม่บันทึก sample/daily, จด `frozen_since` ไว้ (`src/lib/freeze.ts`)
> **Relay** (`DEYE_RELAY_URL`, ไม่บังคับ): ตั้งแต่ 15 ต.ค. 2026 CloudFront ของ Deye ตอบ 403 HTML กับเครือข่าย Workers · `deyeFetch` เรียกตรงก่อน ถ้าเจอ 403 ที่ไม่ใช่ JSON จึงส่งซ้ำผ่าน relay พร้อม header `x-relay-key = sha256("deye-relay:" + DEYE_APP_SECRET)` · relay (`scripts/deye-relay.mjs`, Node, พอร์ต 47812) ส่งต่อเฉพาะ `/account/token` `/station/*` `/device/*` ไม่ log body · ความล้มเหลวของ relay เองไม่นับเป็น login fail

### Weather — primary = **TMD NWP** (กรมอุตุฯ) / fallback = Open-Meteo
- พิกัด **ดึงจาก station เอง** (locationLat/Lng) — ไม่ hardcode
- แปลงค่าสภาพอากาศ cond 1–12 เป็นไอคอน Meteocons (clear-day/clear-night/partly/overcast/rain/storm ฯลฯ แยกกลางวัน-กลางคืน) + คำไทย + คำนวณ "พลังงานแสง" จาก swdown (`src/lib/wxicon.tsx`)
- **ดัชนี UV** ดึงจาก Open-Meteo `uv_index` (TMD ไม่มี field นี้) ผ่าน `fetchUV()` — แสดงค่า + ระดับ/สีตามมาตรฐาน WHO

---

## 4. Dynamic — ไม่ hardcode อะไรเลย
- **Station**: `listStations()` ค้นจาก API แล้วให้ `getStationMeta()` เลือกตัวแรก + cache ใน D1. ไม่มี stationId คาไว้ในโค้ด (ปักเจาะจงได้ด้วย env `DEYE_STATION_ID`)
- **พิกัดอากาศ / ชื่อ / กำลังติดตั้ง**: มาจาก station ที่ค้นเจอ (override ได้ด้วย `WEATHER_LAT`/`LON`/`PLACE`)
- **ค่าบัญชี / ติดต่อ / endpoint เป็น env ล้วน**: `DEYE_APP_ID`/`DEYE_EMAIL` ตั้งต่อ Worker (ไม่ commit), `DEYE_COMPANY_ID`/`CONTACT_EMAIL`/`DEYE_BASE_URL`/`TMD_BASE`/`DEYE_RELAY_URL` ปรับได้
- **ค่าไฟ / ค่าขายไฟ / ทุนติดตั้ง / CO₂**: ผู้ใช้ตั้งในแอป (แท็บ "ตลอด" ส่วน `SettingsCard`) ระบบส่งไปที่ `POST /api/settings` เก็บใน D1 `meta.settings` ทุกเครื่องเห็นค่าเดียวกัน (cache ใน localStorage ด้วย) · ไม่ตั้ง = ค่าเริ่มต้นใน `src/lib/config.ts` (4.4 ฿/หน่วย · ขายไฟ 0 · CO₂ 0.5 กก./หน่วย)
- **หลายสถานี (multi-station) — ทำแล้ว**: `/api/stations` คืน array; `/api/latest|device|history` รับ `?station=` param (cache แยก key ต่อสถานี). UI มี **ตัวสลับสถานี** (`StationSwitcher` — bottom sheet) ที่ด้านบนของจอ แสดงเฉพาะเมื่อมีมากกว่า 1 สถานี, จำค่าที่เลือก. สถานีเดียว = ไม่ส่ง param พฤติกรรมเหมือนเดิมทุกอย่าง (อากาศยังอิงพิกัดสถานีหลัก เพราะ Open API `/station/list` ไม่ส่งพิกัดรายสถานี)

---

## 5. API routes (Hono — `src/worker/index.ts`)

| Route | ใช้ |
|---|---|
| `POST /api/login` | ตรวจเช็ก PIN แล้วตั้ง cookie HMAC (อายุ 1 ปี) · กรอกผิดถี่เกินไปตอบ 429 + `Retry-After` |
| `GET /api/session` | ตรวจเช็กการยืนยันตัวตน (auth) |
| `GET /api/station` / `GET /api/stations` | station ที่เลือก / ทั้งหมด |
| `GET /api/latest` | realtime + พลังงานวันนี้ + สถานะเตือน (cache D1 6 นาที, cron อุ่นให้ทุกรอบ) · **503 `{offline:true}`** ถ้าเชื่อม Deye ไม่ได้ · รับ `?station=` |
| `GET /api/device` | ค่าเครื่อง (เฟส/PV/BMS) + availability + การแจ้งเตือนจากอินเวอร์เตอร์ (cache D1 6 นาที, cron อุ่นให้) · รับ `?station=` |
| `GET /api/weather` | TMD/Open-Meteo + UV + ดวงอาทิตย์ (cache 30 นาทีเมื่อได้ TMD, 5 นาทีเมื่อใช้ Open-Meteo) |
| `GET /api/history?range=day\|month\|year&date=` | กราฟย้อนหลัง (สถานีหลัก: D1 ก่อน, ช่วงปัจจุบันของเดือน/ปีเติมจาก Deye เบื้องหลัง · ถ้าไม่มีใน D1 หรือเป็นสถานีอื่นจะดึงจาก Deye) · รับ `?station=` |
| `GET /api/totals` | ยอดสะสมตลอด + รายปี, `genTotal`, peak (95th pct 60 วัน), kWp ที่สอบเทียบ, ค่าเมฆที่เรียนรู้, PSH รายเดือน (cache 30 นาที) |
| `GET /api/forecast/accuracy?days=` | คาดพรุ่งนี้ (จาก `forecast_log`) vs `daily.gen` ของวันที่จบแล้ว — คะแนน 100−WAPE (Σ|คลาด| ÷ Σจริง), bias, MAE + แถว · วันที่ตัวอย่างช่วงกลางวัน (06–18 น.) ไม่ถึง 115/144 ไม่นับและไม่ใช้เรียนรู้ (`incomplete`) |
| `GET /api/battery/health?days=` | ความจุใช้ได้จริงจากช่วงคายประจุ (samples), SOH = ÷ (Ah × V ที่วัดกลาง SOC), รอบ, DoD · cache 6 ชม. |
| `GET /api/device/history?sn=&days=&keys=` | แนวโน้มค่าเครื่องจาก `device_samples` (bucket ≤240 จุด/คีย์, memo 10 นาที) |
| `GET /api/export?range=day\|month\|year\|all&date=` | CSV จาก D1 ของสถานีหลัก (BOM, attachment) — สำหรับสคริปต์ · ปุ่มในแอปสร้าง CSV ฝั่ง client จากข้อมูลที่แสดงอยู่ (ทุกสถานี) |
| `GET /api/settings` / `POST /api/settings` | ค่าไฟ, ค่าขายไฟ, ทุนติดตั้ง, ค่า CO₂ (whitelist `rate`/`sellRate`/`systemCost`/`co2Factor`, ตัวเลข ≥0, `null` = กลับค่าเริ่มต้น) |
| `GET /api/_health` | **public** (ก่อน auth gate) — `ok:false` + **503** เมื่อทั้ง sample ล่าสุดและ poll ที่สำเร็จล่าสุด (`last_poll_ok`) เก่ากว่า `STALE_AFTER_S` (2 รอบ cron + 120 วิ = 12 นาที) · `inverterFrozenSince` · `lastPollError` · `deyeLogin` (fails/hold) · จำนวนแถว samples/daily/device_samples |
| `POST /api/_backfill?from=&to=` | **operator** — เติมข้อมูลจาก Deye history (json_each 1 statement/วัน, cap วัน/ครั้งคำนวณจากงบ D1+fetch, หยุดเมื่อ auth พัง, `nextFrom/retryFrom`) |
| `POST /api/_purge?from=&to=[&confirm=1]` | **operator** — ลบ `samples`/`device_samples` ช่วงเวลา (unix วินาที, ≤31 วัน) ที่บันทึกตอนตัวส่งข้อมูลหลุด · ไม่มี `confirm` = dry run · ไม่แตะ `daily` |
| `POST /api/_purge_day?day=[&confirm=1]` | **operator** — ลบแถว `daily` ของวันที่ผ่านมาแล้ว เฉพาะเมื่อ Deye ตอบสำเร็จว่าไม่มีข้อมูลวันนั้น (ทุก item ต้องเป็นวันที่จริง) · ถ้า Deye ยังมียอดตอบ 409 · ล้าง cache ที่เกี่ยว |
| `POST /api/_logout_all` | **operator** — เพิ่ม `meta.auth_epoch` ทำให้ทุก session (รวมของตัวเอง) ต้องใส่ PIN ใหม่ · isolate อื่นรู้ภายใน ~1 นาที |
| `POST /api/_alert_test` | **operator** — ส่งข้อความทดสอบทุกช่องทาง (`ok` เฉพาะเมื่อได้ 2xx) |

middleware ทำงานตามลำดับ: `ensureSchema`, auth gate (`/api/*` ยกเว้น login/session/_health), แล้ว **operator gate** (`/api/_*` ต้องมี `APP_PIN` ตั้งไว้ + login — ไม่ตั้ง PIN = ดูได้แต่เขียน/ดู raw ไม่ได้) · debug: `/api/_poll` (poll ทันที) `/api/_debug` (latest ดิบ) `/api/_hist` (history ดิบวันนี้) `/api/_dev` (อินเวอร์เตอร์ + measurePoints) · `onError` ส่งข้อความเต็มเฉพาะ operator · route อื่นนอก `/api/*` = SPA จาก assets พร้อม `X-Robots-Tag: noindex, nofollow` · ถ้าได้ 401 ระหว่างใช้งาน แอปจะกลับไปหน้าใส่ PIN

**ความทนทาน (resilience):**
- **token**: หาจาก memory ก่อน ไม่มีจึงดู D1 แล้วจึง login · login เป็น single-flight และมี **พักแบบทวีคูณตั้งแต่ 60 วินาทีถึง 6 ชั่วโมง** หลังล้มเหลว (6 ชม.ทันทีถ้า Deye บอกเหลือ ≤2 attempt) · error ทั่วไป ≥400 จะ re-login เฉพาะเมื่อ token อายุ ≥10 นาที · token ใหม่ที่ถูกปฏิเสธซ้ำนับเป็น fail · ล้าง fail เมื่อ API call สำเร็จจริง
- **memo 30 วิ** สำหรับ `/device/latest` `/station/device` `/station/list` `/station/alertList` — cron 1 รอบเรียก inverter ครั้งเดียว
- `/station/latest` ส่ง power ที่ top-level (ต้องอ่านให้ถูก ไม่เช่นนั้นจะขึ้น offline ผิด) · ถ้าเชื่อมต่อไม่ได้ frontend แสดงแถบ "เชื่อมต่อระบบไม่ได้" + คงข้อมูลล่าสุด + ลองใหม่ทุก 20s
- cron **ไม่บันทึกค่า 0** ตอน Deye ล่ม · ถ้า day-totals ล้มเหลว จะเก็บ sample แต่**ไม่**ทับ `daily` (`Latest.totalsOk`) · scheduled catch เก็บ `last_poll_error` · **self-heal**: กลับมาแล้วถ้าพบช่วงข้อมูลขาดเกิน STALE จะเรียก `backfillRange` เติมวันล่าสุด (cap คำนวณจากงบของ tick)
- **PIN**: จองสิทธิ์ตรวจแบบ CAS ก่อนเทียบ (`meta.pin_guard = fails|nextAllowed`) ให้ลอง 3 ครั้งแรกโดยไม่หน่วง แล้วเริ่มหน่วง 5 วิ ×2 ≤15 นาที; คำขอที่ถูกปฏิเสธไม่แตะ state · cookie ดู §7

---

## 6. D1 schema (auto-migrate แบบ versioned — `schema_v` ใน `meta`, รันเองตอน request แรก ไม่ต้องสั่ง migration)
- `meta(k,v)` — Deye token (`deye_token` +`_exp`,`_at`), login guard (`deye_login_fails/_fail_at/_fail_msg`), station cache (`station_meta2`, `inv_sn_<station>`), cache (`latest_cache`, `device_cache`, `weather_cache3`, `totals_cache`, `hist_v3_*`, `batt_health_*`), `schema_v`, `last_prune`, `last_telemetry`, `last_poll_ok`, `last_poll_error`, `frozen_since`, `pin_guard`, `auth_epoch`, `alert_state`, `settings`, `batt_chan_seen_<sn>` (ช่องแบตที่เคยมีกระแส)
- `samples(ts, gen_power, use_power, grid_power, batt_power, soc, *_today, gen_total)` — snapshot ทุก 5 นาที (SOC ไม่รู้ = NULL ไม่ใช่ 0) · **prune >90 วัน** (`SAMPLES_RETENTION_DAYS`, วันละครั้ง) — backfill/self-heal เขียนด้วย DO NOTHING (แถวจาก cron ชนะ) · backfill ย้อนได้ไม่เกินช่วงนี้
- `device_samples(sn, ts, data)` — measure point ทั้งหมดของทุก inverter ทุก ~15 นาที · **prune >180 วัน** (`DEVICE_RETENTION_DAYS`) — อ่านโดย `/api/device/history` และ `/api/battery/health` (แรงดันกลาง SOC)
- `daily(day, gen, use, buy, sell, charge, discharge, peak_power, peak_ts)` — สรุปรายวัน เก็บถาวร · peak ขยับขึ้นเท่านั้น
- `forecast_log(day, predicted, cond, psh, cap_kw, made_at)` (schema v3) — "คาดพรุ่งนี้" ตัวสุดท้ายของแต่ละวัน เขียนทับทุก tick; ประเมินเทียบ `daily.gen` เมื่อวันจบ ใช้วัดความแม่นยำและเรียนรู้ค่าเมฆ

**โมเดลพยากรณ์** (`forecastModel`, memo 30 นาที): kWh ≈ kWp × PSH × sky[cond]
- kWp สอบเทียบ (`lib/calib.ts`): `daily.gen ÷ PSH` ของ 60 วันล่าสุด ใช้ median ของควอร์ไทล์บน หารด้วย 0.80 (`CALIB_CLEAR_FACTOR` = sky ของฟ้าแจ่มใส) · ต้องมี ≥7 วันที่ผลิตไฟ (`CALIB_MIN_DAYS`) ถ้าไม่ถึงจะเป็น 0 แล้วใช้กำลังติดตั้ง/peak แทน
- ค่าเมฆ (`lib/skylearn.ts`): จาก `forecast_log` 120 วันล่าสุด ratio = จริง ÷ (kWp × PSH) ต่อ cond แล้วหา median ถ่วงน้ำหนัก (น้ำหนักลดครึ่งทุก `SKY_HALF_LIFE_DAYS` = 14 วัน) ผสม prior ด้วยน้ำหนัก `SKY_PRIOR_WEIGHT` = 1.5: `(W·median + 1.5·prior) ÷ (W + 1.5)` · ratio ตัดที่ 1.2 · ผลจำกัด 0.05–1 · cond ที่ไม่เคยเจอใช้ prior (`DEFAULT_SKY` ใน `lib/forecast.ts`)
- ความแม่นยำ (`accuracySummary`): คะแนน = 100 − WAPE, bias, MAE · ไม่นับวันที่ sample ช่วง 06–18 น. ไม่ถึง 115/144

---

## 7. Auth
กรอก PIN ถูกต้องจะได้ cookie `deye_auth` = `iat.epoch.HMAC-SHA256(APP_PIN, "deye-monitor-v3:"+iat+"."+epoch)` (HttpOnly, SameSite=Lax, Secure เฉพาะ https, อายุ 1 ปีนับจาก iat, เทียบ constant-time). `epoch` ต้องตรงกับ `meta.auth_epoch` (cache ต่อ isolate 60 วิ, อ่านไม่ได้เกินนั้น = ปฏิเสธ) · เรียก `POST /api/_logout_all` เพื่อเพิ่ม epoch ทุกเครื่องจะหลุดโดยไม่ต้องเปลี่ยน PIN · เปลี่ยน `APP_PIN` = หลุดทั้งหมดเช่นกัน · cookie รูปแบบเก่าใช้ไม่ได้. ล็อกอินมี brute-force guard (ดู §5).
ไม่มี PIN = หน้าแอปเปิด public แต่ route ผู้ดูแล `/api/_*` ปิด (ยกเว้น `_health`). secret ฝั่ง Deye อยู่ใน Worker เท่านั้น — ผู้ใช้ไม่ต้อง login บัญชี Deye

## 7b. สถานะ / แจ้งเตือน (แยก 3 เรื่อง ไม่ปนกัน)
- **availability** (`dev.availability`) — เครื่องส่งข้อมูลอยู่ไหม: `deviceState/connectStatus` + อายุ `collectionTime` ตัดสินเป็น online/offline/unknown (unknown = ไม่เดา) · ฝั่งแอป `StaleBanner` เป็นเจ้าของเรื่องนี้
- **ALARM** — Deye's own alarm log: `POST /station/alertList` (unix **วินาที**, หน้าต่าง ≤180 วัน, paged) เก็บใน `dev.alarms{active,recent}` · `Latest.warningStatus="ALARM"`
- **ATTENTION** — heuristics ของเราจาก measure point (`src/lib/diagnostics.ts` เฉพาะ tone `warn`) เก็บใน `warningReasons` — ป้ายบอกชัดว่า "วิเคราะห์จากค่าที่วัดได้" ไม่ใช่การแจ้งเตือนจาก Deye
- **outbound alerts** (`src/worker/alerts.ts`) — ประเมินท้าย `pollAndStore` จากข้อมูลที่มีอยู่แล้ว (ไม่เรียก Deye เพิ่ม) + จาก scheduled catch (poll_failed) · state 1 แถวใน `meta.alert_state` · **commit สถานะ "ส่งแล้ว" เฉพาะเมื่อมีช่องทางตอบ 2xx** ไม่งั้นลองใหม่รอบถัดไป · กติกาทุกข้อ "เงียบเมื่อไม่มีข้อมูล"
  - `offline` / `poll_failed` ติดกัน 3 รอบ · `no_production` 4 รอบ (PV < 2% ของขนาดระบบ ในช่วงแดดแรงตัดหัวท้าย 1 ชม. และอากาศ cond ≤2 เท่านั้น — เมฆหยุดนับ ไม่รีเซ็ต) · `grid_out` แรงดันทุกเฟส < 50 V ขณะมีการใช้ไฟ · `soc_low` (ต้องตั้ง `ALERT_SOC_MIN`) · `deye:<id>` ต่อการแจ้งเตือนจากอินเวอร์เตอร์ที่ยังไม่หาย · `attention:*` เฉพาะ `ALERT_HEURISTICS=1`
  - เตือนซ้ำทุก `ALERT_REPEAT_MIN` (360) · หายแล้วส่ง "กลับมาปกติ" · `ALERT_MUTE` ปิดรายกติกา/กลุ่ม (`deye:`, `attention`) และลืม state โดยไม่ส่งข้อความ

---

## 8. ทำไม $0 (Cloudflare free plan)

| Resource | Free limit | ใช้จริง |
|---|---|---|
| Workers requests | 100,000/วัน | cron 288 + ผู้ใช้ไม่กี่คน ต่ำกว่า limit มาก |
| Workers Static Assets | ฟรี ไม่จำกัด | เสิร์ฟ SPA |
| D1 | 500 MB/ฐาน (5 GB รวม), 5M rows read + 100k write/วัน | samples ~288 + device_samples ~96 แถว/วัน/เครื่อง · prune 90/180 วัน |
| Cron Triggers | ฟรี | ทุก 5 นาที |
| TMD / Open-Meteo / Nominatim | ฟรี | cache 30 นาที (TMD limit 60 req/min) · ชื่อสถานที่ cache ถาวร |

จึงไม่มีทางเกิน free tier

---

## 9. โครงสร้างโปรเจกต์
```
wrangler.jsonc          main=worker, assets, D1, cron, vars
vite.config.ts          react + tailwind + cloudflare + pwa
scripts/setup.mjs       one-command setup (D1 + secrets + deploy)
scripts/deye-relay.mjs  relay สำรองตอน Deye บล็อก Workers (Node, รันบนเครื่องอื่น)
schema.sql              schema แบบ manual สำหรับ `npm run db:init` (ไม่มี `forecast_log` — ปกติไม่ต้องใช้ Worker สร้างครบเอง)
design/                 สคริปต์ถ่ายภาพหน้าจอ (mockup.mjs ฯลฯ) + ฉากบ้าน 3D ต้นแบบ
site/                   เว็บไซต์โปรเจกต์ (GitHub Pages ผ่าน pages.yml)
src/
  main.tsx App.tsx index.css
  lib/      api.ts (ApiError + ?station=, ได้ 401 จะกลับหน้า PIN) format.ts weather.ts analysis.ts device.ts freeze.ts (ตรวจค่าค้าง)
            diagnostics.ts (สุขภาพเครื่อง — config-or-silent) forecast.ts (PSH จาก sun) useCapacity.ts (kWp หรือ peakPower)
            economics.ts (savings signed + savingsLabel, co2Of(settings)) settings.ts (rate/sellRate/systemCost/co2Factor)
            calib.ts (kWp จากวันแดดดี) skylearn.ts (ค่าเมฆเรียนรู้ + accuracy) battery.ts (SOH/รอบ/DoD + จุดตัดที่เรียนรู้ + batteryCard/ETA) season.ts (ปี/ฤดู/คาดทั้งปี) peak.ts
            config.ts (ค่าเริ่มต้น) ui.ts (glass/plate tokens) icons.tsx wxicon.tsx (Meteocons) haptics.ts scenarios.ts brand.ts usePoll.ts
            __tests__/ (Vitest)
  components/ Splash PinGate Header BottomNav StationSwitcher PullToRefresh DevPanel InstallPrompt
              HomeView TodayView WeatherView HistoryView (compare + CSV) LifetimeView DeviceView (ประวัติการแจ้งเตือน + DeviceTrends)
              HouseScene (บ้าน 3D) BatteryNow (แบตตอนนี้ + ใช้ได้ถึงกี่โมง) BatteryHealth WeatherHero
              ForecastAccuracy (คะแนน + แท่งผลิตจริงพร้อมขีดที่คาด) SettingsCard YearInsights MetricSection Collapsible InfoTip
              FlowDiagram ProductionRing PowerProfile SunPath SelfConsumption
              AnalysisCard InsightList Tile AnimatedNumber Chart
  three/    house.ts (โมเดลบ้านจาก primitive + ตำแหน่งอุปกรณ์ + เส้นทางสายไฟ) view.ts (renderer, OrbitControls, เส้นไฟวิ่ง, หยุดทำงานเมื่อไม่อยู่ในมุมมอง)
            — โหลดแบบ lazy chunk แยก (~140 KB gz); ภาพนิ่ง public/hero/house-*.webp จาก design/house/scene.html แสดงระหว่างโหลด/ไม่มี WebGL
  worker/
    index.ts  Hono app + /api/* + auth (PIN/epoch) + cron (poll, frozen check, self-heal, telemetry, cache warm, forecast log, alerts) + weather (+UV) + D1 schema/prune + backfill/purge + export
    deye.ts   Deye client (Open API only) + station discovery + token lifecycle/hold + memo + alertList + relay fallback (Env config)
    alerts.ts กติกาแจ้งเตือน + ช่องทาง (webhook/telegram) + state
    battChannels.ts  จำช่องแบตเตอรี่ที่เคยมีกระแสไฟ (ใช้กับตรวจสุขภาพ + SOH)
    sun.ts    NOAA sunrise + Haurwitz clear-sky (การรับแดดคำนวณจริง)
```

---

## 10. Deploy ($0)

**คำสั่งเดียว** (CLI): ใส่ secret ใน `.dev.vars` แล้วรัน `npx wrangler login` ตามด้วย `npm run setup` (`scripts/setup.mjs` สร้าง D1 + เขียน id ลง wrangler.jsonc + `secret bulk` + build + deploy). อัปเดต: `npm run deploy`.

**One-click**: ปุ่ม *Deploy to Cloudflare* ใน README (`deploy.workers.cloudflare.com/?url=<repo>`) — CF อ่าน wrangler.jsonc provision D1 + ถาม secret จาก `.dev.vars.example`. ต้องเปิด repo เป็น **public** ก่อน (และลบ `.dev.vars` ออกจาก history).

table สร้างเองตอน request แรก. cron เริ่มอัตโนมัติ. เปิดบนมือถือแล้วเลือก Add to Home Screen จะได้แอป PWA ที่ใช้ offline ได้. รายละเอียดเต็มใน `DEPLOY.md`

---

## 11. UI / Design system (ออกแบบทิศทางเดียว — เน้นผู้สูงอายุ)

ธีม **Solurna**: Primary **เหลือง #FFCC00** (ปุ่ม) + Secondary **ม่วง #A20DDD** (nav active) บนพื้น **"sunrise wash"** gradient. พื้นผิวเป็น **iOS glass-lite**: `.glass-card`/`.glass-sm` (กระจกฝ้า, recipe ใน `index.css`) + **`.metric-plate`** (พื้นทึบ รองกราฟ + ตัวเลขใหญ่ ให้คมชัดสำหรับผู้สูงอายุ). token รวมที่ `src/lib/ui.ts` (`card`/`cardP`/`cardSm`/`plate`/`plateP`/`h2…`) — แก้ที่เดียวเปลี่ยนทั้งแอป. เคารพ `prefers-reduced-motion` + fallback เป็นพื้นทึบเมื่อ blur ไม่ได้.

**สีพลังงาน (เอกภาพทั้งแอป):** โซลาร์ `#f5a623` · บ้าน `#0d4add` · กริด `#8b5cf6` · แบต `#18a673`. หน้าอากาศมี **SunPath (golden hour)** — ท้องฟ้าไล่สี + แสงเรืองดวงอาทิตย์ + ไฮไลต์ช่วงแดดดีสุด, และแถบ offline "เชื่อมต่อระบบไม่ได้" เมื่อดึงข้อมูลไม่ได้.

**เน้นผู้สูงอายุ:**
- nav **4 ปุ่ม** (หน้าหลัก / วันนี้ / อากาศ / ย้อนหลัง) — หน้า "เครื่อง" (technical) ซ่อนหลังปุ่ม "รายละเอียด" บน Home (มีปุ่มย้อนกลับ)
- **status banner ใหญ่มีคำ+ไอคอน** บนสุดของ Home ดูได้ใน 1 วินาทีว่า "ปกติ" หรือ "มีปัญหา"
- ตัวเลขใหญ่ ตัวอักษร ≥14px คอนทราสต์สูง ภาษาไทยง่าย ปุ่มหลักแตะง่าย ไม่มี emoji
- **การ์ดคำแนะนำ** (`AnalysisCard`/`InsightList`) วิเคราะห์จากเลขจริงตามสมการสมดุลพลังงาน (`src/lib/analysis.ts`) — ปรับตามชนิดระบบ on/hybrid/off-grid, ไม่ใช้ AI/สุ่ม

**ภาพ/แอนิเมชัน:** hero หน้าหลัก = **บ้าน 3D (three.js) สร้างจาก primitive ในโค้ด** ลากหมุน/ก้มเงยได้ ไม่หมุนเอง, เส้นไฟวิ่งตามสายจริงตามทิศพลังงาน, ป้ายค่าเกาะอุปกรณ์, แสงกลางวัน/ค่ำตามเวลาจริงของบ้าน; weather = หน้า immersive ม่วง night-sky + ดาว + Meteocons; energy FlowDiagram เส้นวิ่ง. ทุก animation เคารพ `prefers-reduced-motion`.

---

## 12. ข้อตกลงในโค้ด (conventions — อย่าเผลอแก้)

- คำว่า **"ไฟย้อน"** ตั้งใจใช้ (ไฟย้อนกลับเข้ากริด) — **อย่าเปลี่ยนเป็น "ขายไฟ"**
- คีย์ข้อมูลหน้า "เครื่อง" (Device) จาก Deye เป็น **ภาษาอังกฤษ** (`GridVoltageL1`, `LoadPhasePowerA` …) แปลเป็นไทยที่ `src/lib/device.ts`
- หน้า "เครื่อง" เข้าผ่านปุ่ม "รายละเอียด" บน Home ไม่ใช่แท็บที่ 5
- การคำนวณทุกอย่างเป็น **ค่าจริง** จาก API / สูตรดาราศาสตร์ — ไม่ใส่ค่าสมมติ
- **"ไม่ hardcode" ≠ "เดาจากข้อมูลที่กำลังตรวจ"** — เกณฑ์ที่ได้จากค่าที่มันเองต้องตัดสิน (เช่น เดา nominal จากแรงดันที่วัด) จะซ่อนความผิดปกติแบบทั้งระบบ จึงให้ **ตั้งค่า** และ **เงียบเมื่อไม่ตั้ง** เสมอ (`GRID_NOMINAL_*`)
- ขีดจำกัดต่อ invocation (D1 query / subrequest) ต้อง **คำนวณ** ในโค้ด (`BACKFILL_MAX_DAYS`, `SELF_HEAL_MAX_DAYS`) ไม่ใช่ตัวเลขลอย
- ทุก batch คิดว่า "แต่ละ statement = 1 query" · ห้าม batch หลายร้อย statement — ใช้ `json_each` 1 statement
- ข้อมูลที่ Deye ให้ไม่ได้ = **unknown** ไม่ใช่ 0 (`Latest.totalsOk`, `availability.unknown`, `alarms undefined`)
