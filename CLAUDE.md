# CLAUDE.md

Project guide for Claude Code working in this repo. Read this first.

## What this is

**โซลาร์บ้านคุณนิก** — a PWA that shows a home Deye solar system in real time, in **Thai**, designed for an **elderly** user. One Cloudflare Worker serves the SPA + `/api/*` + a 5-minute cron, all on the **$0 Cloudflare free plan**. Station 62237107 (12 kW hybrid, 3-phase).

## Stack

| Layer | Tech |
|---|---|
| Build | Vite 6 + `@cloudflare/vite-plugin` (dev/build/deploy in one) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 (`@theme` in `src/index.css`); design tokens in `src/lib/ui.ts` |
| Weather icons | Meteocons (`@meteocons/svg`) — bundled → PWA-precached for offline |
| Offline/PWA | vite-plugin-pwa (Workbox `generateSW`) |
| API | Hono 4 on Cloudflare Workers |
| DB | Cloudflare D1 (SQLite) — history + cache + token |
| Cron | Cloudflare Cron Triggers (`*/5 * * * *`) |

Everything lives in one Worker (`src/worker/index.ts`).

## Commands

```bash
npm run dev          # vite dev server → http://localhost:5174  (runs the Worker too)
npm run build        # vite build → dist/
npm run typecheck    # tsc --noEmit
npm run setup        # FIRST-TIME: create D1 + write id + set secrets + deploy (scripts/setup.mjs)
npm run deploy       # build + wrangler deploy
npm run db:create    # create D1 'deye-monitor'
npm run db:init      # apply schema.sql to remote D1
npm run tail         # stream prod logs
```

- **Dev port is 5174** (`vite.config.ts` → `server.port`, `strictPort`). LAN access enabled (`host: true`) → reachable at `http://192.168.1.56:5174`.
- **Cron does NOT fire in `vite dev`.** To seed/refresh D1 locally hit `GET /api/_poll` once.
- The Cloudflare vite plugin splits output into `dist/client` + `dist/deye_monitor`; `vite preview` does not work — use `npm run dev`.

## Auth & secrets

- App is gated by a **PIN** (`APP_PIN`, currently **2580**). `POST /api/login` sets an HMAC cookie `deye_auth`. No PIN set = public.
- **Secrets live in `.dev.vars`** (local) and `wrangler secret put` (prod): `DEYE_APP_SECRET`, `DEYE_PASSWORD`, `APP_PIN`, `TMD_TOKEN`. Never echo these into committed code.
- Deye account secrets stay server-side only — the user never logs into Deye in the browser.
- Public config (non-secret) is in `wrangler.jsonc` → `vars` (DEYE_BASE_URL, DEYE_APP_ID, DEYE_EMAIL, weather lat/lon, TMD base).

To fetch live data while developing (for inspecting real API shapes):
```bash
curl -s -c /tmp/c.txt -X POST localhost:5174/api/login -H 'Content-Type: application/json' -d '{"pin":"2580"}'
curl -s -b /tmp/c.txt localhost:5174/api/device   # real keys are ENGLISH: GridVoltageL1, LoadPhasePowerA, ...
```

## Data sources

- **Deye Open API ONLY** (`https://eu1-developer.deyecloud.com/v1.0`). Do not switch to scraping/other APIs.
  - Token: `POST /account/token` (appSecret + email + sha256(password)) → cached in D1 `meta`, auto-renewed.
  - `POST /station/latest` (realtime power) + `POST /station/history` (energy). **`/station/history` granularity: `1`=frame 5-min (≈289 pts), `2`=day, `3`=month (date format `"YYYY-MM"`!), `4`=year.**
  - `POST /device/latest` + `/device/measurePoints` (PV strings, AC phases, BMS).
  - Client + station discovery: `src/worker/deye.ts`. Station/coords/capacity are **discovered dynamically**, never hardcoded.
- **Weather**: TMD (กรมอุตุฯ, needs `TMD_TOKEN`) primary, Open-Meteo fallback. Coords come from the station.
- **Solar reception is computed for real** in `src/worker/sun.ts` — NOAA sunrise equation + Haurwitz (1945) clear-sky GHI + Peak-Sun-Hours integral, season/lat driven. Do not fake these numbers.

## API routes (`src/worker/index.ts`)

`POST /api/login` · `GET /api/session` · `GET /api/stations` · `GET /api/station` · `GET /api/latest` (cache 60s) · `GET /api/weather` (cache 30m) · `GET /api/device` · `GET /api/history?range=day|month|year&date=` · plus debug: `/api/_debug` `/api/_hist` `/api/_poll` `/api/_dev` `/api/deye`. Auth gate covers `/api/*` except login/session; `ensureSchema` auto-creates tables on first request.

## D1 schema (`schema.sql`, auto-migrates)

