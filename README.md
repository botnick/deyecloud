# โซลาร์บ้านคุณนิก — Deye Solar Monitor (PWA)

แอปดูข้อมูลระบบโซลาร์เซลล์แบบเรียลไทม์ สำหรับผู้สูงอายุ ภาษาไทย ฟอนต์ Sarabun
ใช้ **Deye Cloud Open API** ทำงานบน **Cloudflare Workers + D1** — ทุน 0 (free tier ล้วน)

## สถาปัตยกรรม

```
PWA (มือถือ) ─▶ Cloudflare Worker ─┬─▶ Deye Open API   (เรียลไทม์)
   PIN เข้า         /api/* + เว็บ    ├─▶ D1 SQLite       (เก็บย้อนหลัง)
                    cron ทุก 5 นาที  └─▶ Open-Meteo      (อากาศ ชลบุรี)
```

- **secret อยู่ใน Worker เท่านั้น** (`DEYE_APP_SECRET`, `DEYE_PASSWORD`) — ไม่หลุดไปฝั่ง client ผู้ใช้ไม่ต้อง login บัญชี Deye
- ผู้ใช้เข้าด้วย **PIN** (เก็บใน secret `APP_PIN`)
- cron poll `/station/latest` ทุก 5 นาที เขียนลง D1 → กราฟย้อนหลัง วัน/เดือน/ปี
- frontend mount ครั้งเดียว แล้ว patch เฉพาะค่า (count-up + transition) = ไม่มี flicker

## ความต้องการ
- Node.js 18+
- บัญชี Cloudflare (ฟรี) — https://dash.cloudflare.com/sign-up

## ติดตั้ง (ครั้งแรก)

```bash
npm install
npx wrangler login                 # เปิด browser ยืนยันบัญชี Cloudflare

# 1) สร้าง D1 database
npm run db:create
#    คัดลอก database_id ที่ได้ ไปวางใน wrangler.toml (ช่อง REPLACE_WITH_DATABASE_ID)

# 2) สร้างตาราง
npm run db:init                    # remote (production)
npm run db:init:local              # local (สำหรับ wrangler dev)

# 3) ตั้ง secret (production)
npx wrangler secret put DEYE_APP_SECRET    # appSecret จาก developer.deyecloud.com
npx wrangler secret put DEYE_PASSWORD      # รหัสผ่าน login www.deyecloud.com
npx wrangler secret put APP_PIN            # PIN ที่จะใช้เข้าแอป เช่น 2580
```

## รันทดสอบ local

```bash
cp .dev.vars.example .dev.vars     # แล้วแก้ค่าจริงในไฟล์ .dev.vars (ห้าม commit)
npm run dev                         # เปิด http://localhost:8787
```

ตรวจสอบการเชื่อมต่อ Deye:
- `http://localhost:8787/api/_debug` — ดู payload ดิบจาก Deye (เช็คชื่อ field ว่า map ครบ)
- `http://localhost:8787/api/_poll`  — ดึง 1 ครั้ง + เขียนลง D1 (seed ข้อมูลแรก)

> ถ้า `/api/_debug` คืน field ชื่อไม่ตรงกับใน `src/deye.js` (ฟังก์ชัน `getLatest`)
> ให้แก้ list ชื่อใน `pick(...)` ให้ตรง แล้ว field อื่นจะ map อัตโนมัติ

## Deploy

```bash
npm run deploy
```

ได้ URL `https://deye-monitor.<subdomain>.workers.dev` — เปิดบนมือถือ → เมนู → **Add to Home Screen** ติดตั้งเป็นแอป (PWA)

cron จะรันเองทุก 5 นาทีหลัง deploy (ดู log: `npm run tail`)

## ค่า config (wrangler.toml → [vars])
| ตัวแปร | ค่า | หมายเหตุ |
|---|---|---|
| `DEYE_BASE_URL` | eu1-developer (EMEA) | เปลี่ยนเป็น us1 ถ้าใช้ US |
| `DEYE_APP_ID` | YOUR_DEYE_APP_ID | |
| `DEYE_EMAIL` | your-email@example.com | |
| `DEYE_STATION_ID` | 62237107 | ว่างได้ ระบบหา station แรกให้เอง |
| `WEATHER_LAT/LON` | 13.36 / 100.98 | ชลบุรี |

## free tier ที่ใช้ (ไม่เกินโควต้า)
- Workers: 100,000 req/วัน — cron 288 ครั้ง/วัน + ผู้ใช้ไม่กี่คน ห่างไกลลิมิต
- D1: 5GB, 5M reads/วัน — 1 sample/5นาที = ~288 แถว/วัน
- Cron Triggers: ฟรี
- Open-Meteo: ฟรี ไม่ต้องใช้ key
