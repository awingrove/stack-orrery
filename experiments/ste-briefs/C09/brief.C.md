# Step 2 — Stage 6b CDN Edge

You are executing Step 2 of the committed factory brief
`docs/plans/2026-10-25-stage6b-cdn-edge.md` on branch
`feat/stage6b-cdn-edge` (stack-orrery, current working directory).
That brief is your contract source of truth — implement cold from it.

## Pre-read order

Before coding, read these in order:

1. `AGENTS.md` — static vanilla-ESM stack, strict CSP (no inline
   handlers/scripts/styles), determinism in `js/sim/**` (no
   `Math.random`/`Date.now`), strict `CHECKS:`/`PINS:`/`DOCUMENTS:`
   claim vocabulary, manifests same-change, UI must consume the
   components' actual messages (a listed hop must never narrate a
   delivery the model never makes).
2. `FACTORY.md` and `DESIGN.md` — note the amended Stage 6 (9 rings)
   registry, the Router re-seat (`10.65 ⇄ 20.254`), and the new CDN
   Edge component contract in the Service Internals section.
3. The brief itself — especially its five negative-case contracts and
   its hop-by-hop trace shapes (HIT = 6 hops, MISS = 9, POST = MISS
   minus fill).
4. Code you extend without breaking:
   - `js/sim/dns.js` — the tick-TTL ledger pattern your `js/sim/cdn.js`
     mirrors (expired-entry counter-example lives there verbatim style).
   - `js/sim/router.js` — `forward({ id, from, to, request, atTick, isYou })`
     returns `{ from, to, via }` and registers its own seat at
     `rightAddress`; per-crossing `routed`. Re-seat: default
     `rightAddress` `'20.1'` → `'20.254'`; update its comment lines.
   - `js/sim/trace-stage6.js` — the stage-6 machine: hop-1 ask runs
     the real `dns.lookup`, hop 2 answers, then `chainStep(s5)` replays
     the stage-5 shape. The CDN branch keys on the DNS answer's subnet
     (`subnetOf(answer.target) === subnetOf(edge.address)`) using the
     same fail-loud conventions; when the answer targets subnet 20, the
     GET rides the Router into `20.1`. A listed hop must never show a
     wire arrow toward a hostname — the browser's GET exists only
     after the DNS answer.
   - `js/sim/engine.js` — stage >= 6 wiring. The inline
     `createNetwork()` right-side instance should be hoisted to a
     variable `rightNetwork` so the edge can register at `20.1`. Add
     `snapshot.cdn` and wire the edge into the trace machine (check
     `js/sim/trace.js`'s `createTraceMachine` dispatch to stage 6).
   - `test/sim/router.test.js` — re-seat pins:
     `rightAddress: '20.254'`, identity response `200 Router 10.65 ⇄ 20.254`,
     `reject to 20.9` unchanged, the 20.9 `toThrow` message stays
     `network: no server at 20.9`.
   - Panel files: `js/panel/layout-stage6.js`, `js/panel/stage6-registry.js`,
     `js/panel/inspector-source-stage6.js`, `js/panel/inspector-state.js`,
     `js/panel/render.js` `renderDnsHud` (lazy-element precedent for
     `/^\S/` DOM-injected nodes — the CDN card follows the same
     lazy-lookup rule), `js/panel/teaching.js` `STAGE_TEACHING[6]`,
     `panel.html`, `index.html`.
   - `docs/plans/2026-10-24-stage6a-dns-crossnet.md` — for 6a wording
     context only.

## Deliverables

All on `feat/stage6b-cdn-edge`, per brief §1–§5.

### Simulation core

- **`js/sim/cdn.js`** — `createCdnEdge({ address = '20.1', ttlTicks = 10, originAddress = '10.1' })`
  with `lookup(path, currentTick)` / `fill(path, body, currentTick)` /
  `snapshot(currentTick)` exactly per brief §1: validation fail-loud,
  alive-through-ticks eviction, HIT/MISS branch, POST never fills
  (the trace machine decides what calls fill).
- **`js/sim/dns.js`** — the authoritative table gains
  `cd.example.com -> 20.1`. No other change.
- **`js/sim/router.js`** — default `rightAddress = '20.254'` (comment:
  the edge owns 20.1 from Stage 6b); update its comment lines.
- **`js/sim/engine.js`** — stage-6 edge instantiation + registration on
  `rightNetwork` at `20.1` + `snapshot.cdn`; wire the edge into the
  trace machine.
- **`js/sim/trace-stage6.js`** (and a sibling module only if the 300-line
  cap demands) — implement the CDN chain per brief §3 hop specs:
  HIT 6 hops, MISS 9 hops, POST pass-through (origin pull without
  fill). Hops 3/5/8 do real `router.forward` crossings (each increments
  `routed`). On MISS, hop 6 does a real `lb.enqueue` and hop 7 a real
  `drainUntilYou(backend)` so the origin cache-aside participates (its
  `cacheStatus` rides the origin-serve frame). A CDN HIT serves
  whatever bytes the edge ledger holds — bytes that arrived via `fill`
  from an earlier real pull. Never fabricate body bytes.

### Panels

- `layout-stage6.js` — 9-ring registry + edge node.
- `stage6-registry.js` — `#node-cdn` card with `#cdn-stats` +
  `#cdn-entries-list` (lazy lookups).
- Inspector source/state gain the cdn section.
- `teaching.js` `STAGE_TEACHING[6]` — edge story per brief §4 (replace
  the "nothing is there yet" line).
- `index.html` — stage-6 card copy completes the stage.

### Tests

Titles verbatim per brief §5.

- **Unit** — `test/sim/cdn.test.js`; router re-seat updates; engine
  additions (edge wiring, HIT ends `Hop 6/6`, MISS ends `Hop 9/9`,
  POST pass-through leaves edge counters at initial values);
  `test/panel/model-stage6.test.js` narrative pins.
- **E2e** — NEW `e2e/cdn-edge.spec.js` with the four pinned titles.
  Assert the real cards + `#journey-log` + router `routed` counter.
  For the stale-at-edge pin, edit the origin file through the UI flow
  from `e2e/fs-editor.spec.js`'s edit helpers or replicate that flow
  inline.

### Manifests (same-change)

- **`slices.yaml`** — if SIM `js:` is glob-claimed, do NOT add an
  explicit `js/sim/cdn.js` entry (guard-slices double-claim rule).
  Add the new e2e spec explicitly.
- **`storymap.yaml`** — SIM-6/PANEL-6 rows gain the new titles.

## Invariants

- **Stage-6a semantic shapes stay byte-identical**: hosted-home 9 hops,
  host-less 8, NX 2.
- Pins touching 6a files move only where the brief says (router
  re-seat, dns table). Where the re-seat changes `20.1` replica
  seatings, state the change in a comment but never weaken a pin.
- Never weaken a guardrail. Existing test suites keep passing except
  where the re-seat changes `20.1` replica seatings.
- Respect the file caps: 300 lines for `js/**`; split
  `trace-stage6.js` only if the cap demands.

## Gate and close

- Run `npm run verify`. Red gate = fix the named cause. Second
  rejection of the same gate = stop and report.
- Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
- Commit everything as
  `feat(stage6b): cdn edge 20.1 with tick-TTL pull-through + router re-seat (stage6b Step 2)`
  on `feat/stage6b-cdn-edge`. Do not push, do not open a PR.

## Report back

Files added/removed, `trace-stage6.js` final line count (and any
module split), test names added, exact verify result, commit hash,
and anything in the brief that was ambiguous or under-pinned.
