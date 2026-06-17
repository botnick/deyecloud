-- D1 schema for deye-monitor

-- Key/value store: cached Deye token, discovered stationId, etc.
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT
);

-- Realtime snapshots, written by the cron job (every 5 min).
-- ts = unix seconds. Power fields in Watts, energy fields in kWh.
CREATE TABLE IF NOT EXISTS samples (
  ts          INTEGER PRIMARY KEY,
  gen_power   REAL,   -- PV generation power (W)
  use_power   REAL,   -- house consumption (W)
  grid_power  REAL,   -- +buy from grid / -sell to grid (W)
  batt_power  REAL,   -- +charge / -discharge (W)
  soc         REAL,   -- battery state of charge (%)
  gen_today   REAL,   -- energy produced so far today (kWh)
  use_today   REAL    -- energy consumed so far today (kWh)
);

-- Daily energy rollup (one row per day), for month/year charts.
CREATE TABLE IF NOT EXISTS daily (
  day         TEXT PRIMARY KEY,  -- 'YYYY-MM-DD'
  gen         REAL,   -- produced (kWh)
  use         REAL,   -- consumed (kWh)
  buy         REAL,   -- bought from grid (kWh)
  sell        REAL,   -- sold to grid (kWh)
  charge      REAL,   -- battery charged (kWh)
  discharge   REAL    -- battery discharged (kWh)
);

-- No extra index on samples(ts): ts is INTEGER PRIMARY KEY (rowid alias) and is
-- already indexed; a separate index would only slow inserts. Old frames are
-- pruned to ~35 days by the cron, while the daily rollups are kept forever.
