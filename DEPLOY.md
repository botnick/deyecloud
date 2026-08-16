# Deploy — โซลาร์มอนิเตอร์ (Deye Solar Monitor)

คู่มือ deploy แบบละเอียด ตั้งแต่ศูนย์ → แอปออนไลน์ บน **Cloudflare Workers** (ฟรีแพลน **$0**)
แอปทั้งหมด (หน้าเว็บ + API + cron + ฐานข้อมูล) อยู่ใน **Worker เดียว** — ตั้งค่าน้อย คำสั่งเดียวจบ

> รีบใช้งาน? ข้ามไป [⚡ Quick start](#-quick-start-5-ขั้น) ได้เลย · อยากเข้าใจว่าค่าแต่ละตัวเอามาจากไหน อ่าน [🔑 ต้องเตรียมอะไรบ้าง](#-ต้องเตรียมอะไรบ้าง-แหล่งข้อมูล)

---

## 🧰 ต้องมีอะไรในเครื่องก่อน

| สิ่งที่ต้องมี | เอาจากไหน | เช็คว่ามีแล้ว |
|---|---|---|
| **Node.js** ≥ 18 (มากับ `npm`) | <https://nodejs.org> (เลือก LTS) | `node -v` |
| **บัญชี Cloudflare** (ฟรี) | <https://dash.cloudflare.com/sign-up> | login ได้ |
| **บัญชี Deye Cloud** + สิทธิ์ **Open API** | ดูหัวข้อถัดไป | มี App ID/Secret |

> Windows ใช้ได้ทั้ง PowerShell / Git Bash · macOS / Linux ใช้ terminal ปกติ

---

## 🔑 ต้องเตรียมอะไรบ้าง (แหล่งข้อมูล)

ค่าที่ต้องกรอกลงไฟล์ `.dev.vars` — **เอามาจากไหน เอามายังไง** สรุปตรงนี้:

| ตัวแปร | จำเป็น? | เอามาจากไหน / ยังไง |
|---|---|---|
| `DEYE_APP_ID` | ✅ | พอร์ทัลนักพัฒนา Deye → <https://developer.deyecloud.com> · สมัคร/ล็อกอิน → ขอสิทธิ์ **Open API** แล้วสร้าง App → ได้ **App ID** |
| `DEYE_APP_SECRET` | ✅ | ที่เดียวกับ App ID — คู่กัน (กดดู/คัดลอก **App Secret** ของ App นั้น) |
| `DEYE_EMAIL` | ✅ | **อีเมลที่ใช้ล็อกอินแอป Deye Cloud** (แอปมือถือ/เว็บที่ดูโซลาร์ปกติ) |
| `DEYE_PASSWORD` | ✅ | **รหัสผ่านบัญชี Deye Cloud** เดียวกับอีเมลข้างบน (โค้ดแปลงเป็น sha256 ให้เอง ไม่ส่ง plain) |
| `APP_PIN` | ⬜ | **คุณตั้งเอง** — PIN ล็อกแอป (เช่น 2580) · ไม่ตั้ง = เปิดสาธารณะใครเปิดก็ดูได้ |
| `TMD_TOKEN` | ⬜ | โทเคนพยากรณ์อากาศกรมอุตุฯ → <https://data.tmd.go.th/nwpapi> (สมัครขอ token) · **ไม่ใส่ก็ได้** → ระบบใช้ Open-Meteo แทนอัตโนมัติ |

ค่าที่มี **ค่าตั้งต้นให้แล้ว** (แก้เฉพาะถ้าจำเป็น) — อยู่ใน `wrangler.jsonc` → `vars`:

| ตัวแปร | ค่าตั้งต้น | แก้เมื่อ |
|---|---|---|
| `DEYE_BASE_URL` | `https://eu1-developer.deyecloud.com/v1.0` | **บัญชีอยู่โซน US** → เปลี่ยนเป็น `https://us1-developer.deyecloud.com/v1.0` |
| `TMD_BASE` | `https://data.tmd.go.th/nwpapi/v1/forecast/location` | ปกติไม่ต้องแตะ |

ค่า **optional อื่น ๆ** (ไม่ใส่ก็ทำงาน — ตั้งเป็น secret หรือใน `vars` ก็ได้):

| ตัวแปร | ทำอะไร |
|---|---|
| `DEYE_COMPANY_ID` | ปกติ `"0"` (โค้ด default ให้แล้ว) · บัญชีองค์กรบางอันต้องใส่เลขของตัวเอง |
| `DEYE_STATION_ID` | ปักสถานีเจาะจง (แทนเลือกสถานีแรกอัตโนมัติ) — ใส่ตอนมีหลายสถานีแล้วอยากล็อกตัวหลัก |
| `WEATHER_LAT` / `WEATHER_LON` / `WEATHER_PLACE` | บังคับพิกัด/ชื่อเมืองของอากาศเอง (ปกติดึงจากสถานี Deye ให้อัตโนมัติ) |
| `CONTACT_EMAIL` | อีเมลติดต่อที่โชว์ในแอป |

> 💡 ค่าไฟ/CO₂ ที่ใช้คำนวณ "เงินที่ประหยัด" ปรับที่ไฟล์ `src/lib/config.ts` (`ELECTRICITY_RATE` = 4.4 บาท/kWh · `CO2_PER_KWH` = 0.5)

---

## ⚡ Quick start (5 ขั้น)

```bash
# 1) ติดตั้ง dependencies
npm install

# 2) ล็อกอิน Cloudflare (เปิดเบราว์เซอร์ครั้งเดียว)
npx wrangler login

# 3) สร้างไฟล์ค่าลับจากตัวอย่าง แล้วเปิดแก้ใส่ค่าจริง
cp .dev.vars.example .dev.vars
#    เปิด .dev.vars ใส่: DEYE_APP_ID, DEYE_EMAIL, DEYE_APP_SECRET,
#    DEYE_PASSWORD, APP_PIN, TMD_TOKEN (ดูตารางด้านบนว่าเอาจากไหน)

# 4) ตั้งค่า + deploy อัตโนมัติคำสั่งเดียว
npm run setup

# 5) เปิด URL ที่ได้บนมือถือ → "เพิ่มลงหน้าจอโฮม" = ใช้เป็นแอป PWA
```

ได้ URL หน้าตา `https://deyecloud.<subdomain>.workers.dev` 🎉

### `npm run setup` ทำอะไรให้บ้าง

1. เช็กว่าล็อกอิน Cloudflare แล้ว (ถ้ายัง จะบอกให้รัน `wrangler login`)
2. สร้างฐานข้อมูล **D1** ชื่อ `deye-monitor` (ถ้ายังไม่มี) แล้วเขียน `database_id` ลง `wrangler.jsonc` ให้เอง
3. อ่านค่าจาก `.dev.vars` → ตั้งเป็น **secret** บน Worker ด้วย `wrangler secret bulk` (ไม่โชว์ค่าออกมา)
4. `npm run build` แล้ว `wrangler deploy`

> 🔒 ตารางใน D1 สร้างเองอัตโนมัติเมื่อมี request แรก — ไม่ต้องรัน migration เอง
> 🔒 ไฟล์ `.dev.vars` มีรหัสจริง **ห้าม commit** (อยู่ใน `.gitignore` แล้ว)

---

## 🔄 อัปเดต / ดู log / คำสั่งที่ใช้บ่อย

```bash
npm run deploy            # build + deploy เวอร์ชันใหม่ขึ้น Cloudflare
npm run tail              # ดู log สด ๆ จาก production (เช็กว่า cron/api ทำงานไหม)
npm run dev               # รันในเครื่อง → http://localhost:5174  (มือถือใน LAN: http://<ip>:5174)
npx wrangler whoami       # เช็กว่าล็อกอิน Cloudflare บัญชีไหนอยู่
npx wrangler d1 execute deye-monitor --remote --command "SELECT COUNT(*) FROM samples"  # ส่อง D1
```

> เปลี่ยน secret ทีหลัง: `npx wrangler secret put DEYE_PASSWORD` (พิมพ์ค่าใหม่) — แล้ว `npm run deploy`

---

## 🆘 แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `Deye token failed` ตอน setup/รัน | App ID/Secret ผิด **หรือ** บัญชีอยู่คนละโซน → สลับ `DEYE_BASE_URL` เป็น `us1-...` (ดูหัวข้อค่าตั้งต้น) |
| แอปขึ้นเลข 0 / แถบ "เชื่อมต่อระบบไม่ได้" | token หมดอายุ/โดน rate-limit ชั่วคราว (เทสถี่เกิน) → ระบบกู้คืนเอง รอสักครู่ · ดู `npm run tail` ประกอบ |
| `getOrgUser url error` / เรียก token บ่อยเด้ง | เรียก `/account/token` ถี่เกินจน Deye limit — **หยุดสักพักแล้วลองใหม่** (token cache อยู่ ~60 วัน ไม่ต้องขอบ่อย) |
| ไม่เจอสถานี / ข้อมูลว่าง | บัญชี Deye นั้นไม่มีสถานีผูกอยู่ หรือใช้ Open API กับบัญชีผิด · ลองใส่ `DEYE_STATION_ID` ให้ชัด |
| อากาศไม่ขึ้น | ไม่ใส่ `TMD_TOKEN` ไม่เป็นไร (ใช้ Open-Meteo) · ถ้าใส่แล้วยังไม่ขึ้น เช็ก token ที่ data.tmd.go.th |
| cron ไม่เขียนข้อมูลตอน dev | **cron ไม่ทำงานใน `vite dev`** เป็นปกติ → เปิด `GET /api/_poll` 1 ครั้งเพื่อ seed ข้อมูลแรก |

---

## 🌐 ทางเลือก: ปุ่ม "Deploy to Cloudflare" (one-click)

ใน `README.md` มีปุ่ม **Deploy to Cloudflare** — Cloudflare จะ fork repo + provision D1 + ถาม secret จาก `.dev.vars.example` ให้กรอกผ่านหน้าเว็บ แล้ว deploy ให้เอง
ใช้ได้เมื่อ repo เป็น **public** (และต้องลบ `.dev.vars` ออกจาก git history ก่อน) — เหมาะกับคนที่ไม่อยากแตะ CLI

---

## ⚙️ ค่าที่ตั้งไว้ในระบบ (`wrangler.jsonc`)

- Worker `name`: **`deyecloud`** · D1 database: `deye-monitor` · cron: ทุก 5 นาที (`*/5 * * * *`)
- เสิร์ฟหน้าเว็บผ่าน **Workers Static Assets** → URL: `https://deyecloud.<subdomain>.workers.dev`
- `vars` ที่ commit มีแค่ `DEYE_BASE_URL` + `TMD_BASE` — ค่าบัญชี/ค่าลับตั้งต่อ Worker (ไม่อยู่ในโค้ด)

## 💸 ทำไม $0 (Cloudflare free plan)

ทุกอย่างรันใน Worker เดียวบนฟรีแพลน — cron 288 ครั้ง/วัน + ผู้ใช้ไม่กี่คน << ลิมิต 100k req/วัน · D1 ~288 แถว/วัน << 5GB · Cron Triggers / Static Assets / Open-Meteo ฟรี → **ไม่มีทางเกินโควต้า** (รายละเอียดสถาปัตยกรรมใน [`ARCHITECTURE.md`](./ARCHITECTURE.md))

---

## หมายเหตุ

- ถ้าเชื่อม Deye ไม่ได้ชั่วคราว แอปขึ้นแถบ "เชื่อมต่อระบบไม่ได้" + คงข้อมูลล่าสุด + ลองใหม่อัตโนมัติ
- บัญชีที่มีหลายสถานี: มีตัวสลับสถานีบนหัวจอให้อัตโนมัติ
- ตัวเลขผังพลังงาน (solar/บ้าน/กริด/แบต) อ่านจาก inverter ให้ตรงกับแอป Deye · ยอดพลังงานรายวันมาจาก station
