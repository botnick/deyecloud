# Deploy — โซลาร์มอนิเตอร์ (Deye Solar Monitor)

ขึ้น **Cloudflare Workers** (ฟรีแพลน $0) — ตั้งค่าน้อย คำสั่งเดียวจบ

## ครั้งแรก (one-time)

```bash
npm install
npx wrangler login        # เปิดเบราว์เซอร์ ล็อกอิน Cloudflare ครั้งเดียว
# ใส่ค่าใน .dev.vars:  DEYE_APP_ID, DEYE_EMAIL, DEYE_APP_SECRET, DEYE_PASSWORD, APP_PIN, TMD_TOKEN
#   (ดูตัวอย่างครบใน .dev.vars.example — ไม่มีค่าส่วนตัวค้างในโค้ด)
npm run setup             # สร้าง D1 + ตั้งค่า/secret + build + deploy ให้อัตโนมัติ
```

`npm run setup` จะ:
1. เช็กว่าล็อกอิน Cloudflare แล้ว
2. สร้างฐานข้อมูล D1 `deye-monitor` (ถ้ายังไม่มี) แล้วใส่ `database_id` ลง `wrangler.jsonc` ให้เอง
3. อ่าน secret จาก `.dev.vars` แล้วตั้งบน Worker ด้วย `wrangler secret bulk` (ไม่โชว์ค่า)
4. `npm run build && wrangler deploy`

> ตารางใน D1 สร้างเองอัตโนมัติเมื่อมี request แรก (ไม่ต้องรัน schema เอง)

## อัปเดตครั้งต่อไป

```bash
npm run deploy            # build + deploy
```

## คำสั่งอื่น

```bash
npm run dev               # รันในเครื่อง → http://localhost:5174
npm run tail              # ดู log สดจาก production
npx wrangler whoami       # เช็กบัญชี Cloudflare ที่ล็อกอินอยู่
```

## ค่าที่ตั้งไว้แล้ว (`wrangler.jsonc`)

- Worker `name`: `deyecloud` (D1 database ชื่อ `deye-monitor`) · cron ทุก 5 นาที (`*/5 * * * *`) · เสิร์ฟ SPA ผ่าน Assets → URL: `https://deyecloud.<subdomain>.workers.dev`
- **ค่าสาธารณะที่ commit** ใน `vars` มีแค่ `DEYE_BASE_URL` + `TMD_BASE` — แก้ได้ตรงๆ
- **ค่าบัญชี + ค่าลับ** (DEYE_APP_ID/EMAIL/APP_SECRET/PASSWORD, APP_PIN, TMD_TOKEN) ตั้งต่อ Worker โดย `npm run setup` — ไม่อยู่ในโค้ด
- **optional:** `DEYE_STATION_ID` (ปักสถานี) · `DEYE_COMPANY_ID` · `CONTACT_EMAIL` · `WEATHER_LAT`/`LON`/`PLACE`

## หมายเหตุ

- ทุกอย่างรันใน Worker เดียว (SPA + `/api/*` + cron) บนฟรีแพลน
- ถ้าเชื่อม Deye ไม่ได้ชั่วคราว แอพจะขึ้นแถบ "เชื่อมต่อระบบไม่ได้" + คงข้อมูลล่าสุด + ลองใหม่อัตโนมัติ
- บัญชีที่มีหลายสถานี: มีตัวสลับสถานีบนหัวจอให้อัตโนมัติ
