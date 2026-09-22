# Review 0d8537e — HOLD (1 P2)

## P2: Count actual instantaneous sources, not missing lifetime energy or unknown SOC

Location: `src/worker/deye.ts:416-427`.

The conservative oldest-contributor rule is sound, and the preceding SOC-only / unrelated-point cases are fixed. But the contributor classification adds a station/latest source when ANY of six inverter fields is absent, regardless of whether that field is actually a station/latest observation:

- `genTotal` comes from `tt.generationTotal` (day history, line 393), not `d` (station/latest). When history does not provide it it is a zero placeholder. Absence of `TotalActiveProduction` must not make an otherwise complete, fresh realtime inverter reading depend on stale/missing station/latest time.
- When neither source reports SOC, `socKnown=false` and the worker stores SQL NULL. That is absence of an observation, not station evidence requiring a station timestamp.

Actual worker+SQLite reproductions:

1. Four powers + SOC all fresh from inverter, station timestamp four days old, no inverter lifetime meter -> original valid-fresh-recovery case regresses: `observedAt` becomes four days old, sample/telemetry dropped and frozen state remains. Supplying the unrelated lifetime point as a positive control lets the identical fresh realtime measurements store.
2. Same complete five realtime fields, station timestamp absent -> `observedAt=null`, no samples; freshness remains unprovable indefinitely even with a consistently fresh inverter.
3. Fresh four powers + lifetime meter, SOC absent on both sources (`socKnown=false`), station timestamp old -> drops the sample solely because the NULL SOC is counted as a station contribution.

Scope the realtime contributor set to the values actually sourced and persisted as measurements. Keep lifetime/day energy provenance separate from instantaneous freshness; exclude absent SOC from source requirements. Preserve a station contribution for real fallback power/SOC values, including verified zero. Add actual composition/ingestion tests, not only tests of `observedAtOf` with precomputed `used` flags.

Verified: 110/110 tests, typecheck, build, diff-check; prior partial/no-override cases and pure age cases pass; six-field inverter positive control and normal recovery/purge controls pass. Harness `.summary/review-088cb16.cjs` extended. No production or app source changes.
