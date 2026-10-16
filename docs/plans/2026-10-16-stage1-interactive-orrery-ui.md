# Stage 1 interactive Orrery UI — URL bar, hop-by-hop trace, visible queues, code & state inspector

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Every design decision below is pre-decided and signed off by the human after
reviewing the live mockup. Execute mechanically; keep every gate in
`npm run verify` green.

## Hard rules

- **NEVER** weaken a guardrail, existing test assertion, threshold, or manifest
  rule to make a gate pass. All existing `data-testid`s and unit/e2e tests must
  continue to pass.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers, inline
  scripts, or inline `style=""` attributes in HTML.
- **Determinism.** `js/sim/**` does not call `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Every guarantee-comment must start with `CHECKS:`,
  `PINS:`, or `DOCUMENTS:`. Do not write bare guarantee words (`guarantees`,
  `always`, `never`, `ensures`, `will` used as a promise) outside a claim
  keyword — and when rephrasing, write `"does not"` rather than deleting the
  negation word.
- **File size.** Every source file (`html`, `css`, `js`, `test`, `e2e`) must
  stay **≤ 300 lines** (`guard-file-size.mjs`). Split CSS and JS across the
  modules specified below.
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the
  same commit as the code (`guard-slices.mjs`).

## Pre-decided module & UI contracts

### 1. `js/sim/browser.js`

Extend `createBrowser({ name = 'Browser-1', address = '10.2', network = null } = {})`:

- `createRequest(path = '/', method = 'GET')` returns `` `${method} ${path}` ``
  (default `method = 'GET'` keeps existing `createRequest('/about')` calls
  returning `'GET /about'`).
- `receiveResponse({ from, to, request, response })`: parses `response` with
  `this.parseResponse(response)`, stores
  `lastDisplay = { from, to, request, response, status, body }`, and returns it.
- `get(targetAddress, path = '/', method = 'GET')` uses
  `this.createRequest(path, method)` and `this.receiveResponse(...)`.

### 2. `js/sim/webserver.js`

Extend `createWebServer({ address = '10.1', serviceRate = 4 } = {})`:

- Add `matchRoute(request = 'GET /')`:
  - Returns `{ response, status, body, routeId }` where `routeId` is:
    - `'route-405'` when `method !== 'GET'`
    - `'route-home'` when `path === '/'`
    - `'route-about'` when `path === '/about'`
    - `'route-404'` otherwise
- `handleRequest(request = 'GET /')` returns `matchRoute(request).response`
  (unchanged return string).
- `enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /', isYou = false })`
  stores `{ id, atTick, from, to, request, isYou }` in `queue`.
- `step(currentTick)` includes `routeId: matched.routeId` and `isYou: r.isYou`
  on each returned response object (alongside `id`, `from`, `to`, `request`,
  `response`, `status`, `body`, `latencyTicks`).
- `queueSnapshot()` returns `queue.map((r) => ({ ...r }))`.

### 3. `js/sim/engine.js`

Extend `createEngine({ seed = 42, users = 5, serviceRate = 4, arrivalProb = 0.5, serverAddress = '10.1' } = {})`:

- Create an interactive client browser `clientBrowser = createBrowser({ name: 'Browser (You)', address: '10.2', network })`.
  (Crowd users in `users.js` keep their existing addresses; keep `users.js`
  unchanged so seed-42 tick sequences in existing tests stay identical!)
- Track:
  - `lastExchange = null`
  - `lastMatchedRoute = null`
  - `lastFrame = null`
  - `trace = { hop: 0, method: 'GET', path: '/about', request: 'GET /about', response: null, status: null, body: null, routeId: null }`
- In `step()`:
  - Existing crowd arrival + `network.deliverToQueue` + `server.step(tick)`
    behavior stays identical so the existing seed-42 replay test and first-tick
    e2e test (`10.6 -> 10.1 GET /about => 200 This is the about page`) pass
    unchanged.
  - When `servedBatch.length > 0`, set `lastExchange = servedBatch[servedBatch.length - 1]`,
    `lastMatchedRoute = lastExchange.routeId`, `lastFrame = \`${lastExchange.from} -> ${lastExchange.to} | ${lastExchange.request} => ${lastExchange.response}\``,
