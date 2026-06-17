# โซลาร์บ้านคุณนิก — Deye Solar Monitor (PWA)

แอปดูระบบโซลาร์เซลล์ **แบบเรียลไทม์ ภาษาไทย ออกแบบเพื่อผู้สูงอายุ** (ฟอนต์ Sarabun, ตัวเลขใหญ่, ปุ่มน้อย)
ใช้ **Deye Cloud Open API** จริง รันบน **Cloudflare Workers + D1** — ทุน **0 บาท** (free tier ล้วน)
ทำงาน **offline** ได้ (PWA precache) · สถานีตั้งต้น 62237107 (ไฮบริด 12 kW 3 เฟส)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/botnick/deyecloud)

> ปุ่มนี้ provision D1 + ถาม secret (จาก `.dev.vars.example`) แล้ว deploy ให้อัตโนมัติ
> ⚠️ ปุ่ม One-click ใช้ได้เมื่อ repo เป็น **public** — repo นี้ private และ commit `.dev.vars` (ค่าลับจริง) ไว้ ต้อง **ลบ `.dev.vars` ออกจาก repo/history ก่อนเปิด public** ไม่งั้นลับหลุด · ส่วนตัวเองใช้ `npm run setup` (CLI) ได้เลย

> นักพัฒนา / ผู้ช่วย AI: อ่าน **`CLAUDE.md`** · สถาปัตยกรรมละเอียด: **`ARCHITECTURE.md`** · วิธี deploy: **`DEPLOY.md`**

---

## ฟีเจอร์

- **หน้าหลัก** — สถานะระบบ (ปกติ/แจ้งเตือน), ผลิตไฟวันนี้ (ring), ประหยัดเงิน, ผังการไหลของพลังงาน (โซลาร์/บ้าน/กริด/แบต เส้นวิ่ง)
- **วันนี้** — สรุปผลิต/ใช้/ซื้อ/ไฟย้อน, พึ่งพาตัวเอง, การหมุนเวียนพลังงาน (stacked bar)
- **อากาศ** — พยากรณ์ TMD, **เส้นทางดวงอาทิตย์ (golden hour)** + ช่วงแดดดีสุด, **ดัชนี UV**, ราย ชม. + 7 วัน
- **ย้อนหลัง** — กราฟพลังงานราย วัน/เดือน/ปี (Power Profile + Bar chart)
- **รายละเอียดเครื่อง** — ค่าต่อเฟส/PV string/BMS (เข้าผ่านปุ่มบนหน้าหลัก)
- **หลายสถานี** — ถ้าบัญชีมี >1 สถานี จะมีตัวสลับสถานีบนหัวจอให้อัตโนมัติ (จำค่าที่เลือก)
- **ทนทาน** — เชื่อม Deye ไม่ได้ → แถบ "เชื่อมต่อระบบไม่ได้" + คงข้อมูลล่าสุด + ลองใหม่อัตโนมัติ; token หมดอายุกู้คืนเอง; cron ไม่บันทึกค่า 0 ตอนระบบล่ม
- **PWA** — เพิ่มลงหน้าจอโฮม ใช้เหมือนแอป, ทำงาน offline ได้

---

## สถาปัตยกรรมโดยย่อ

```
PWA (มือถือ) ─▶ Cloudflare Worker ─┬─▶ Deye Open API   (เรียลไทม์ + ย้อนหลัง + device)
   PIN เข้า         SPA + /api/*     ├─▶ D1 SQLite       (history + cache + token)
                    cron ทุก 5 นาที  └─▶ TMD / Open-Meteo (อากาศ + UV — พิกัดจาก station)
```

- ทุกอย่างอยู่ใน **Worker เดียว**: เสิร์ฟ SPA + `/api/*` + cron + D1
- **secret อยู่ใน Worker เท่านั้น** (`DEYE_APP_SECRET`, `DEYE_PASSWORD`) — ไม่หลุดฝั่ง client; ผู้ใช้ไม่ต้อง login บัญชี Deye
- ผู้ใช้เข้าด้วย **PIN** (secret `APP_PIN`) → cookie HMAC
- cron poll `/station/latest` ทุก 5 นาที เขียน D1 → กราฟย้อนหลัง วัน/เดือน/ปี
- station / พิกัด / กำลังติดตั้ง **ค้นจาก API เอง** ไม่ hardcode
- การรับแดด (ขึ้น-ตก, ช่วงแดดดี, ชั่วโมงแดดเต็ม) **คำนวณจริง** (NOAA + Haurwitz) ใน `src/worker/sun.ts`

**Stack:** Vite 6 · React 19 + TypeScript · Tailwind CSS v4 · Hono 4 · Cloudflare Workers / D1 / Cron / Static Assets · vite-plugin-pwa · Meteocons

---

## เริ่มต้น (local)

```bash
npm install
cp .dev.vars.example .dev.vars   # แล้วใส่ค่าจริง (ดูหัวข้อ "config")
npm run dev                       # → http://localhost:5174  (มือถือใน LAN: http://<ip>:5174)
```

- ใส่ PIN ที่ตั้งไว้ (เช่น 2580) เพื่อเข้า
- **cron ไม่ทำงานใน `vite dev`** → เปิด `GET /api/_poll` 1 ครั้งเพื่อ seed ข้อมูลแรกลง D1
- ดู payload ดิบจาก Deye: `GET /api/_debug` · ทดสอบ UI ด้วยฉากจำลอง: `?dev=1` หรือ `?sim=peak`

