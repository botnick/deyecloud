# คู่มือติดตั้ง — โซลาร์มอนิเตอร์ (Deye Solar Monitor)

> **English:** step-by-step deployment of Deye Solar Monitor to Cloudflare Workers + D1 (free plan): one-click button or `npm run setup`, Deye API secrets, PIN, D1 database. [Website](https://botnick.github.io/deyecloud/en/)

คู่มือ deploy แบบละเอียด ตั้งแต่ศูนย์ → แอปออนไลน์ บน **Cloudflare Workers** (ฟรีแพลน **$0**)
แอปทั้งหมด (หน้าเว็บ + API + cron + ฐานข้อมูล) อยู่ใน **Worker เดียว** — ตั้งค่าน้อย คำสั่งเดียวจบ

> รีบใช้งาน? ข้ามไป [⚡ Quick start](#-quick-start-5-ขั้น) ได้เลย · อยากเข้าใจว่าค่าแต่ละตัวเอามาจากไหน อ่าน [🔑 ต้องเตรียมอะไรบ้าง](#-ต้องเตรียมอะไรบ้าง-แหล่งข้อมูล)

---

## 🧰 ต้องมีอะไรในเครื่องก่อน

| สิ่งที่ต้องมี | เอาจากไหน | เช็คว่ามีแล้ว |
|---|---|---|
| **Node.js** ≥ 22 (มากับ `npm`) | <https://nodejs.org> (เลือก LTS) | `node -v` |
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
| `GRID_NOMINAL_V` / `GRID_NOMINAL_HZ` | ⬜ | แรงดัน/ความถี่ปกติของไซต์คุณ (ไทย 1 เฟส = `230` / `50`) ใช้เป็นเกณฑ์ตรวจสุขภาพอินเวอร์เตอร์ · **ไม่ใส่ = ปิดเฉพาะการเช็คค่าสัมบูรณ์** (การเช็คสมดุลเฟสยังทำงาน) (ระบบจงใจไม่เดาจากค่าที่วัดได้ เพราะไฟตกทั้งไซต์จะกลายเป็น "ปกติ") |
| `ALERT_WEBHOOK_URL` | ⬜ | **แจ้งเตือนเข้า Discord** — สร้าง Webhook ในห้อง Discord (Edit Channel → Integrations → Webhooks) แล้ววาง URL · ระบบจะเตือนเมื่อ: อินเวอร์เตอร์ออฟไลน์ / ดึง Deye ไม่ได้ติดกัน 3 รอบ / ฟ้าโปร่งช่วงแดดแรงแต่ผลิต ≈0 / ไฟกริดหาย / แบตต่ำ / alarm จากอินเวอร์เตอร์ (Deye) · และส่ง "กลับมาปกติ" เมื่อหาย · ทดสอบ: `POST /api/_alert_test` (ต้องล็อกอิน PIN) |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | ⬜ | แจ้งเตือนเข้า Telegram (ใช้คู่กับหรือแทน webhook) |
| `ALERT_SOC_MIN` | ⬜ | เตือนเมื่อแบตต่ำกว่า % นี้ (ไม่ตั้ง = ไม่เตือนแบตต่ำ) · `ALERT_REPEAT_MIN` = เตือนซ้ำทุกกี่นาทีถ้ายังไม่หาย (ค่าเริ่มต้น 360) |
| `ALERT_HEURISTICS` / `ALERT_MUTE` | ⬜ | ผลวิเคราะห์ (เฟสไม่สมดุล / ช่องแบต ฯลฯ) เป็น "คำแนะนำ" **ไม่ส่งออกเป็นแจ้งเตือน** เว้นแต่ตั้ง `ALERT_HEURISTICS=1` · `ALERT_MUTE=offline,no_production` ปิดกติกาเป็นรายตัว (คีย์: offline · poll_failed · no_production · grid_out · soc_low · deye: · attention) |
| `TMD_TOKEN` | ⬜ | โทเคนพยากรณ์อากาศกรมอุตุฯ → <https://data.tmd.go.th/nwpapi> (สมัครขอ token) · **ไม่ใส่ก็ได้** → ระบบใช้ Open-Meteo แทนอัตโนมัติ |

ค่าที่มี **ค่าตั้งต้นให้แล้ว** (แก้เฉพาะถ้าจำเป็น) — อยู่ใน `wrangler.jsonc` → `vars`:

| ตัวแปร | ค่าตั้งต้น | แก้เมื่อ |
|---|---|---|
| `DEYE_BASE_URL` | `https://eu1-developer.deyecloud.com/v1.0` | **บัญชีอยู่โซน US** → เปลี่ยนเป็น `https://us1-developer.deyecloud.com/v1.0` |
| `TMD_BASE` | `https://data.tmd.go.th/nwpapi/v1/forecast/location` | ปกติไม่ต้องแตะ |
| `DEYE_RELAY_URL` | ที่อยู่ relay ของผู้ดูแล repo นี้ | **ติดตั้งเอง ให้เปลี่ยนเป็น relay ของคุณหรือลบบรรทัดนี้** — ใช้เฉพาะตอน Deye บล็อก Workers (ดูหัวข้อแก้ปัญหา) |

ค่า **optional อื่น ๆ** (ไม่ใส่ก็ทำงาน — ตั้งเป็น secret หรือใน `vars` ก็ได้):

| ตัวแปร | ทำอะไร |
|---|---|
| `DEYE_COMPANY_ID` | ปกติ `"0"` (โค้ด default ให้แล้ว) · บัญชีองค์กรบางอันต้องใส่เลขของตัวเอง |
| `DEYE_STATION_ID` | ปักสถานีเจาะจง (แทนเลือกสถานีแรกอัตโนมัติ) — ใส่ตอนมีหลายสถานีแล้วอยากล็อกตัวหลัก |
| `WEATHER_LAT` / `WEATHER_LON` / `WEATHER_PLACE` | บังคับพิกัด/ชื่อเมืองของอากาศเอง (ปกติดึงจากสถานี Deye ให้อัตโนมัติ) |
| `CONTACT_EMAIL` | อีเมลติดต่อที่แนบไปตอนค้นชื่อสถานที่จาก OpenStreetMap (ไม่ใส่ = ใช้ลิงก์ repo แทน) |

> 💡 ค่าไฟ / ค่าขายคืน / ทุนติดตั้ง / ค่า CO₂ ตั้งในแอป (แท็บ "ย้อนหลัง" → "ตลอด" → ตั้งค่าการคำนวณ) เก็บใน D1 ทุกเครื่องเห็นค่าเดียวกัน · ไม่ตั้ง = ใช้ค่าเริ่มต้นใน `src/lib/config.ts` (ค่าไฟ 4.4 บาท/หน่วย · ขายคืน 0 · CO₂ 0.5 กก./หน่วย)

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
4. `npm run build` แล้ว `wrangler deploy --keep-vars` (ต้องมี `--keep-vars` ไม่งั้น Text vars ที่ตั้งบน dashboard จะถูกลบ — เก็บค่าสำคัญเป็น Secret จะปลอดภัยกว่า)

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
| cron ไม่เขียนข้อมูลตอน dev | **cron ไม่ทำงานใน `vite dev`** เป็นปกติ → เปิด `GET /api/_poll` 1 ครั้งเพื่อ seed ข้อมูลแรก (ต้อง login PIN ก่อน) |
| แอปขึ้นแถบเหลือง "ระบบเก็บข้อมูลหยุด" | เปิด `/api/_health` (ไม่ต้อง PIN) — ดู `lastPollError` และ `deyeLogin` · ถ้า `deyeLogin.ok=false` = รหัส/secret Deye ผิด → แก้ secret แล้วรอ `holdUntil` หรือ deploy ใหม่ (isolate ใหม่จะลอง login เมื่อ hold หมด) · ระบบเติมข้อมูลช่วงที่หายให้เองเมื่อกลับมา (ย้อนหลังได้ 2 วัน/รอบ) — เก่ากว่านั้น `POST /api/_backfill?from=YYYY-MM-DD` (ครั้งละไม่เกิน 10 วัน ย้อนได้ไม่เกิน 90 วัน · ทำต่อจาก `nextFrom` ที่ตอบกลับ) |
| ใส่ PIN แล้วบอก "ลองผิดหลายครั้ง — รออีก N วินาที" | มีการเดา PIN (หรือพิมพ์ผิดเกิน 3 ครั้ง) → รอตามที่บอก (สูงสุด 15 นาที) · ใส่ถูกครั้งเดียวจะรีเซ็ต |
| `/api/_poll` `/api/_backfill` ตอบ 403 | ต้องตั้ง `APP_PIN` และ login ก่อน — route ผู้ดูแลไม่เปิดสาธารณะแม้ไม่ตั้ง PIN |
| การ์ด "ตรวจสุขภาพ" บอกช่องแบตไม่จ่ายกระแสหลังย้ายสาย/ถอดแบต | ระบบจำโครงสร้างช่องแบตที่เคยมีกระแส (ถาวรต่อเครื่อง) — เปลี่ยนสายจริงให้รีเซ็ต: `wrangler d1 execute deye-monitor --remote --command "DELETE FROM meta WHERE k LIKE 'batt_chan_seen_%'"` แล้วระบบเรียนรู้ใหม่ใน ~15 นาที |
| `_health` ขึ้น `HTTP 403 non-JSON (… cloudfront …)` ทั้งที่แอป Deye ปกติ | Deye บล็อกเครือข่าย Cloudflare Workers ทั้งหมด (เจอ 15 ต.ค. 2026) → รัน `node scripts/deye-relay.mjs` บนเครื่องที่เปิดตลอดและ Deye ไม่บล็อก (อ่าน `DEYE_APP_SECRET` จาก env หรือ `.dev.vars` · พอร์ต `PORT` ค่าตั้งต้น 47812) เปิดเป็น HTTPS แล้วใส่ URL ใน `DEYE_RELAY_URL` (`wrangler.jsonc`) · Worker ยังเรียก Deye ตรงก่อน โดนบล็อกค่อยอ้อมผ่าน relay (แล้วใช้ relay ต่อ 15 นาทีก่อนลองตรงอีก) · relay รับเฉพาะ `/account/token` `/station/*` `/device/*` และต้องมีกุญแจที่คิดจาก App Secret (ไม่มีค่าลับใหม่) · เช็คว่า relay ทำงาน: `GET /healthz` |
| แจ้งเตือนไม่มา | `POST /api/_alert_test` (login แล้ว) → ต้องได้ `ok:true` · ถ้า `delivered.webhook` ไม่ใช่ 2xx เช็ค URL webhook · ออฟไลน์ / ดึง Deye ไม่ได้ ต้องเกิดติดกัน 3 รอบ (15 นาที) · ไม่ผลิตไฟ 4 รอบ (20 นาที) ก่อนเตือน |
| อยากให้ทุกเครื่องใส่ PIN ใหม่ (เช่น มือถือหาย) โดยไม่เปลี่ยน PIN | `POST /api/_logout_all` (login แล้ว) — เครื่องอื่นหลุดภายใน ~1 นาที · เปลี่ยน `APP_PIN` ก็ทำให้ทุกเครื่องหลุดเช่นกัน |
| ย้อนหลังมีวันที่ยอดซ้ำกับวันถัดไป (ข้อมูลจาก backfill รุ่นเก่า) | `POST /api/_purge_day?day=YYYY-MM-DD` ดูก่อน (ไม่ลบ) แล้วเติม `&confirm=1` เพื่อลบ — ลบได้เฉพาะเมื่อ Deye ยืนยันว่าไม่มีข้อมูลวันนั้น · ค่าที่บันทึกตอนตัวส่งข้อมูลหลุด ลบด้วย `POST /api/_purge?from=&to=` (unix วินาที, ≤31 วัน, `&confirm=1`) |

---

## 🌐 ทางเลือก: ปุ่ม "Deploy to Cloudflare" (one-click)

ใน `README.md` มีปุ่ม **Deploy to Cloudflare** — Cloudflare จะ fork repo + provision D1 + ถาม secret จาก `.dev.vars.example` ให้กรอกผ่านหน้าเว็บ แล้ว deploy ให้เอง
ใช้ได้เมื่อ repo เป็น **public** (และต้องลบ `.dev.vars` ออกจาก git history ก่อน) — เหมาะกับคนที่ไม่อยากแตะ CLI

---

## ⚙️ ค่าที่ตั้งไว้ในระบบ (`wrangler.jsonc`)

- Worker `name`: **`deyecloud`** · D1 database: `deye-monitor` · cron: ทุก 5 นาที (`*/5 * * * *`)
- เสิร์ฟหน้าเว็บผ่าน **Workers Static Assets** → URL: `https://deyecloud.<subdomain>.workers.dev`
- `vars` ที่ commit มีแค่ `DEYE_BASE_URL` + `TMD_BASE` + `DEYE_RELAY_URL` (ทางอ้อมตอน Deye บล็อก ลบได้) — ค่าบัญชี/ค่าลับตั้งต่อ Worker (ไม่อยู่ในโค้ด)
- GitHub Actions: `ci.yml` ตรวจ typecheck + test + build ทุก push/PR (ไม่ deploy) · `pages.yml` เผยแพร่เว็บไซต์โปรเจกต์ใน `site/` ขึ้น GitHub Pages

## 💸 ทำไม $0 (Cloudflare free plan)

ทุกอย่างรันใน Worker เดียวบนฟรีแพลน — cron 288 ครั้ง/วัน + ผู้ใช้ไม่กี่คน << ลิมิต 100k req/วัน · D1 ~288 แถว/วัน (+ ค่าเครื่อง ~96 แถว/วัน) และลบของเก่าเอง << 500 MB · Cron Triggers / Static Assets / Open-Meteo ฟรี → **ไม่มีทางเกินโควต้า** (รายละเอียดสถาปัตยกรรมใน [`ARCHITECTURE.md`](./ARCHITECTURE.md))

---

## หมายเหตุ

- ถ้าเชื่อม Deye ไม่ได้ชั่วคราว แอปขึ้นแถบ "เชื่อมต่อระบบไม่ได้" + คงข้อมูลล่าสุด + ลองใหม่อัตโนมัติ
- บัญชีที่มีหลายสถานี: มีตัวสลับสถานีบนหัวจอให้อัตโนมัติ
- ตัวเลขผังพลังงาน (solar/บ้าน/กริด/แบต) อ่านจาก inverter ให้ตรงกับแอป Deye · ยอดพลังงานรายวันมาจาก station
- เมื่อรูปแบบ cookie ของ PIN เปลี่ยน (ล่าสุด ต.ค. 2026) ทุกเครื่องต้องใส่ PIN ใหม่ 1 ครั้ง · ล็อกอินแล้วอยู่ได้ 1 ปี
- ต่อ uptime monitor (เช่น UptimeRobot/Better Stack) ที่ `GET /api/_health` — ตอบ 503 เมื่อระบบเก็บข้อมูลหยุด
