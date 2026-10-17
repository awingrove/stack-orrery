# Stage 2 — Load Balancer & Duplicated Web Servers (`10.1` -> `10.11`, `10.12`)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Every design decision below is signed off by the human. Execute mechanically and
keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, existing test assertion, threshold, or manifest
  rule to make a gate pass. Stage 1 remains the default stage on `/panel.html`
  load so all existing unit and e2e tests pass unchanged.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers, inline
  scripts, or inline `style=""` attributes in HTML.
- **Determinism.** `js/sim/**` does not call `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Every guarantee-comment must start with `CHECKS:`,
  `PINS:`, or `DOCUMENTS:`. Do not write bare guarantee words (`guarantees`,
  `always`, `never`, `ensures`, `will` used as a promise) outside a claim
  keyword.
- **File size.** Every source file (`html`, `css`, `js`, `test`, `e2e`) must
  stay **≤ 300 lines** (`guard-file-size.mjs`). Extract DOM rendering helpers
  into `js/panel/render.js` so `js/panel/panel.js` stays concise.
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the
  same commit as slice code (`guard-slices.mjs`).

## Pre-decided component & UI contracts

### 1. `js/sim/loadbalancer.js` (new executable component)

Exports `createLoadBalancer({ address = '10.1', backends = ['10.11', '10.12'], network = null } = {})`:

- Validates `address` matches `/^\d+\.\d+$/`; throws
  `Error(\`loadbalancer: invalid mini-IP address ${address}\`)` (`CHECKS:`).
- Validates `Array.isArray(backends) && backends.length > 0` and every backend
  matches `/^\d+\.\d+$/`; throws
  `Error('loadbalancer: backends must be a non-empty list of <net>.<host> addresses')`
  (`CHECKS:`).
- Tracks `nextIndex = 0`, `forwarded = 0`, `lastTarget = null`, and
  `perBackend` counts (`{ '10.11': 0, '10.12': 0 }`).
- `nextBackend()` returns `backends[nextIndex]` without advancing.
- `selectBackend()` picks `target = backends[nextIndex]`, advances
  `nextIndex = (nextIndex + 1) % backends.length`, increments `forwarded += 1`
  and `perBackend[target] += 1`, sets `lastTarget = target`, and returns `target`.
- `handleRequest(request = 'GET /')`: requires `network`, selects `target = this.selectBackend()`,
  calls `network.send({ from: address, to: target, request }).response`, and returns it.
- `enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /', isYou = false })`:
  requires `network`, selects `target = this.selectBackend()`, forwards via
  `network.deliverToQueue({ id, from, to: target, request, atTick, isYou })`, and
  returns `target`.
- `snapshot()` returns
  `{ address, algorithm: 'round-robin', backends: [...backends], nextBackend: backends[nextIndex], forwarded, lastTarget, perBackend: { ...perBackend } }`.

### 2. `js/sim/engine.js`

Extend `createEngine({ seed = 42, users = 5, serviceRate = 4, arrivalProb = 0.5, serverAddress = '10.1', stage = 1, backendAddresses = ['10.11', '10.12'] } = {})`:

- Validates `stage === 1 || stage === 2` (`CHECKS:`).
- When `stage === 1` (default): behavior and seed-42 sequence remain identical
  to Stage 1.
- When `stage === 2`:
  - Creates backend `WebServer` instances for `backendAddresses` (`10.11`, `10.12`),
    each with `serviceRate`, and registers each on `network`.
  - Creates `lb = createLoadBalancer({ address: serverAddress, backends: backendAddresses, network })`
    at `10.1` and registers `lb` on `network` at `serverAddress`.
  - In `step()`: crowd arrivals deliver to `10.1` (`lb.enqueue`), which
    round-robins across `10.11` and `10.12`; then all backend servers step
    (`servers.flatMap((s) => s.step(tick))`).
  - In `traceHop({ method = 'GET', path = '/about' } = {})`: runs a **5-hop**
    trace in Stage 2:
    - `Hop 1/5`: Browser (`10.2`) emits request toward `10.1`.
    - `Hop 2/5`: Network (`10.x`) routes request to `LoadBalancer` (`10.1`).
    - `Hop 3/5`: `LoadBalancer` (`10.1`) selects next backend (`10.11` or `10.12`)
      round-robin and enqueues the request into that backend's FIFO queue.
    - `Hop 4/5`: Target backend `WebServer` (`10.11` or `10.12`) serves the
      response.
    - `Hop 5/5`: Browser (`10.2`) receives and renders the response.
- `snapshot()` returns all existing keys plus:
  - `stage`
  - `loadBalancer`: `lb ? lb.snapshot() : null`
  - `servers`: `servers.map((s) => ({ address: s.address, ...s.metrics(), queue: s.queueSnapshot() }))`

### 3. `js/panel/model.js`, `js/panel/inspector-source.js`, `js/panel/render.js`, `js/panel/panel.js`

- `describeSnapshot(snapshot)` in `js/panel/model.js` supports both 4-hop Stage 1
  labels and 5-hop Stage 2 labels, plus `stage`, `totalHops`, `lbNextBackend`,
  `server1Address`, `server2Address`, `queueFill1`, and `queueFill2`.
- `js/panel/inspector-source.js` adds `loadbalancer` to `COMPONENT_SOURCE` and
  `STATE_BUILDERS` and enriches `webserver` state in Stage 2 with `instances`.
- `js/panel/render.js` holds DOM rendering functions extracted from
  `js/panel/panel.js` so every file stays well under 300 lines.
- `js/panel/panel.js` wires `.stage-pill[data-stage]` clicks (`#stage-pill-1`,
  `#stage-pill-2`) to switch between Stage 1 and Stage 2, resetting the engine
  for the chosen stage and updating the canvas topology.

### 4. `panel.html`, `css/panel/panel.css`, `css/panel/canvas.css`, `DESIGN.md`

- Convert Stage 1 and Stage 2 pills in `.stage-ladder` to `<button>` elements
  (`#stage-pill-1`, `#stage-pill-2`).
- Add `#node-lb` (`data-testid="node-lb"`, `data-component="loadbalancer"`, `hidden`),
  `#wire-lb-backends` (`hidden`), and `.backend-stack` containing `#node-webserver`
  and `#node-webserver-2` (`data-testid="node-webserver-2"`, `data-component="webserver"`, `hidden`).
- Add `loadbalancer` tab button in `.comp-tabs`.
- Amend `DESIGN.md` to cover interactive `.stage-pill` buttons and `.backend-stack`.

### 5. Tests & manifests

- Add `test/sim/loadbalancer.test.js`:
  - `distributes requests strictly round-robin across backend mini-IPs`
  - `stage 2 engine splits load across 10.11 and 10.12 and doubles service capacity`
- Add to `test/panel/model.test.js`:
  - `describes Stage 2 5-hop load-balancer trace labels and loadbalancer inspector state`
- Add to `e2e/panel.spec.js`:
  - `should switch to Stage 2, alternate requests across 10.11 and 10.12 via the load balancer, and inspect its code`
- Update `slices.yaml` and `storymap.yaml` in the same commit.

## Steps

- [x] **Step 1: Commit `DESIGN.md` amendment and this brief** at `docs/plans/2026-10-17-stage2-load-balancer.md`.
- [ ] **Step 2: Implement `js/sim/loadbalancer.js`, Stage 2 support in `js/sim/engine.js`, Stage 2 UI/inspector in `js/panel/model.js`, `js/panel/inspector-source.js`, `js/panel/render.js`, `js/panel/panel.js`, `panel.html`, `css/panel/panel.css`, `css/panel/canvas.css`, tests in `test/sim/loadbalancer.test.js`, `test/panel/model.test.js`, `e2e/panel.spec.js`, and manifest updates in `slices.yaml` and `storymap.yaml`.**
      Verify: `npm run verify` green.
- [ ] **Step 3: Tick completed steps in `docs/plans/2026-10-17-stage2-load-balancer.md`** and re-run `npm run verify`.
