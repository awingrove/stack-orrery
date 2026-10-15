# Stage 1 alignment — executable conceptual model (Browser + Network + WebServer)

**For agentic workers:** read `AGENTS.md` and `FACTORY.md` first. Every design
decision below is pre-decided and signed off. Execute mechanically; keep every
gate in `npm run verify` green.

## Hard rules

- **NEVER** weaken a guardrail, existing test assertion, threshold, or manifest
  rule to make a gate pass.
- **Zero runtime dependencies.** Browser code is vanilla ESM; no inline
  handlers, inline scripts, or inline styles (CSP `script-src 'self'`).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Every guarantee-comment must use `CHECKS:`, `PINS:`, or
  `DOCUMENTS:` — never bare guarantee words (`guarantees`, `always`, `never`,
  `ensures`, `will` used as a promise) outside a claim keyword.
- **File size.** Every source file must stay ≤ 300 lines (`guard-file-size.mjs`).
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the
  same commit as the slice code (`guard-slices.mjs`).

## Pre-decided component contracts

### 1. `js/sim/browser.js`

Exports `createBrowser({ name = 'Browser-1', address = '10.2', network = null } = {})`:

- Validates `address` matches `/^\d+\.\d+$/`; throws `Error(\`browser: address must be <net>.<host>, got ${address}\`)` otherwise (`CHECKS:` comment).
- `createRequest(path = '/')` returns `` `GET ${path}` `` (slimmed-down HTTP).
- `parseResponse(raw)` parses `` `<status> <body>` `` (first space-separated token as `Number`, remainder as `body`) and returns `{ status, body }`.
- `get(targetAddress, path = '/')`:
  - Requires `network` (throws `Error('browser: no network attached')` if null).
  - Builds `request = this.createRequest(path)`, calls `const { response } = network.send({ from: address, to: targetAddress, request })`, parses with `parseResponse(response)`, stores `{ from: address, to: targetAddress, request, response, status, body }` as `lastDisplay`, and returns it.
- `last()` returns the most recent display record (or `null` before any `get`).
- Exposes `name` and `address` getters/properties.

### 2. `js/sim/network.js`

Exports `createNetwork()`:

- Helper validates two-number mini-IP `/^\d+\.\d+$/`; throws `Error(\`network: invalid mini-IP address ${addr}\`)` if invalid (`CHECKS:` comment).
- `registerServer(address, server)` validates `address` and stores `server` in a `Map`.
- `resolve(address)` validates `address`, returns the registered server, or throws `Error(\`network: no server at ${address}\`)`.
- `send({ from, to, request })` validates `from` and `to`, resolves `server` at `to`, calls `const response = server.handleRequest(request)`, and returns `{ from, to, request, response }`.
- `deliverToQueue({ id, from, to, request, atTick })` validates `from` and `to`, resolves `server` at `to`, and calls `server.enqueue({ id, from, to, request, atTick })`.

### 3. `js/sim/webserver.js`

Exports `createWebServer({ address = '10.1', serviceRate = 4 } = {})`:

- Keeps the existing `serviceRate` validation (`Number.isInteger(serviceRate) && serviceRate >= 1`).
- Exposes `address`.
- `handleRequest(request = 'GET /')`:
  - Splits `String(request).trim()` on the first space into `method` and `path`.
  - If `method !== 'GET'`, returns `'405 Only GET requests are supported'`.
  - If `path === '/'`, returns `'200 Welcome to the home page'`.
  - If `path === '/about'`, returns `'200 This is the about page'`.
  - Otherwise returns `'404 Page not found'`.
- `enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /' })`: pushes `{ id, atTick, from, to, request }` onto `queue` (defaults keep existing unit tests calling `enqueue({ id, atTick })` working unchanged).
- `step(currentTick)`: splices up to `serviceRate` items FIFO; for each item runs `const response = this.handleRequest(r.request)`, splits `response` into `status` (`Number` of first token) and `body` (rest), and emits:
  `{ id: r.id, from: r.from, to: r.to, request: r.request, response, status, body, latencyTicks: currentTick - r.atTick + 1 }`.
  Updates `served` and `latencyWindow` (rolling 50) and returns the array of response records.
- `metrics()` returns `{ queueDepth: queue.length, served, avgLatencyTicks }` (unchanged shape).

### 4. `js/sim/users.js`

Exports `createUsers({ count = 5, serverAddress = '10.1' } = {})`:

- Keeps `count` validation (`Number.isInteger(n) && n >= 0`), `setCount(next)`, `getCount()`.
- Cycles paths across `const PATHS = ['/', '/about', '/missing']`.
- In `step(rng, arrivalProb)`: for each user `i` in `0 .. n - 1`, if `rng() < arrivalProb`, instantiates or uses a `Browser` with `name: \`Browser-${i + 1}\``and`address: \`10.${i + 2}\``, builds `request = browser.createRequest(PATHS[i % PATHS.length])`, and pushes `{ userId: i, from: browser.address, to: serverAddress, request }`.