- `meta(k,v)` — token+expiry, station cache, latest/weather cache
- `samples(ts, gen_power, use_power, grid_power, batt_power, soc, gen_today, use_today)` — 5-min snapshots (cron)
- `daily(day, gen, use, buy, sell, charge, discharge)` — daily rollup for month/year charts

## Frontend structure

```
src/
  main.tsx  App.tsx  index.css
  lib/   api.ts  ui.ts(tokens)  icons.tsx  wxicon.tsx(Meteocons)  weather.ts
         analysis.ts  device.ts(key→Thai + grouping)  format.ts  haptics.ts  scenarios.ts
  components/
    Splash  PinGate  Header  BottomNav  PullToRefresh  StationSwitcher
    HomeView  TodayView  WeatherView  HistoryView  DeviceView
    RingFlow  FlowDiagram  ProductionRing  SunPath  PowerProfile  SelfConsumption
    Chart  Tile  AnalysisCard  AnimatedNumber  DevPanel
```

- **Nav = 4 tabs**: หน้าหลัก / วันนี้ / อากาศ / ย้อนหลัง. The technical **DeviceView** is reached via the yellow button on Home (has a back button), not a 5th tab.
- **Multi-station**: `StationSwitcher` (header bottom-sheet, shown only when >1 station) switches realtime/device/history via `?station=`; single-station sends no param (unchanged). Weather (incl. **UV index** from Open-Meteo) + the app-wide **offline banner** (Deye unreachable → keep last-known + retry every 20s) are resilience features.
- App mounts once and patches values (count-up/transition) — no flicker.
- `?dev=1` (or `?sim=<key>`) opens `DevPanel` to drive the UI with `src/lib/scenarios.ts` fixtures (peak/charging/discharge/offgrid/buy/lowbatt/fullbatt/fault/idle).

## Design system (keep everything one direction)

- Theme **Solurna**: yellow `#FFCC00` (buttons) + purple `#A20DDD` (nav active) on a **"sunrise wash"** gradient. Surfaces are **iOS glass-lite** — `.glass-card`/`.glass-sm` (recipe in `index.css`) + **`.metric-plate`** (opaque, behind charts + big numbers for legibility). Tokens in `src/lib/ui.ts` (`card`/`cardP`/`cardSm`/`plate`/`plateP`/`h2…`) — change once, whole app follows. **Energy colors (unified everywhere):** solar `#f5a623` · home `#0d4add` · grid `#8b5cf6` · battery `#18a673`. Don't hand-roll shadows/radii.
- **Device data cards follow the Deye light-theme standard**: per-phase data = `DataTable` with a colored category TAG (DC/AC/Grid/Load/Gen) + phase rows L1/L2/L3. **Table values are RIGHT-aligned** so the last column lines up with the scalar rows below — left-aligned was rejected twice as "หนักซ้าย" (unbalanced). Scalar readings = `KVList` = label-left / value-right hairline rows.
- History "กราฟพลังงาน" = Deye Power Profile (legend dots + kW/% dual axis). Today "การหมุนเวียนพลังงาน" = Deye Self-consumption stacked bars.
- Weather is a separate immersive look; Meteocons for all conditions (day/night split).

## Hard constraints (user-mandated — do not violate)

- **Use "ไฟย้อน", never "ขาย"/"ขายไฟ"/"ขายออก"** — this is battery-backup reverse flow, not selling. Grep `ขาย` before adding any grid/feed-in label.
- **No emoji anywhere.** Use line icons (`src/lib/icons.tsx`) / Meteocons.
- **The house hero is drawn (inline SVG/CSS), never a raster image.** Weather/library icons are fine.
- **Real calculations, not invented** ("ไม่มโน ไม่เมคเอง").
- **Elderly-first**: big numbers, text ≥14px, high contrast, simple Thai, tap targets ≥44px, few buttons, Sarabun font.
- **Stay $0** on Cloudflare's free plan.

## Verifying UI changes (screenshots)

```bash
node design/shoot.mjs       # all 5 views (viewport), → design/shots/*.png
node design/shootdev.mjs    # DeviceView full page, auto-expands accordions → device-full.png
```
Both use puppeteer-core + system Chrome and log in with PIN 2580. After editing UI, build (`npm run build`) then screenshot and actually look at the result before reporting.

## Conventions

- This is **win32 / PowerShell** primary; the Bash tool is also available (Git Bash). Dev server may already be running on 5174.
- For library/framework/CLI docs, use the **context7 MCP** (global rule) rather than guessing from memory.
- Git remote: `github.com/botnick/deyecloud` (PRIVATE; full snapshot incl. `.dev.vars` — do not make public without scrubbing secrets from history).
- Persistent notes live in the auto-memory at `C:\Users\n\.claude\projects\C--Users-n-Desktop-deyecloud\memory\` (index = `MEMORY.md`).
