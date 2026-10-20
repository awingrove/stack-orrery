# Stage 4 — Database Primary/Replica & Replication Lag (`10.30` / `10.31`)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Every design decision below is signed off by the human. Execute mechanically and
keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, existing test assertion, threshold, or manifest
  rule to make a gate pass. Stage 1 remains the default stage on `/panel.html`
  load so all existing Stage 1–3 unit and e2e tests pass unchanged.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers, inline
  scripts, or inline `style=""` attributes in HTML (`scripts/static-server.mjs`
  sends `script-src 'self'; style-src 'self'`).
- **Determinism.** `js/sim/**` does not call `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Every guarantee-comment must start with `CHECKS:`,
  `PINS:`, or `DOCUMENTS:`. Do not write bare guarantee words (`guarantees`,
  `always`, `never`, `ensures`, `will` used as a promise) outside `CHECKS:` or
  `PINS:`.
- **File size.** Production modules (`js/**`, `css/**`) ≤ 300 lines, tests
  (`test/**`, `e2e/**`) ≤ 450 lines, static HTML (`*.html`) ≤ 550 lines
  (`scripts/guard-file-size.mjs`). Split `js/panel/inspector-state.js` from
  `js/panel/inspector-source.js` so every file stays well under its limit.
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the
  same commit as slice code (`scripts/guard-slices.mjs`).

## Pre-decided component & UI contracts

### 1. `js/sim/database.js` (new executable database + replication component)

Exports `createDatabase({ primaryAddress = '10.30', replicaAddress = '10.31', replicationLagTicks = 3, rows = DEFAULT_ROWS } = {})`:

- Validates `primaryAddress` and `replicaAddress` match `/^\d+\.\d+$/`; throws
  `Error(\`database: invalid mini-IP address ...\`)` (`CHECKS:`).
- Validates `Number.isInteger(replicationLagTicks) && replicationLagTicks >= 1`;
  throws `Error(\`database: replicationLagTicks must be a positive integer, got \${replicationLagTicks}\`)`
(`CHECKS:`).
- Holds `primary = new Map()` and `replica = new Map()` seeded from `rows` at
  `{ key, value, version: 1, updatedAtTick: 0 }`, plus `replicationQueue = []`
  (`{ key, value, version, writtenAtTick, applyAtTick }`).
- Tracks `reads = 0`, `writes = 0`, `staleReads = 0`, `replicated = 0`, and
  `lastOp = null`.
- `stepReplication(currentTick = 0)`:
  - Applies queued replication entries where `currentTick >= entry.applyAtTick`
    into `replica` in FIFO order and increments `replicated += 1` per applied entry.
- `read(key, currentTick = 0)`:
  - Calls `stepReplication(currentTick)` and increments `reads += 1`.
  - Reads `replicaRow = replica.get(key)` and compares against `primary.get(key)`.
  - Sets `stale = Boolean(primaryRow && (!replicaRow || replicaRow.version < primaryRow.version))`;
    if `stale`, increments `staleReads += 1`.
  - Records `lastOp = { op: 'SELECT', target: replicaAddress, key, found: Boolean(replicaRow), stale, atTick: currentTick }`
    and returns `{ found: Boolean(replicaRow), value: replicaRow ? replicaRow.value : null, version: replicaRow ? replicaRow.version : 0, stale, source: replicaAddress }`.
- `write(key, value, currentTick = 0)`:
  - Calls `stepReplication(currentTick)` and increments `writes += 1`.
  - Increments `version = (primary.get(key)?.version ?? 0) + 1`, writes to
    `primary`, and pushes `{ key, value, version, writtenAtTick: currentTick, applyAtTick: currentTick + replicationLagTicks }`
    onto `replicationQueue`.
  - Records `lastOp = { op: 'WRITE', target: primaryAddress, key, version, applyAtTick: currentTick + replicationLagTicks, atTick: currentTick }`
    and returns `{ key, value, version, applyAtTick: currentTick + replicationLagTicks, source: primaryAddress }`.
- `snapshot(currentTick = 0)`:
  - Calls `stepReplication(currentTick)` and returns `{ primaryAddress, replicaAddress, replicationLagTicks, reads, writes, staleReads, replicated, lastOp, pendingReplication, rows }`.

### 2. `js/sim/cache.js` & `js/sim/webserver.js`

- `js/sim/cache.js`:
  - Add `del(key)` to delete a key from `entries` when invalidated by a write.
- `js/sim/webserver.js`:
  - Accept `database = null` in `createWebServer`.
  - When `database === null` (Stages 1–3): behavior is unchanged.
  - When `database !== null` (Stage 4):
    - `POST /path`: writes `"Updated ${path} at tick ${currentTick}"` to
      `database.write(path, value, currentTick)`, invalidates `cache?.del(path)`,
      and returns `{ response: \`200 \${written.value}\`, status: 200, body: written.value, routeId, cacheStatus: 'INVALIDATE', dbOp: 'WRITE', dbTarget: database.primaryAddress, dbStale: false }`.
    - `GET /path`: checks `cache.get(path, currentTick)` first (`HIT` costs `1`
      work unit, `dbOp: null`). On cache `MISS` (`2` work units), queries
      `database.read(path, currentTick)` on `Replica (10.31)`: if `row.found`,
      populates `cache.set(path, row.value, currentTick)` when `!row.stale` (so
      transient replication-lag reads do not poison the cache before the replica
      catches up) and returns `200 ${row.value}` with `dbOp: 'SELECT'`,
      `dbTarget: database.replicaAddress`, `dbStale: row.stale`.

### 3. `js/sim/trace.js` & `js/sim/engine.js`

- `js/sim/engine.js`:
  - Accepts `stage = 1` (`1..4`), `replicationLagTicks = 3`,
    `dbPrimaryAddress = '10.30'`, `dbReplicaAddress = '10.31'`.
  - In `stage === 4`, creates `cache` (`10.20`) and `database` (`10.30` / `10.31`),
    attaches both to `10.11` and `10.12`, advances `database.stepReplication(tick)`
    each tick, and exposes `database: database ? database.snapshot(tick) : null` in
    `snapshot()`.
- `js/sim/trace.js`:
  - Supports **7-hop Stage 4** traces:
    - `Hop 1/7`: Browser emits request (`GET` or `POST`) toward `10.1`.
    - `Hop 2/7`: Network (`10.x`) routes request to `LoadBalancer` (`10.1`).
    - `Hop 3/7`: `LoadBalancer` (`10.1`) selects next backend (`10.11` / `10.12`)
      and enqueues the request.
    - `Hop 4/7`: Target `WebServer` checks `Cache` (`10.20`) — `HIT`, `MISS`, or
      `INVALIDATE`.
    - `Hop 5/7`: `Database` (`10.30` / `10.31`) hop — `WRITE` to Primary `10.30`
      (queuing replication to `10.31`), `SELECT` from Replica `10.31` (`fresh` or
      `STALE`), or `SKIP` on a warm cache `HIT`.
    - `Hop 6/7`: Target `WebServer` emits the HTTP response.
    - `Hop 7/7`: Browser receives and renders the response.

### 4. Concentric 6-Ring Layout & Panel UI (`js/panel/**`, `panel.html`, `index.html`)

- `js/panel/camera.js`: widen `WORLD_BOUNDS.minX` to `-3100`.
- `js/panel/layout.js`: add 6-ring Stage 4 geometry (`ring-db` `r=400`,
  `ring-cache` `r=800`, `ring-compute` `r=1200`, `ring-lb` `r=1600`,
  `ring-network` `r=2000`, `ring-clients` `r=2400`) with `node-db` at `(-400, 0)`
  and `wire-cache-db`.
- `js/panel/viewport.js`: position `#wire-cache-db` on `wire-cache-db` and include
  Stage 4 in `LANE_WIRES` and `LANES_BETWEEN`.
- `js/panel/model.js`, `js/panel/inspector-source.js`, `js/panel/inspector-state.js`,
  `js/panel/render-stage.js`, `js/panel/render.js`, `js/panel/panel.js`,
  `panel.html`, `index.html`: wire `#stage-pill-4`, `#node-db`, `#wire-cache-db`,
  `#db-stats`, `#db-rows-list`, and the `database` inspector tab.

### 5. Tests & Manifests

- Add `test/sim/database.test.js`:
  - `replicates primary writes to the read replica after replicationLagTicks and tracks stale reads`
  - `stage 4 engine writes to Primary 10.30, invalidates Cache 10.20, serves stale replica reads during lag, and catches up`
- Extend `test/panel/model.test.js`:
  - `describes Stage 4 7-hop database trace labels and database inspector state`
- Extend `test/panel/camera.test.js` for 6-ring Stage 4 geometry.
- Extend `e2e/panel.spec.js`:
  - `should switch to Stage 4, write to Primary 10.30 on POST, observe replica lag on GET, and inspect database code`
- Update `slices.yaml` and `storymap.yaml` (`Stage 4 — DB + replication`) in the
  same commit.

## Steps

- [x] **Step 1: Commit `DESIGN.md` amendment and this brief** at `docs/plans/2026-10-20-stage4-database.md`.
- [ ] **Step 2: Implement `js/sim/database.js`, Stage 4 support in `js/sim/cache.js`, `js/sim/webserver.js`, `js/sim/trace.js`, and `js/sim/engine.js`, 6-ring geometry and UI in `js/panel/camera.js`, `js/panel/layout.js`, `js/panel/viewport.js`, `js/panel/model.js`, `js/panel/inspector-source.js`, `js/panel/inspector-state.js`, `js/panel/render-stage.js`, `js/panel/render.js`, `js/panel/panel.js`, `panel.html`, `index.html`, unit tests in `test/sim/database.test.js`, `test/panel/model.test.js`, `test/panel/camera.test.js`, e2e test in `e2e/panel.spec.js`, and manifest updates in `slices.yaml` and `storymap.yaml`.**
      Verify: `npm run verify` green.
- [ ] **Step 3: Tick completed steps in `docs/plans/2026-10-20-stage4-database.md`** and re-run `npm run verify`.
