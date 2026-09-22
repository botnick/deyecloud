# Review 088cb16 — HOLD (2 P2)

Reviewed incident guard, health reporting, operator purge and adjacent ingestion/recovery paths. No application source, production data, branch, deploy or purge was changed. Existing main untracked `.mcp.json.bak-httptest` preserved.

## P2: Gate on the timestamp of the data actually persisted

Location: `src/worker/index.ts:167` (integration with `src/worker/deye.ts:390-408`).

`Latest.updatedAt` always comes from station `lastUpdateTime`, or server `now` when absent. But `getLatestOpen` then overwrites watts/SOC with `/device/latest` values and never carries their `collectionTime` into that timestamp. The new guard therefore checks a different data source from the measurements it admits/rejects.

Actual `getLatest` -> `pollAndStore` -> in-memory SQLite reproductions at 2026-09-22 17:20 BKK:

- Station timestamp absent; inverter timestamp four days old with 2,631 W: writes a current `samples` row and `device_samples` row, deletes `frozen_since`, health healthy.
- Fresh station timestamp; same four-day-old inverter: same fabricated current rows and false recovery.
- Four-day-old station timestamp equal to marker; fresh inverter reports 4,000 W: drops the genuinely fresh sample and telemetry, remains frozen.

Carry trustworthy observation provenance from the selected source(s), retaining unknown as unknown instead of substituting poll time for freshness evidence. If values can be mixed between sources, do not label the whole bundle fresh merely because one timestamp is fresh. Test both divergence directions and station timestamp absent. Normalize timestamp units at the provenance boundary; a synthetic millisecond station timestamp also bypassed the current seconds-based age guard.

## P2: Reject known-stale observations even without a prior marker or when they advance

Location: `src/lib/freeze.ts:13`.

Known age >720 seconds is not sufficient to reject: rejection additionally requires a non-null stored marker and `readingTs <= lastStoredReadingTs`. Consequently:

- First poll after deploying this new metadata key accepts a four-day-old reading, stamps it as current in `samples`/`device_samples`, and clears frozen state.
- A delayed replay that advances from four days old to four days old +5 minutes also writes current rows and clears frozen state. A stream of delayed observations can continue doing this on each tick without ever being fresh.

Both reproduced through the real worker and SQLite, not just the helper. Treat freshness separately from monotonic advancement/deduplication: a known-old observation cannot be written under today's poll timestamp or prove recovery. If historical ingestion is desired, use the original observation time in an explicit history path. Test missing marker + stale observation, advancing-but-stale observation, and genuinely fresh recovery.

## Verified / non-blocking

- Fresh run: 105/105 tests (14 files), typecheck, build, and `git diff --check` passed. Existing tests cover only the helper, not source composition or the purge route.
- Established frozen station+device timestamps: no sample or telemetry written; repeated frozen ticks keep the first `frozen_since`; `_health` remains collector-healthy. Genuinely fresh recovery clears the marker and writes.
- Self-heal is reached on genuine recovery. Existing cap is **2 days**, so a four-day gap needs explicit older-history backfill if wanted. It did not fabricate frames when the mocked history was empty.
- Actual Hono purge endpoint: no login ->401; no configured PIN ->403; reversed or >31-day range ->400; default dry-run leaves data untouched; confirmed purge deletes only inclusive boundaries in both tables. Day/battery caches cleared; daily and year cache preserved.
- No production purge executed. After deploying a corrected admission policy, dry-run and confirm exact incident bounds; especially preserve the last valid reading / first real recovery sample if endpoints are inclusive.

Reproducer: `/home/l22/Desktop/deyecloud/.tmx-worktrees/codex/.summary/review-088cb16.cjs` (run with Node; transpiles actual TypeScript in memory, intercepts upstream requests, uses SQLite `:memory:`; external network forbidden).