### 5. `js/sim/engine.js`

Exports `createEngine({ seed = 42, users = 5, serviceRate = 4, arrivalProb = 0.5, serverAddress = '10.1' } = {})`:

- Keeps `arrivalProb` range check `[0, 1]`.
- Creates `rng = createRng(seed)`, `network = createNetwork()`, `server = createWebServer({ address: serverAddress, serviceRate })`, registers `network.registerServer(serverAddress, server)`, and creates `userPool = createUsers({ count: users, serverAddress })`.
- Tracks `lastExchange = null`.
- `step()`:
  - Increments `tick += 1`.
  - Gets `arrivals = userPool.step(rng, arrivalProb)`.
  - For each arrival `r`, calls `network.deliverToQueue({ id: \`${tick}:${r.userId}\`, from: r.from, to: r.to, request: r.request, atTick: tick })`.
  - Calls `const servedBatch = server.step(tick)`.
  - If `servedBatch.length > 0`, sets `lastExchange = servedBatch[servedBatch.length - 1]`.
  - Returns `this.snapshot()`.
- `snapshot()` returns:
  `{ tick, users: userPool.getCount(), serverAddress, queueDepth, served, avgLatencyTicks, lastExchange }`.

### 6. `js/panel/model.js`, `js/panel/panel.js`, `panel.html`, `css/panel/panel.css`

- `describeSnapshot(snapshot)` in `js/panel/model.js` returns all existing fields (`tick`, `users`, `queueDepth`, `served`, `latency`, `queueFill`) **plus**:
  - `serverAddress: snapshot.serverAddress ?? '10.1'`
  - `exchangeSummary`: if `snapshot.lastExchange` is non-null, returns `` `${snapshot.lastExchange.from} -> ${snapshot.lastExchange.to} ${snapshot.lastExchange.request} => ${snapshot.lastExchange.response}` ``; otherwise `'No requests served yet'`.
- `panel.html`:
  - Inside `.controls`, add `<button id="step-button" data-testid="step-button" type="button">Step 1 tick</button>` right after `#start-button`.
  - Inside `.server`, show the server's mini-IP address: `<span id="server-address" class="ip-badge" data-testid="server-address">10.1</span>`.
  - Below `.stats`, add an exchange inspector section:
    ```html
    <section class="inspector" aria-label="Live exchange inspector">
      <h2 class="inspector-title">Latest exchange on the wire</h2>
      <p id="exchange-inspector" class="exchange-line" data-testid="exchange-inspector">
        No requests served yet
      </p>
    </section>
    ```
- `js/panel/panel.js`:
  - Renders `serverAddress` into `#server-address` and `exchangeSummary` into `#exchange-inspector`.
  - Clicking `#step-button` creates `engine` if null (with current slider count) and advances one tick (`render(engine.step())`) without starting the interval timer (if the timer is running, pauses it first, then steps 1 tick).
- `css/panel/panel.css`:
  - Style `.ip-badge`, `.inspector`, `.inspector-title`, and `.exchange-line` (monospace font for `.exchange-line` so mini-IPs and `"GET /"` → `"200 ..."` read clearly).

### 7. Tests & manifests

- Add `test/sim/network.test.js` testing:
  - `browser sends slim GET over network mini-IP and parses 200 and 404 responses`
  - `network rejects invalid mini-IP addresses and unknown hosts`
- Add to `test/sim/webserver.test.js`:
  - `handleRequest routes slim GET paths to 200 or 404 and rejects non-GET with 405`
- Add to `test/panel/model.test.js`:
  - `formats the latest HTTP exchange across mini-IPs for the inspector`
- Add to `e2e/panel.spec.js`:
  - `should step a single tick and display the slim HTTP exchange over mini-IP 10.1`
- Reference the new unit and e2e tests in `slices.yaml` and `storymap.yaml` in the same commit.

## Steps

- [ ] **Step 1: Commit this brief** at `docs/plans/2026-10-15-stage1-executable-model.md`.
- [ ] **Step 2: Implement the executable conceptual model, panel inspector, tests, and manifest updates** across `js/sim/browser.js`, `js/sim/network.js`, `js/sim/webserver.js`, `js/sim/users.js`, `js/sim/engine.js`, `js/panel/model.js`, `js/panel/panel.js`, `panel.html`, `css/panel/panel.css`, `test/sim/network.test.js`, `test/sim/webserver.test.js`, `test/panel/model.test.js`, `e2e/panel.spec.js`, `slices.yaml`, and `storymap.yaml`.
      Verify: `npm run verify` green.
- [ ] **Step 3: Tick completed steps in `docs/plans/2026-10-15-stage1-executable-model.md`** and re-run `npm run verify`.
