# B-6b — Fault console slice 2: LB backend down — health-skip failover on stage 2

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first — especially the
"### Fault Console (fourth rail tab)" section (now including the 2026-10-28 backend-down
bullet). The human pre-approved this slice by direction ("Agreed on your next, make it
so", 2026-10-28): the failover fault follows the slice-1 console pattern verbatim.

## Target shape

Stage 2 gains one console row — **Backend 10.12 down**. Flipping it sets the REAL down
flag on webserver `10.12` (slice-1 component state). But stage 2's lesson differs from
stage 1: the load balancer becomes **health-aware** and its round-robin cursor **skips**
the down backend, so the pool keeps serving — graceful degradation, the distribution goes
lopsided, the crowd never sees a refusal. The stage-2 trace narrates the skip where the LB
actually made the choice and otherwise keeps the full four-hop served story. Toggling
back makes `10.12` rejoin the rotation.

## Hard rules

- Zero deps; strict CSP (addEventListener only, textContent only, no innerHTML); tokens
  only (`var(--danger)` / `var(--danger-soft)` for DOWN states).
- Executable conceptual model: the skip is the LB's real selection logic acting on the
  component's own down flag — narration reads the actual selection, no hardcoded story.
- **Live lessons only:** `Math.random()`, `Date.now()`, and weakened
  guardrails/test/manifest rules are forbidden. With the fault off, every replay,
  distribution, and camera pin stays byte-green.
- **File caps:** `loadbalancer.js` currently ~85, `network.js` ~95, `engine.js` 298/300
  (FAIL loudly early — an extract is fine, engine-stage6.js precedent), `trace.js` 294,
  `fault-console.js` 149, `faults.css` 81, `panel.html` 548/550 gains at most 1 line,
  `test/` and `e2e/` files ≤ 450.

## Boundary contracts (Step 2)

- **js/sim/loadbalancer.js:** `selectBackend()` consults `isDown?.()` per candidate and
  advances the cursor until a healthy backend is found; each Advance advances
  `skippedCount` (cumulative, exposed via `skippedCount()` and carried in
  `snapshot()`); the cursor lands where the skip left it (rotation semantics preserved
  for the healthy pair — `m2-round-robin` stays verifiable BEFORE and AFTER the fault,
  and the distributions are lopsided only WHILE down).
- **All backends down (fail-out branch, named counter-example):** when no candidate is
  healthy, the caller receives the SAME refusal-record shape as slice 1
  (`{ refused: true, response: null }`), the refusal tallies through the same funnel as
  slice 1 (counted, never enqueued, nothing served, `refusedCount` grows), and no
  selection state is left corrupted (the cursor does not spin — fail loud-ish, loop-free).
- **js/sim/engine.js:** the stage-2 snapshot carries `skippedCount`
  (`lb?.skippedCount() ?? 0`); LB-delivered sends while one backend is down are
  healthy-pool traffic (not refusals, not extra tallies). Crowd + trace count nothing
  unusual beyond that.
- **js/sim/trace.js (stage-2 branch, DL-3 counter-example):** hop 3's frame narrates the
  real selection from the LB's own state — when the cursor crossed `10.12`, the frame
  names the skip ("… 10.12 is down — skipping …") and the STORY CONTINUES to the served
  hops; **a failover trace never aborts, never renders a refusal, never fakes a served
  record: the learner reads a normal 200 story with skip noted.** With no skip taken the
  frame is byte-identical to today's.
- **js/sim/webserver.js:** untouched — slice-1 down flag reused (`isDown` already
  exported; no new component state).
- **js/panel/fault-console.js:** the console registry gains the stage-2 row — testids
  `fault-toggle-backend-10-12` and `fault-state-backend-10-12` (chip `DOWN` / `off`),
  label "Backend 10.12 down"; wired to `engine.setServerDown('10.12', bool)` (slice-1
  engine control; extend only if the engine API needs a generalization, REPORT what).
  Stage-1 rows byte-stable; other stages still show the empty state.
- **js/panel/render.js:** while down, the `10.12` card's `node-down-chip` appears
  (same chip testid as slice 1 — still exactly ONE card carries it), driven from the
  snapshot's per-server `down` state; healthy `10.11` card keeps Chip normal.
- **js/panel/missions.js:** `MISSIONS[2]` gains `m2-failover` — goal "Take backend 10.12
  down, keep serving, restore it and see it rejoin the rotation"; detect reads
  `(s) => (s.skippedCount ?? 0) > 0 && perBackend(s)['10.12'] >= 1` (skips happened, and
  `10.12` is serving again after them). `m2-round-robin` / `m2-forwarded` untouched.
- **Known contradiction, resolved here NOT in the executor's day (slice-1 precedent):**
  `test/panel/missions.test.js` currently pins `stage === 1 ? 4 : 3` and
  `e2e/missions.spec.js` counts stage 2 at 3. This slice's committed contract gives
  stage 2 a 4th mission — extend the SAME pins to `stage === 1 || stage === 2 ? 4 : 3`
  in this change, retitle to match the new shape, and mirror the byte-stable title in
  `slices.yaml` + `storymap.yaml` (SLICES: manifests same change).
- **js/panel/teaching.js:** stage-2 narrative gains one sentence on graceful degradation
  (pool serves while one backend is down; rotation rejoins on restore).

## Tests & manifests

- NEW `test/sim/loadbalancer-failover.test.js`: cursor-skip semantics (skips counted,
  cursor lands on the healthy backend, rotation resumes), skip never routes to the dead
  address (`network.send`/`deliverToQueue` are never CALLED with the down address —
  unit-spied or asserted via a refused-free network double), all-backends-down
  fail-out branch returns the slice-1 refusal shape with `refusedCount` growing and no
  unenqueued delivery, `skippedCount` on the engine snapshot for stage 2, distribution
  is lopsided while down and rejoins after restore (deterministic seeded sequence), and
  the same-seed replay pin stays byte-green with the fault off.
- APPEND to `e2e/fault-console.spec.js`, titles verbatim into storymap:
  - `should skip the down backend in the round-robin and keep the crowd served`
  - `should narrate the skip in the stage-2 trace without aborting the served story`
  - `should verify the stage-2 failover mission only after skip and rejoin`
- Manifests same change: `slices.yaml` — SIM `unit_tests` gains the new test; PANEL e2e
  already lists the spec file (no new file). `storymap.yaml` — the failover story under
  the activity owning sim faults + the console; titles byte-identical; the retitled
  missions-count test mirrored in both manifests.

## Execution steps

- [x] Step 1 (Lead session): human direction "make it so" recorded 2026-10-28 — slice 2
      pre-approved on the slice-1 pattern; DESIGN.md backend-down bullet committed with this
      brief.
- [ ] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests, manifest updates,
      green `npm run verify`, tick and commit (DEMO screenshots for the human visual gate).
- [ ] Step 3 (Lead session): strict acceptance probe over every boundary contract
      (including the all-down fail-out branch), metrics extraction, ledger entry, tick
      Step 3, commit.
