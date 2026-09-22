# Review df3e4c2 — HOLD (1 remaining P2)

## P2: Do not replace the bundle timestamp when station fields still contribute

Location: `src/worker/deye.ts:410-418` (especially line 412).

`getInverterFlow()` returns a truthy object for ANY nonempty `dataList`, even when every mapped power/SOC field is undefined. `out.observedAt = inv.observedAt` is unconditional, while the value overrides are conditional. Therefore `observedAt` does not yet describe the values actually stored when measure points are absent/partial/unmapped.

Actual `getLatest` -> `pollAndStore` -> SQLite reproduction at 2026-09-22 17:20 BKK, station reading four days old and `generationPower=123`:

- Device timestamp fresh, `dataList=[{key:'SOC',value:75}]`: `observedAt=now`, `genPower=123` from the stale station, current sample written, `frozen_since` cleared.
- Device timestamp fresh, only `BatteryRatedCapacity=400`: same stale 123 W written as current despite **no value override at all**.
- Conversely fresh station, only `BatteryRatedCapacity=400` and absent device timestamp: `observedAt=null`, drops valid station sample although the device contributes none of its values.

Retain station provenance when no mapped field contributes. With partial overrides, freshness must cover every source still contributing persisted realtime fields (e.g. source set / conservative oldest usable timestamp, unknown if a contributing source lacks time), or avoid mixing stale fallback fields. Merely checking that *one* mapped inverter field is present is insufficient; the SOC-only case above still fails.

Please add source-composition regression cases for no mapped override and partial override in both age directions, alongside the complete override tests.

## Verified fixes and controls

- All original full-override reproductions now pass: fresh/missing station + stale inverter rejected; stale station + fresh complete inverter accepted; first-deploy old observation and advancing-but-old replay rejected; millisecond normalization and missing timestamp rejected correctly.
- Normal freeze/recovery and actual Hono purge authorization, dry-run, inclusive range, cache invalidation and daily preservation still pass.
- Fresh 105/105 tests (14 files), typecheck, build and diff-check pass.
- No app source/production changes. Harness extended in `.summary/review-088cb16.cjs`; it runs the actual current main source with fake upstream and in-memory SQLite, no external network.
