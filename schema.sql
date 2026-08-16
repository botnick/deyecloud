-- D1 schema for deye-monitor
-- Free-tier shape (reviewed by codex + gemini + grok, verified vs CF docs):
--   D1 free = 500 MB / database, 10 DBs, 5 GB total · 5M rows read/day · 100k written/day.
-- Strategy: keep the small, important time-series FOREVER; keep the bulky inverter
-- telemetry on a short rolling window. No secondary indexes (PKs cover every query),
-- no manual VACUUM (D1 reuses free pages; the rolling window self-balances).

-- Key/value store: cached Deye token, discovered stationId, response caches, etc.
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

-- Realtime snapshots, written by the cron every 5 min — KEPT FOREVER.
-- ts INTEGER PRIMARY KEY is the rowid alias, so `WHERE ts >= ?` range scans are
-- already covered. ~150 B/row × 288/day ≈ 16 MB/year → decades inside 500 MB.
-- Power fields in Watts; *_today / *_total energy fields in kWh.
CREATE TABLE IF NOT EXISTS samples (
  ts             INTEGER PRIMARY KEY,
  gen_power      REAL,   -- PV generation power (W)
  use_power      REAL,   -- house consumption (W)
  grid_power     REAL,   -- +buy from grid / -sell to grid (W)
  batt_power     REAL,   -- +discharge / -charge (W)  [Deye sign]
  soc            REAL,   -- battery state of charge (%)
  gen_today      REAL,   -- energy produced so far today (kWh)
  use_today      REAL,   -- energy consumed so far today (kWh)
  buy_today      REAL,   -- bought from grid so far today (kWh)
  sell_today     REAL,   -- sold/reverse to grid so far today (kWh)
  charge_today   REAL,   -- battery charged so far today (kWh)
  discharge_today REAL,  -- battery discharged so far today (kWh)
  gen_total      REAL    -- lifetime generation (kWh)
);

-- Daily energy rollup (one row per day) — KEPT FOREVER. Powers month/year charts
-- with a tiny scan (~365 rows/year) instead of touching raw samples.
CREATE TABLE IF NOT EXISTS daily (
  day         TEXT PRIMARY KEY,  -- 'YYYY-MM-DD'
  gen         REAL,   -- produced (kWh)
  use         REAL,   -- consumed (kWh)
  buy         REAL,   -- bought from grid (kWh)
  sell        REAL,   -- sold to grid (kWh)
  charge      REAL,   -- battery charged (kWh)
  discharge   REAL,   -- battery discharged (kWh)
  peak_power  REAL,   -- highest PV power seen that day (W)
  peak_ts     INTEGER -- when the peak occurred (unix seconds)
);

-- Full inverter telemetry (per-PV-string V/I/P, AC/grid per-phase, temps, freq,
-- BMS) captured ~every 15 min as one JSON blob per poll — SHORT rolling window
-- (pruned to ~90 days by the cron). JSON keeps it to 1 write/poll and survives
-- model-to-model field differences; (sn, ts) PK is multi-inverter safe.
CREATE TABLE IF NOT EXISTS device_samples (
  sn    TEXT,
  ts    INTEGER,
  data  TEXT,            -- JSON.stringify(dataList): [{key,value,unit}, ...]
  PRIMARY KEY (sn, ts)
);
