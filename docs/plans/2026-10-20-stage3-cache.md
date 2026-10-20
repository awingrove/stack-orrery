# Stage 3 — Application Cache-Aside & Tick-Based TTL (`10.20`)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Every design decision below is signed off by the human. Execute mechanically and
keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, existing test assertion, threshold, or manifest
  rule to make a gate pass. Stage 1 remains the default stage on `/panel.html`
  load so all existing Stage 1 and Stage 2 unit and e2e tests pass unchanged.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers, inline
  scripts, or inline `style=""` attributes in HTML (`scripts/static-server.mjs`
  sends `script-src 'self'; style-src 'self'`).
- **Determinism.** `js/sim/**` does not call `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Every guarantee-comment must start with `CHECKS:`,
  `PINS:`, or `DOCUMENTS:`. Do not write bare guarantee words (`guarantees`,
  `always`, `never`, `ensures`, `will` used as a promise) outside a claim
  keyword.
- **File size.** Production modules (`js/**`, `css/**`) ≤ 300 lines, tests
  (`test/**`, `e2e/**`) ≤ 450 lines, static HTML (`*.html`) ≤ 550 lines
  (`scripts/guard-file-size.mjs`). Split modules as specified below so every file
  stays well under its limit.
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the
  same commit as slice code (`scripts/guard-slices.mjs`).

## Pre-decided component & UI contracts

### 1. `js/sim/cache.js` (new executable cache component)

Exports `createCache({ address = '10.20', ttlTicks = 10 } = {})`:

- Validates `address` matches `/^\d+\.\d+$/`; throws
  `Error(\`cache: invalid mini-IP address \${address}\`)` (`CHECKS:`).
- Validates `Number.isInteger(ttlTicks) && ttlTicks >= 1`; throws
  `Error(\`cache: ttlTicks must be a positive integer, got \${ttlTicks}\`)`
(`CHECKS:`).
- Holds an in-memory `Map` (`entries = new Map()`) mapping `key` ->
  `{ key, value, cachedAtTick, expiresAtTick }`.
- Tracks `hits = 0`, `misses = 0`, `sets = 0`, `evictions = 0`, and
  `lastLookup = null` (`{ key, status: 'HIT' | 'MISS', atTick }`).
- `evictExpired(currentTick = 0)`:
  - Deletes any entry in `entries` where `currentTick >= entry.expiresAtTick`
    and increments `evictions += 1` for each evicted entry.
- `has(key, currentTick = 0)`:
  - Calls `evictExpired(currentTick)` and returns `entries.has(key)`.
- `get(key, currentTick = 0)`:
  - Calls `evictExpired(currentTick)`.
  - If `entries.has(key)`: increments `hits += 1`, sets
    `lastLookup = { key, status: 'HIT', atTick: currentTick }`, and returns
    `entries.get(key).value`.
  - Otherwise: increments `misses += 1`, sets
    `lastLookup = { key, status: 'MISS', atTick: currentTick }`, and returns
    `null`.
- `set(key, value, currentTick = 0)`:
  - Stores `{ key, value, cachedAtTick: currentTick, expiresAtTick: currentTick + ttlTicks }`
    in `entries` and increments `sets += 1`.
- `snapshot(currentTick = 0)`:
  - Calls `evictExpired(currentTick)` and returns:
    `{ address, ttlTicks, hits, misses, sets, evictions, lastLookup, entries: [...entries.values()].map((e) => ({ key: e.key, value: e.value, cachedAtTick: e.cachedAtTick, expiresAtTick: e.expiresAtTick, ttlRemaining: e.expiresAtTick - currentTick })) }`.

### 2. `js/sim/webserver.js` (cache-aside integration + fast HIT capacity)

Extend `createWebServer({ address = '10.1', serviceRate = 4, files = DEFAULT_FILES, cache = null } = {})`:

- When `cache === null` (Stages 1 and 2): behavior is 100% identical to existing
  Stage 1 and Stage 2 behavior.
- Add `resolveRequest(request = 'GET /', currentTick = 0)`:
  - When `cache === null`, returns `{ ...matchRoute(request), cacheStatus: null }`.
  - When `cache` is provided:
    - Parses `method` and `path`.
    - If `method !== 'GET'`, returns `{ ...matchRoute(request), cacheStatus: 'BYPASS' }`.
    - Calls `const cached = cache.get(path, currentTick)`.
    - If `cached !== null` (`HIT`): returns
      `{ response: \`200 \${cached}\`, status: 200, body: cached, routeId: path === '/' ? 'route-home' : \`route-\${path.slice(1)}\`, cacheStatus: 'HIT' }`.
    - If `cached === null` (`MISS`): runs `const matched = matchRoute(request)`.
      If `matched.status === 200`, calls `cache.set(path, matched.body, currentTick)`.
      Returns `{ ...matched, cacheStatus: 'MISS' }`.
- In `step(currentTick)`:
  - When `cache === null`: `const batch = queue.splice(0, serviceRate)` (unchanged).
  - When `cache` is provided:
    - Uses a tick work budget of `budget = serviceRate * 2` (`8` units at default
      `serviceRate = 4`).
    - Iterates through the front of `queue`: a request that is a warm `GET` cache
      hit (`method === 'GET' && cache.has(path, currentTick)`) costs `1` unit; a
      cache miss or non-GET costs `2` units. Pops and serves requests via
      `resolveRequest(r.request, currentTick)` while `used + cost <= budget`,
      emitting `cacheStatus` on each served response record.
    - Consequently, a cold or TTL-expired server serves `serviceRate` (`4`)
      requests per tick, whereas a warm server serves up to `serviceRate * 2` (`8`)
      requests per tick (`16/tick` across both servers in Stage 3).

### 3. `js/sim/trace.js` and `js/sim/engine.js`

To keep `js/sim/engine.js` well under 300 lines, extract the single-request
hop-by-hop state machine into `js/sim/trace.js`:

- `js/sim/engine.js`:
  - Accepts `stage = 1` (`1`, `2`, or `3`) and `ttlTicks = 10`, `cacheAddress = '10.20'`.
  - Validates `stage === 1 || stage === 2 || stage === 3` (`CHECKS:`).
  - In `stage === 3`:
    - Creates `cache = createCache({ address: cacheAddress, ttlTicks })`.
    - Creates two backend `WebServer` instances (`10.11`, `10.12`) with `cache`
      attached, and `lb = createLoadBalancer({ address: serverAddress, backends: backendAddresses, network })`.
    - In `step()`: calls `cache.evictExpired(tick)` at the start of the tick;
      delivers arrivals to `10.1`, steps both servers, and includes
      `cache: cache ? cache.snapshot(tick) : null` in `snapshot()`.
- `js/sim/trace.js`:
  - Handles 4-hop Stage 1, 5-hop Stage 2, and **6-hop Stage 3** traces:
    - `Hop 1/6`: Browser (`from`) emits request toward `10.1`.
    - `Hop 2/6`: Network (`10.x`) routes request to `LoadBalancer` (`10.1`).
    - `Hop 3/6`: `LoadBalancer` (`10.1`) selects next backend (`10.11` or `10.12`)
      round-robin and enqueues the request.
    - `Hop 4/6`: Target `WebServer` (`10.11` or `10.12`) checks `Cache` (`10.20`)
      and serves the queued request (`trace.cacheStatus = you.cacheStatus`,
      `'HIT'` or `'MISS'`), setting
      `lastFrame = \`\${backend.address} -> \${cache.address} | cache \${you.cacheStatus} (\${trace.path})\``.
    - `Hop 5/6`: `Cache` (`10.20`) / `WebServer` (`10.11` or `10.12`) emits the
      HTTP response (`lastFrame = \`\${backend.address} -> \${trace.from} | \${you.response} (\${trace.cacheStatus})\``).
    - `Hop 6/6`: Browser (`from`) receives and renders the response.

### 4. Concentric 5-Ring Layout & Viewport (`js/panel/camera.js`, `js/panel/layout.js`, `js/panel/viewport.js`)

- `js/panel/camera.js`:
  - Widen `WORLD_BOUNDS` to `{ minX: -2600, maxX: 600, minY: -900, maxY: 900 }`
    so all 5 rings in Stage 3 can be panned and fitted cleanly.
- `js/panel/layout.js`:
  - `buildOrreryRings(ringGap = DEFAULT_RING_GAP, stage = 1)` supports
    `stage === 1 || stage === 2 || stage === 3`:
    - Stage 3 returns 5 rings (`r_k = k * gap`):
      1. `['ring-cache', 'RING 1 · CACHE']` (`r = 400`)
      2. `['ring-compute', 'RING 2 · WEBSERVERS']` (`r = 800`)
      3. `['ring-lb', 'RING 3 · LOADBALANCER']` (`r = 1200`)
      4. `['ring-network', 'RING 4 · NETWORK']` (`r = 1600`)
      5. `['ring-clients', 'RING 5 · BROWSERS']` (`r = 2000`)
  - `computeStageLayout(stage = 1, users = 5, { ringGap = DEFAULT_RING_GAP, activeBrowser = '10.2' } = {})`:
    - In `stage === 3`:
      - `node-cache`: `pos('node-cache', 'ring-cache', rings[0].radius, 180)` -> `(-400, 0)`.
      - `node-webserver`: `pos('node-webserver', 'ring-compute', rings[1].radius, 200)`.
      - `node-webserver-2`: `pos('node-webserver-2', 'ring-compute', rings[1].radius, 160)`.
      - `node-lb`: `pos('node-lb', 'ring-lb', rings[2].radius, 180)` -> `(-1200, 0)`.
      - `node-network`: `pos('node-network', 'ring-network', rings[3].radius, 180)` -> `(-1600, 0)`.
      - `node-browser`: on `ring-clients` (`r = 2000`).
      - `wires`: `wire-browser-network`, `wire-network-lb`, `wire-lb-webserver`,
        `wire-lb-webserver-2`, `wire-webserver-cache`, `wire-webserver-2-cache`.
- `js/panel/viewport.js`:
  - Positions `#wire-servers-cache` at the midpoint between `wire-webserver-cache`
    and `wire-webserver-2-cache` when `layout.stage === 3`.

### 5. Panel DOM, Model & Inspector (`panel.html`, `js/panel/model.js`, `js/panel/inspector-source.js`, `js/panel/render-stage.js`, `js/panel/render.js`, `js/panel/panel.js`)

- `panel.html`:
  - Update `#orrery-svg` `viewBox` to `"-3000 -3000 6000 6000"`.
  - Convert `<span class="stage-pill">3 · Cache</span>` into
    `<button data-testid="stage-pill-3" data-stage="3" class="stage-pill" type="button">3 · Cache</button>`.
  - Add `<div id="wire-servers-cache" class="wire-column" aria-hidden="true" hidden>`
    with `#packet-req-cache` (`cache.get =>`) and `#packet-res-cache` (`<- hit / set`).
  - Add `<article class="node-card" id="node-cache" data-testid="node-cache" data-component="cache" hidden>`
    with header (`Cache`, `cache-aside TTL`, `.ip-chip` `10.20`, `</> Code`),
    `<p id="cache-stats" data-testid="cache-stats" class="mono last-frame">Hits: 0 · Misses: 0 · TTL: 10t</p>`,
    and `<ul id="cache-entries-list" data-testid="cache-entries-list" class="route-list" aria-label="Cache entries"></ul>`.
  - Add `<button class="comp-tab" type="button" data-select="cache">cache</button>` in `.comp-tabs`.
- `js/panel/model.js`:
  - `totalHops`: `stage === 3 ? 6 : stage === 2 ? 5 : 4`.
  - Formats Stage 3 6-hop `hopStatus` labels (`Hop 1/6` .. `Hop 6/6`), plus
    `cacheStatsLabel` (`Hits: ${hits} · Misses: ${misses} · TTL: ${ttlTicks}t`)
    and `cacheEntries` (`snapshot.cache?.entries ?? []`).
- `js/panel/inspector-source.js`:
  - Adds `cache` to `COMPONENT_SOURCE` and `STATE_BUILDERS` and includes
    `10.20: 'Cache'` in `network` interfaces when `snapshot.stage === 3`.
- Split `js/panel/render-stage.js` from `js/panel/render.js` so both files stay
  well under 300 lines.

### 6. Tests & Manifests

- Add `test/sim/cache.test.js`:
  - `serves cache hits before TTL expiry and evicts entries once ttlTicks elapse`
  - `stage 3 shares cache-aside entries across 10.11 and 10.12 and doubles warm capacity`
- Extend `test/panel/model.test.js`:
  - `describes Stage 3 6-hop cache-aside trace labels and cache inspector state`
- Extend `test/panel/camera.test.js` to cover 5-ring Stage 3 layout in
  `computes concentric ring coordinates and stage bounding boxes for the orrery`.
- Extend `e2e/panel.spec.js`:
  - `should switch to Stage 3, warm Cache 10.20 on a miss from 10.11, serve a hit from 10.12, and inspect cache code`
- Update `slices.yaml` and `storymap.yaml` (`Stage 3 — Cache (TTL, cache-aside)`
  with `SIM-3` and `PANEL-3`) in the same commit.

## Steps

- [x] **Step 1: Commit `DESIGN.md` amendment and this brief** at `docs/plans/2026-10-20-stage3-cache.md`.
- [ ] **Step 2: Implement `js/sim/cache.js`, `js/sim/trace.js`, Stage 3 support in `js/sim/webserver.js` and `js/sim/engine.js`, 5-ring geometry and UI in `js/panel/camera.js`, `js/panel/layout.js`, `js/panel/viewport.js`, `js/panel/model.js`, `js/panel/inspector-source.js`, `js/panel/render-stage.js`, `js/panel/render.js`, `js/panel/panel.js`, `panel.html`, unit tests in `test/sim/cache.test.js`, `test/panel/model.test.js`, `test/panel/camera.test.js`, e2e test in `e2e/panel.spec.js`, and manifest updates in `slices.yaml` and `storymap.yaml`.**
      Verify: `npm run verify` green.
- [ ] **Step 3: Tick completed steps in `docs/plans/2026-10-20-stage3-cache.md`** and re-run `npm run verify`.