## Deploy ($0)

**A — One-click:** กดปุ่ม **Deploy to Cloudflare** ด้านบนสุด (ต้องเปิด repo เป็น public + ลบ `.dev.vars` ออกจาก history ก่อน) → CF provision D1 + ถาม secret จาก `.dev.vars.example` → deploy ให้เอง

**B — CLI คำสั่งเดียว** (ใช้ส่วนตัว ไม่ต้องเปิด public):

```bash
npx wrangler login        # ล็อกอิน Cloudflare ครั้งเดียว
# ใส่ค่าลับใน .dev.vars: DEYE_APP_SECRET, DEYE_PASSWORD, APP_PIN, TMD_TOKEN
npm run setup             # สร้าง D1 + ใส่ id ลง wrangler.jsonc + ตั้ง secret + build + deploy อัตโนมัติ
```

อัปเดตครั้งต่อไป: `npm run deploy` · ดู log: `npm run tail` · **รายละเอียดเต็มใน [`DEPLOY.md`](./DEPLOY.md)**

ได้ URL `https://deye-monitor.<subdomain>.workers.dev` → เปิดบนมือถือ → **Add to Home Screen** = แอป PWA
ตารางใน D1 สร้างเองตอน request แรก · cron เริ่มเองทุก 5 นาที

---

## คำสั่ง

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run dev` | dev server (port 5174) — เสิร์ฟ Worker + SPA |
| `npm run build` | build → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run setup` | **ตั้งค่า + deploy ครั้งแรกอัตโนมัติ** (D1 + secret + deploy) |
| `npm run deploy` | build + deploy ขึ้น Cloudflare |
| `npm run db:create` / `db:init` | สร้าง / ตั้งตาราง D1 (manual — ปกติ `setup` ทำให้แล้ว) |
| `npm run tail` | ดู log production |
| `node design/shoot.mjs` | ภาพหน้าจอ 5 หน้า → `design/shots/` (Windows Chrome) |

## ค่า config

**ไม่ลับ** — `wrangler.jsonc` → `vars`:

| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `DEYE_BASE_URL` | `…eu1-developer…/v1.0` | EMEA — เปลี่ยนเป็น us1 ถ้าใช้ US |
| `DEYE_APP_ID` | 202606166871044 | จาก developer.deyecloud.com |
| `DEYE_EMAIL` | บัญชี Deye | |
| `WEATHER_LAT/LON` | 13.7 / 100.5 | fallback — ปกติดึงพิกัดจาก station |
| `TMD_BASE` | data.tmd.go.th/nwpapi | กรมอุตุฯ |

**ลับ** (`.dev.vars` local · `wrangler secret` prod): `DEYE_APP_SECRET`, `DEYE_PASSWORD`, `APP_PIN`, `TMD_TOKEN`

## free tier (ไม่เกินโควต้า)

- Workers 100,000 req/วัน — cron 288 ครั้ง/วัน + ผู้ใช้ไม่กี่คน → ห่างลิมิตมาก
- D1 5GB, 5M reads/วัน — ~288 แถว/วัน · Cron Triggers / Static Assets / Open-Meteo — ฟรี

---

## ดีไซน์ (ทิศทางเดียว — เน้นผู้สูงอายุ)

ธีม **Solurna**: เหลือง `#FFCC00` (ปุ่ม) + ม่วง `#A20DDD` (nav active) บนพื้น **"sunrise wash"** gradient
พื้นผิวเป็น **iOS glass-lite** — `.glass-card` / `.glass-sm` (กระจกฝ้า) + `.metric-plate` (พื้นทึบ รองกราฟ/ตัวเลขใหญ่ ให้คมชัด) — token รวมที่ `src/lib/ui.ts`, สลับที่เดียวเปลี่ยนทั้งแอป

**สีพลังงาน (ใช้เหมือนกันทั้งแอป):** โซลาร์ = เหลือง `#f5a623` · บ้าน = น้ำเงิน `#0d4add` · กริด = ม่วง `#8b5cf6` · แบต = เขียว `#18a673`

**ผู้สูงอายุ:** nav 4 ปุ่ม (หน้าหลัก/วันนี้/อากาศ/ย้อนหลัง) · ตัวเลขใหญ่ ตัวอักษร ≥14px · ภาษาไทยกึ่งทางการ · เคารพ `prefers-reduced-motion` · ไม่มี emoji (ใช้ line icons / Meteocons) · บ้าน hero วาดด้วย inline SVG เอง

---

## หมายเหตุการพัฒนา

- หน้า "เครื่อง" (Device) เข้าผ่านปุ่มบนหน้าหลัก ไม่ใช่แท็บที่ 5
- คีย์ข้อมูล device จาก Deye เป็น **อังกฤษ** (GridVoltageL1, LoadPhasePowerA …) แมป→ไทยที่ `src/lib/device.ts`
- คำว่า "**ไฟย้อน**" ตั้งใจใช้ (ไฟย้อนกลับ ไม่ใช่ขายไฟ) — อย่าเปลี่ยนเป็น "ขาย"
- การคำนวณทุกอย่างเป็นค่าจริงจาก API/สูตรดาราศาสตร์ — ไม่ใส่ค่าสมมติ