and if any item in `servedBatch`has`isYou: true`, call
`clientBrowser.receiveResponse(item)`.
- Add `traceHop({ method = 'GET', path = '/about' } = {})`:
  - Advances a 4-hop single-request trace for `clientBrowser` (`10.2` -> `10.1`):
    - When `trace.hop === 0 || trace.hop === 4`: sets `hop = 1`, builds
      `request = clientBrowser.createRequest(path, method)`, sets
      `trace = { hop: 1, method, path, request, response: null, status: null, body: null, routeId: null }`,
      sets `lastFrame = \`10.2 -> ${serverAddress} | ${request}\``.
    - When `trace.hop === 1`: sets `hop = 2`, increments `tick += 1`, calls
      `network.deliverToQueue({ id: \`you:${tick}\`, from: '10.2', to: serverAddress, request: trace.request, atTick: tick })`(or marks the queued entry`isYou: true`by passing`isYou: true`through`deliverToQueue`into`server.enqueue`), sets
`lastFrame = \`routed 10.2 -> ${serverAddress} (${trace.request}) into queue\``.
    - When `trace.hop === 2`: sets `hop = 3`, serves the queued request via
      `server.step(tick)` (or if behind crowd items, drains up to `serviceRate`
      including the `you` request), sets `trace.response`, `trace.status`,
      `trace.body`, `trace.routeId`, `lastExchange`, `lastMatchedRoute`, and
      `lastFrame = \`${serverAddress} -> 10.2 | ${trace.response}\``.
    - When `trace.hop === 3`: sets `hop = 4`, calls
      `clientBrowser.receiveResponse({ from: '10.2', to: serverAddress, request: trace.request, response: trace.response })`.
  - Returns `this.snapshot()`.
- `snapshot()` returns all existing keys (`tick`, `users`, `serverAddress`,
  `queueDepth`, `served`, `avgLatencyTicks`, `lastExchange`) **plus**:
  - `queue: server.queueSnapshot()`
  - `lastMatchedRoute`
  - `lastFrame`
  - `browserDisplay: clientBrowser.last()`
  - `trace: { ...trace }`

### 4. `js/panel/inspector-source.js` (new module, ≤ 120 lines)

- Exports `COMPONENT_SOURCE` mapping `'browser'`, `'network'`, and `'webserver'`
  to `{ file, title, code }` containing the readable JS implementation of each
  component.
- Exports `formatComponentState(snapshot, component)` returning a JSON string
  (`JSON.stringify(stateObj, null, 2)`) of that component's live internal state
  derived from `snapshot`:
  - `'browser'` -> `{ name: 'Browser (You)', address: '10.2', lastDisplay: snapshot.browserDisplay ?? null }`
  - `'network'` -> `{ subnet: '10.x', interfaces: { '10.1': 'WebServer', '10.2': 'Browser (You)', Crowd: `${snapshot.users} simulated browsers` }, lastFrame: snapshot.lastFrame ?? null }`
  - `'webserver'` -> `{ address: snapshot.serverAddress ?? '10.1', serviceRatePerTick: 4, queueDepth: snapshot.queueDepth, queuedRequests: (snapshot.queue ?? []).slice(0, 8).map((q) => `${q.from} -> ${q.request}`), servedTotal: snapshot.served, lastMatchedRoute: snapshot.lastMatchedRoute ?? null }`

### 5. `js/panel/model.js` (≤ 100 lines)

- Keep all existing returned fields on `describeSnapshot(snapshot)`:
  `tick`, `users`, `queueDepth`, `served`, `latency`, `queueFill`,
  `serverAddress`, `exchangeSummary`.
- Add to `describeSnapshot(snapshot)`:
  - `hop`: `snapshot.trace?.hop ?? 0`
  - `hopStatus`:
    - `0`: `'Idle — type a path and click Go or Step 1 Hop ->'`
    - `1`: `` `Hop 1/4: Browser (10.2) emits "${snapshot.trace.request}"` ``
    - `2`: `` `Hop 2/4: Network (10.x) routes to ${snapshot.serverAddress ?? '10.1'} queue` ``
    - `3`: `` `Hop 3/4: WebServer (${snapshot.serverAddress ?? '10.1'}) -> "${snapshot.trace.response}"` ``
    - `4`: `` `Hop 4/4: Browser (10.2) rendered ${snapshot.trace.status}` ``
  - `browserStatus`: `snapshot.browserDisplay ? \`${snapshot.browserDisplay.status} (${snapshot.browserDisplay.request})\` : 'No response yet'`
  - `browserBody`: `snapshot.browserDisplay ? snapshot.browserDisplay.body : 'Send a request or step a hop to render a response.'`
  - `networkLastFrame`: `snapshot.lastFrame ?? 'No frames routed yet'`
  - `matchedRouteId`: `snapshot.lastMatchedRoute ?? null`

### 6. `panel.html`, `js/panel/panel.js`, `css/shell/base.css`, `css/panel/panel.css`, `css/panel/inspector.css`

- Keep every file ≤ 300 lines. Split the bottom-panel / inspector styles into
  `css/panel/inspector.css` and link both `css/panel/panel.css` and
  `css/panel/inspector.css` from `panel.html`.
