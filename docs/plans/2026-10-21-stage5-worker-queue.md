# Stage 5 — Worker Queue & Async Background Processing (`10.40` / `10.41`)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Execute mechanically from Step 2 and keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test assertion, threshold, or manifest rule. Stage 1 remains default on `/panel.html` load so Stages 1–4 tests pass unchanged.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers/styles (`scripts/static-server.mjs` CSP).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Strict `CHECKS:`, `PINS:`, or `DOCUMENTS:` tags only.
- **File size.** Modules ≤ 300 lines, tests ≤ 450 lines, HTML ≤ 550 lines (`scripts/guard-file-size.mjs`).
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the same commit.

## Pre-decided boundary contracts

### 1. `js/sim/queue.js` (new component)

- Exports `createWorkerQueue({ address = '10.40', workerAddress = '10.41', jobDurationTicks = 2 } = {})`.
- Validates mini-IPs `/^\d+\.\d+$/` and integer `jobDurationTicks >= 1` (`CHECKS:`).
- State: `jobs = []`, `enqueued = 0`, `completed = 0`, `activeJob = null`.
- `enqueue(path, payload, currentTick = 0)`: returns `{ jobId, path, payload, status: 'queued', queuedAtTick: currentTick }`.
- `step(database, currentTick = 0)`: dequeues next job, executes work across `jobDurationTicks`, writes result record to `database.write(path, result, currentTick)`, marks job completed.
- `snapshot(currentTick = 0)`: returns `{ address, workerAddress, enqueued, completed, activeJob, pendingJobs: jobs.slice() }`.

### 2. `js/sim/webserver.js`, `js/sim/engine.js` & `js/sim/trace.js`

- `webserver.js`: accepts optional `workerQueue`. For `POST /jobs` (or `/export`), pushes to `workerQueue.enqueue`, returns immediate `202 {"jobId": N, "status": "queued"}` (`routeId`, `asyncJob: true`). Standard `GET` and sync `POST` routes remain unchanged.
- `engine.js`: accepts `stage = 5`, initializes `workerQueue` (`10.40`), steps queue and worker each tick, exposes in `snapshot().workerQueue`.
- `trace.js`: implements 8-hop Stage 5 trace:
  - `Hop 1/8`: Browser emits `POST /jobs` to `10.1`.
  - `Hop 2/8`: Network routes to LoadBalancer `10.1`.
  - `Hop 3/8`: LoadBalancer enqueues to backend `10.11` (or `10.12`).
  - `Hop 4/8`: WebServer enqueues job to WorkerQueue `10.40`.
  - `Hop 5/8`: WebServer builds immediate `202 Accepted` response.
  - `Hop 6/8`: WebServer returns HTTP response via Network.
  - `Hop 7/8`: Browser receives and displays `202 Accepted`.
  - `Hop 8/8`: Worker `10.41` finishes job and commits to Database `10.30`.

### 3. Orrery Layout & UI (`js/panel/**`, `panel.html`, `index.html`)

- `layout.js`: adds 7-ring Stage 5 geometry (`ring-db` `r=400`, `ring-workers` `r=800`, `ring-cache` `r=1200`, `ring-compute` `r=1600`, `ring-lb` `r=2000`, `ring-network` `r=2400`, `ring-clients` `r=2800`).
- `viewport.js`: positions `#node-queue` (`10.40`), `#node-worker` (`10.41`), and connecting wires.
- `panel.html` & `index.html`: unlocks `#stage-pill-5` as clickable `<button class="stage-pill">5 · Worker Queue</button>`, adds `#node-queue`, `#node-worker`, `#queue-stats`, `#queue-jobs-list`, and inspector tabs.

### 4. Tests & Manifests

- `test/sim/queue.test.js`: unit tests for enqueue, FIFO execution, and DB write.
- `test/panel/model.test.js`: 8-hop trace labels and inspector queue state.
- `e2e/panel.spec.js`: switch to Stage 5, send async `POST /jobs`, verify `202 Accepted`, worker completion, and inspector view.
- Update `slices.yaml` and `storymap.yaml` with Stage 5 tasks, owns, and test references.

## Execution steps

- [x] Step 1 (Lead session): human design sign-off committed in `DESIGN.md` and `docs/plans/2026-10-21-stage5-worker-queue.md`.
- [x] Step 2 (Executor sub-agent): cold implementation from brief contracts, unit & e2e tests, manifest updates, and green `npm run verify`.
- [x] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, and commit.
