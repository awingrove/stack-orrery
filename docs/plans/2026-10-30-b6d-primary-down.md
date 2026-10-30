# B-6d — Fault console slice 4: primary down — writes fail, replica reads keep serving (stage 4)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first —
"### Fault Console" carries all four fault bullets. Human pre-approved this
slice by direction (2026-10-29 rung pick, 2026-10-30 go): the ladder moves to
stage 4.

## Target shape

Stage 4 gains one console row — **Database primary down**. While on, POST
writes through the webserver's write branch fail with a real **503**
(`503 Write unavailable (primary down)`), while GETs keep the full
replica-SELECT story and async `/jobs` still 202 — the first fault where the
GET and POST stories split on the same stage. The primary card (`10.30`)
carries the real `node-down-chip` on `var(--danger)` (a down component,
unlike slice 3's out-of-path `BYPASS`). Toggling off restores writes; no
phantom version ever records the failed attempts.

## Hard rules

- Zero deps; strict CSP (addEventListener + textContent only); existing chip
  styles only — no new colors.
- Executable conceptual model: fault state on the component itself; narration
  reads the actual record. `Math.random()`, `Date.now()`, weakened
  guardrails/manifests forbidden. Off-fault, every replay/stats pin stays
  byte-green.
- **File caps (REPORT every extract):** `webserver.js` 300/300, `engine.js`
  300/300, `trace.js` 300/300, `database.js` 155 — fund additions via the
  existing extracts (`webserver-helpers.js`, `engine-pool.js`,
  `trace-helpers.js`; no behavior change, wiring identical). `fault-console.js`
  201, `missions.js` 217, tests ≤ 450.

## Boundary contracts (Step 2)

- **js/sim/database.js:** `setPrimaryDown(down)` validates a boolean
  (fail-loud, setBypass pattern); `isPrimaryDown()` exported. While down,
  `write()` does NOTHING to state — no primary row, no version bump, no
  replication-queue push, no `writes` counter (`lastOp` records
  `op: 'WRITE_DOWN'` with `atTick`). `read()` and `stepReplication()` NEVER
  consult the flag. `snapshot()` gains `primaryDown` (B-6c `bypassed`
  read-back precedent) and `failedWrites` (new tally, bumped only in the
  refused branch).
- **js/sim/webserver.js (at cap — extract first if adding):** the POST write
  branch consults `database?.isPrimaryDown?.()` FIRST — before any
  `database.write()` and before `cache.del(path)`: a failed write must NOT
  invalidate the cached copy and MUST NOT fake a 200. Returns
  `{ response: '503 Write unavailable (primary down)', status: 503, routeId,
cacheStatus: null, dbOp: 'WRITE_DOWN', dbTarget: primaryAddress }`. GET
  resolve and the async `/jobs` 202 branch byte-unchanged. `failedWrites()`
  accessor for the mission detector.
- **js/sim/engine.js (at cap — extract if needed):** stage-4 expose
  `setDatabasePrimaryDown(bool)` — fail-loud when stage < 4; route to
  `database.setPrimaryDown`. Snapshot gains `failedWrites` SUMMED across the
  server pool (B-6c accepted-deviation precedent, NOT `[0]` alone) and
  `primaryDown: database?.isPrimaryDown?.() ?? false`.
- **js/sim/trace.js (at cap — extract if needed):** the stage-4 database-hop
  branch gains the `WRITE_DOWN` frame, executor-fits file style, e.g.
  `Database WRITE FAILED (/path) @ 10.30 — primary down, nothing written`.
  NAMED COUNTER-EXAMPLES (DL): (1) a primary-down write keeps the full
  served-story arc — a real 503 rides the normal hops; the browser renders it
  via `receiveResponse`'s status parse; NO refusal card, NO `receiveRefusal`;
  (2) same-fault GET frames byte-identical to the off-fault SELECT story;
  (3) async `/jobs` frames stay 202/ASYNC byte-identical with the fault on.
- **js/panel/fault-console.js:** stage-4 row — testids
  `fault-toggle-primary`, `fault-state-primary` (chip `DOWN`/`off`), label
  "Database primary down — writes fail, replica reads keep serving"; wired to
  `engine.setDatabasePrimaryDown`. Stages 1–3 rows byte-stable. The `10.30`
  card carries `node-down-chip` while on, cleared on restore; exactly one
  fault chip on the page at a time.
- **js/panel/missions.js:** `MISSIONS[4]` gains `m4-write-fail` — goal "Down
  the primary, fail a write, restore it and land a REAL write"; detect
  `(s) => (s.failedWrites ?? 0) > 0 && served 200 WRITE` (helper in file
  style; CHECKS comment: evidence semantics — a phantom write must not
  satisfy it; pin the failed-write-BEFORE-restored-write ordering).
- **Missions-cap pin, decided HERE:** stage 4 carries 3 and gains a 4th —
  extend `test/panel/missions.test.js`'s cap title to the REAL counts
  (stages 1, 3, 4 carry four; stages 2, 5, 6 carry two to three), mirrored
  byte-stable in `slices.yaml` + `storymap.yaml`. e2e stage-4 mission counts
  to 4. REPORT every other touched pin with its named cause; never weaken
  behavior pins.
- **js/panel/teaching.js:** stage-4 narrative gains ONE sentence: with the
  primary down, writes fail loudly while replica reads keep serving; restore
  puts writes back.

## Tests & manifests

- NEW `test/sim/primary-down.test.js`: `setPrimaryDown` fail-loud validation;
  downed `write()` leaves primary/replica/queue/counters untouched (snapshot
  before/after) while `read()` and in-flight `stepReplication` stay green;
  engine `setDatabasePrimaryDown` fail-loud on stage 3; a primary-down POST
  returns 503 with `dbOp WRITE_DOWN`, does NOT invalidate the cache (a
  following GET still HITs the pre-fault body) and does NOT bump the primary
  version; `failedWrites` tallies pool-summed; restore → next write is a real
  200 WRITE, `version` continuing from history; the three DL
  counter-examples pinned; same-seed replay byte-green with the fault off.
- APPEND to `e2e/fault-console.spec.js` (stays ≤450; extract honestly if
  nearing cap), titles verbatim into storymap:
  - `should down the primary from the rail console and watch writes fail while reads keep serving`
  - `should narrate the failed write as a real 503 without ever faking a WRITE frame`
  - `should verify the stage-4 write-fail mission only after failed write and restored write`
- Manifests same change: `slices.yaml` SIM `unit_tests` gains the new test;
  `storymap.yaml` the primary-down story under the sim-faults activity;
  unit/e2e titles byte-identical.

## Execution steps

- [x] Step 1 (Lead session): human direction recorded 2026-10-29/30; DESIGN.md
      primary-down bullet committed with this brief. Model ratification:
      executor fallbacks `opencode/glm-5.3-flash-free` and
      `opencode/mimo-v2.6-flash-free` RATIFIED when the paid tier
      (`opencode-go/glm-5.3-flash`) is unavailable (user direction 2026-10-30,
      recorded in `.opencode/agents/executor.md`); THIS slice executes on
      `opencode/mimo-v2.6-flash-free` (GLM free coordinates).
- [x] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests,
      manifest updates, green `npm run verify`, tick and commit (DEMO
      screenshots for the human visual gate).
- [ ] Step 3 (Lead session): strict acceptance probe over every boundary
      contract (including the 503-served-arc, byte-identical-GET, and
      async-immune counter-examples), metrics extraction, ledger entry, tick
      Step 3, commit.
