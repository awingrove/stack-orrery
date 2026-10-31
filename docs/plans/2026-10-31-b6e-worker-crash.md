# B-6e — Fault console slice 5: worker crash — jobs wait, nothing lost, re-delivery on restore (stage 5)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first —
"### Fault Console" carries the fault bullets. Human pre-approved (2026-10-31
"good to go"). Executor runs on the STANDARD pin `opencode-go/glm-5.3-flash`
(paid tier restored; free fallbacks remain ratified in
`.opencode/agents/executor.md`).

## Target shape

Stage 5 gains one console row — **Worker crashed**. The synchronous story does
not budge: POST `/jobs` still answers a real 202 (enqueue never consulted the
worker). The worker's own state carries the fault: while crashed its `step()`
drains nothing — the backlog grows visibly — and a job caught ACTIVE at the
crash moment returns to the HEAD of the queue (completion and crash are
mutually exclusive, so nothing is duplicated) and is **re-delivered** on
restore, re-timed from scratch (`redelivered` tally). The worker card `10.41`
carries the honest DOWN chip. Toggling off restores delivery; the re-delivered
work then commits for real.

## Hard rules

- Zero deps; strict CSP (addEventListener + textContent only); existing chip
  styles only — no new colors. Executable conceptual model: fault state on the
  component itself; narration reads the actual record. `Math.random()`,
  `Date.now()`, weakened guardrails/manifests forbidden. Off-fault, every
  replay/stats pin stays byte-green.
- **File caps (REPORT every extract):** `engine.js` 293, `trace.js` 295 — fund
  additions via the existing extracts (`engine-faults.js`, `engine-pool.js`,
  `trace-helpers.js`; wiring verbatim). `queue.js` 88, `fault-console.js` 228,
  `missions.js` 239, tests ≤ 450.

## Boundary contracts (Step 2)

- **js/sim/queue.js:** `setCrashed(crashed)` validates a boolean (fail-loud,
  setPrimaryDown pattern); `isCrashed()` exported. While crashed, `step()`
  does NOTHING — no completion, no active start, no commit attempt; `enqueue`
  is byte-unchanged (backlog grows). ON THE `true` FLIP with an ACTIVE job:
  unshift that job back to the HEAD of `jobs` (`activeJob = null`) and bump
  `redelivered` — the stored payload is re-delivered as stored. `snapshot()`
  gains `crashed` and `redelivered` (read-back, B-6c/c precedent).
- **js/sim/engine.js (extract to `engine-faults.js` if needed):** stage-5
  expose `setWorkerCrashed(bool)` — fail-loud when stage < 5 (no queue); route
  to `workerQueue.setCrashed`. Snapshot gains `redelivered:
workerQueue?.redelivered?.() ?? 0` and `crashed:
workerQueue?.isCrashed?.() ?? false`.
- **js/sim/trace.js (extract if needed):** stage-5 hop-8/8 worker-tail frame
  consults the real state — while crashed the frame names the crash, e.g.
  `Worker 10.41 crashed — N job(s) waiting in the queue (nothing committed)`
  executor-fits file style, naming the queue count from the live record;
  restored tails narrate the real commit as today. NAMED COUNTER-EXAMPLES
  (DL): (1) a crashed worker NEVER fake-commits — no "finished job"
  frame while the tail reads crash state, and the 202 enqueue frames stay
  byte-identical with the fault on; (2) non-GET write frames at the database
  hop stay byte-identical (the worker's crash does not touch the POST
  write-through path); (3) off-crash stage-5 frames byte-identical (same-seed
  replay pin).
- **js/panel/fault-console.js:** stage-5 row — testids
  `fault-toggle-worker`, `fault-state-worker` (chip `DOWN`/`off`), label
  "Worker crashed — async jobs wait, re-delivered on restore"; wired to
  `engine.setWorkerCrashed`. Stages 1–4 rows byte-stable. The worker card
  `10.41` carries `node-down-chip` while on (generalized-chip helper), cleared
  on restore; exactly one fault chip at a time.
- **js/panel/missions.js:** `MISSIONS[5]` gains `m5-redeliver` — goal "Crash
  the worker with a job in flight, restore it and watch the same work commit";
  detect `(s) => (s.redelivered ?? 0) >= 1 && (s.queue?.completed ?? 0)` grew
  AFTER the redelivery — helper in file style with a CHECKS comment on the
  evidence ordering (the commit must follow the crash; a pre-crash commit
  alone cannot latch it).
- **Missions-cap pin, decided HERE:** stage 5 carries 3 and gains a 4th —
  extend the cap title to the REAL counts (stages 1, 3–5 carry four; stages 2
  and 6 carry two to three), mirrored byte-stable in `slices.yaml` +
  `storymap.yaml` (NO `:` in title fragments). e2e stage-5 mission counts to 4. REPORT every other pin touched with named cause; never weaken pins.
- **js/panel/teaching.js:** stage-5 narrative gains ONE sentence: a crashed
  worker pauses async delivery — jobs wait, the active job re-delivers, and
  nothing is lost.

## Tests & manifests

- NEW `test/sim/worker-crash.test.js`: `setCrashed` fail-loud validation;
  crashed `step()` completes/drains nothing (snapshot before/after) while
  `enqueue` still grows the backlog; the crash flip returns an ACTIVE job to
  the queue head with `redelivered` bumping (payload byte-identical); restore
  → the re-delivered job re-times and commits for real exactly once; engine
  `setWorkerCrashed` fail-loud on stage 4; the DL counter-examples pinned
  (no fake commit while crashed; POST write-through at the database hop
  byte-identical; enqueue 202 frames byte-identical); same-seed replay
  byte-green with the fault off.
- APPEND to `e2e/fault-console-stage4.spec.js`'s sibling pattern or a NEW
  `e2e/fault-console-stage5.spec.js` (respecting 450 caps; titles verbatim
  into storymap):
  - `should crash the worker from the rail console and watch async jobs wait, then re-deliver`
  - `should narrate the crashed worker without ever faking a commit`
  - `should verify the stage-5 re-delivery mission only after crash and restore`
- Manifests same change: `slices.yaml` SIM `unit_tests` gains the new test;
  `storymap.yaml` the worker-crash story under the sim-faults activity;
  unit/e2e titles byte-identical.

## Execution steps

- [x] Step 1 (Lead session): human "good to go" 2026-10-31 after PR #26;
      DESIGN.md worker-crash bullet committed here. Executor =standard paid pin.
- [x] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests,
      manifest updates, green `npm run verify`, tick and commit (DEMO shots).
- [x] Step 3 (Lead session): strict acceptance probe over every boundary
      contract (including the no-fake-commit and byte-identical-enqueue
      counter-examples), metrics extraction, ledger entry, tick Step 3,
      commit. NOTE (2026-10-31): probe green; both the executor and the
      lead hit one PROBE-SIDE sequencing trap (assert crash-tail wording
      only AFTER the crashed run exists; run-scope journey assertions —
      older runs float above). LEAD REVIEW: all executor deviations
      ACCEPTED (`pendingCount` accessor; `redeliveredCommits` as the
      snapshot-observable commit-after-crash evidence; the
      `js/panel/model-stage5-chain.js` extract fixing the same
      fake-commit leak in the hop-status surface; trace-stage6 sharing `workerTailFrame`).
      Guard green: 155 unit / 62 e2e.