- Update `css/shell/base.css` custom properties to include the tokens from
  `DESIGN.md` (`--bg`, `--surface`, `--surface-2`, `--border`, `--text`,
  `--text-muted`, `--accent`, `--accent-soft`, `--good`, `--good-soft`,
  `--warn`, `--warn-soft`, `--danger`, `--danger-soft`, `--mono`).
- In `panel.html`, preserve all existing `id`s and `data-testid`s:
  `users-slider`, `users-count`, `start-button`, `step-button`, `user-dots`,
  `server-address`, `queue-bar`, `tick`, `queue-depth`, `latency`, `served`,
  `exchange-inspector`.
- Add the new interactive elements with `data-testid`s:
  - Stage ladder pill `1 · Single Server`
  - Single-request trace controls: `#btn-play-request` (`data-testid="btn-play-request"`),
    `#btn-next-hop` (`data-testid="btn-next-hop"`), `#hop-status` (`data-testid="hop-status"`)
  - Clickable component cards: `#node-browser` (`data-testid="node-browser"`, `data-component="browser"`),
    `#node-network` (`data-testid="node-network"`, `data-component="network"`),
    `#node-webserver` (`data-testid="node-webserver"`, `data-component="webserver"`)
  - Mini-browser inside `#node-browser`: `#req-method` (`data-testid="req-method"`),
    `#url-input` (`data-testid="url-input"`, default value `"/about"`),
    `#btn-url-go` (`data-testid="btn-url-go"`), `.path-chip` buttons (`GET /`,
    `GET /about`, `GET /missing`, `POST /`), `#browser-status-badge`
    (`data-testid="browser-status-badge"`), `#browser-rendered-body`
    (`data-testid="browser-rendered-body"`)
  - Wire lanes: `#packet-req-left`, `#packet-res-left`, `#packet-req-right`,
    `#packet-res-right`
  - Network node: interface table (`10.1` WebServer, `10.2` Browser (You),
    `10.3+` crowd count) + `#network-last-frame` (`data-testid="network-last-frame"`)
  - WebServer node: `#server-queue-list` (`data-testid="server-queue-list"`)
    rendering `.queue-pill` items (or empty hint when queue is empty), plus
    `#queue-bar` and the 4 route items (`#route-home`, `#route-about`,
    `#route-404`, `#route-405`)
  - Bottom Component Code & State Inspector: `#inspector-title`
    (`data-testid="inspector-title"`), `.comp-tab` buttons
    (`data-select="browser"`, `"network"`, `"webserver"`), `#inspector-code`
    (`data-testid="inspector-code"`), `#inspector-state`
    (`data-testid="inspector-state"`)
  - Bottom Wire Journey Log: `#exchange-inspector` (`data-testid="exchange-inspector"`)
    and `#journey-log` (`data-testid="journey-log"`).

### 7. Tests & manifests

- Add unit test in `test/panel/model.test.js`:
  - `describes hop-by-hop trace labels and component inspector state`
- Add e2e test in `e2e/panel.spec.js`:
  - `should trace a custom URL hop-by-hop into the browser viewport and inspect component code`
    (visits `/panel.html`, enters `"/about"` or steps 4 hops with `#btn-next-hop`,
    asserts `#browser-rendered-body` shows `'This is the about page'` and
    `#browser-status-badge` contains `'200'`, then clicks `#node-webserver` and
    asserts `#inspector-code` contains `'handleRequest'` and `#inspector-state`
    contains `'"servedTotal": 1'`).
- Add the new unit and e2e test refs to `slices.yaml` and `storymap.yaml` in the
  same commit.

## Steps

- [x] **Step 1: Commit `DESIGN.md`, `FACTORY.md`, `AGENTS.md`, `slices.yaml`, and this brief** at `docs/plans/2026-10-16-stage1-interactive-orrery-ui.md`.
- [x] **Step 2: Implement the interactive Orrery UI, hop-by-hop trace, component code/state inspector, tests, and manifest updates** across `js/sim/browser.js`, `js/sim/webserver.js`, `js/sim/engine.js`, `js/panel/inspector-source.js`, `js/panel/model.js`, `js/panel/panel.js`, `panel.html`, `css/shell/base.css`, `css/panel/panel.css`, `css/panel/inspector.css`, `test/panel/model.test.js`, `e2e/panel.spec.js`, `slices.yaml`, and `storymap.yaml`.
      Verify: `npm run verify` green.
- [x] **Step 3: Tick completed steps in `docs/plans/2026-10-16-stage1-interactive-orrery-ui.md`** and re-run `npm run verify`.
