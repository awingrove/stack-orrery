# Arm B brief: stage 6b CDN edge

You are the factory executor sub-agent for stack-orrery. You execute Step 2 of a committed factory brief.

## Context

The committed brief is `docs/plans/2026-10-25-stage6b-cdn-edge.md`. Treat it as the contract source of truth. Implement cold from it. Work on branch `feat/stage6b-cdn-edge` in the current working directory (stack-orrery).

## Pre-flight reads

Before you write code, read these files in this order:

1. Read `AGENTS.md`. Note the static vanilla-ESM stack. Note the strict CSP: no inline handlers, no inline scripts, no inline styles. Note the determinism rule in `js/sim/**`: no `Math.random`, no `Date.now`. Note the strict `CHECKS:`/`PINS:`/`DOCUMENTS:` claim vocabulary. Note the manifests same-change rule. Note that UI must consume the components' actual messages. A listed hop must not narrate a delivery the model never makes.
2. `FACTORY.md` and `DESIGN.md`. Note the amended Stage 6 registry (9 rings), the Router re-seat (`10.65 ⇄ 20.254`), and the new CDN Edge component contract in the Service Internals section.
3. The brief itself. Focus on its five negative-case contracts and its hop-by-hop trace shapes (HIT = 6 hops, MISS = 9, POST = MISS minus fill).
4. Code you extend without breaking:
   - `js/sim/dns.js`. The tick-TTL ledger pattern your `js/sim/cdn.js` mirrors.
   - `js/sim/router.js`. The `forward({ id, from, to, request, atTick, isYou })` returns `{ from, to, via }` and registers its own seat at `rightAddress`. Re-seat: default `rightAddress` `'20.1'` becomes `'20.254'`. Update its comment lines accordingly.
   - `js/sim/trace-stage6.js`. The stage-6 machine. Hop-1 ask runs the real `dns.lookup`. Hop 2 answers. Then `chainStep(s5)` replays the stage-5 shape. Your CDN branch keys on the DNS answer's subnet (`subnetOf(answer.target) === subnetOf(edge.address)`) with the same fail-loud conventions. When the answer targets subnet 20, the GET rides the Router into `20.1`.
   - `js/sim/engine.js`. The stage >= 6 wiring. The right-side `createNetwork()` instance is currently inline. Hoist it to a variable `rightNetwork` so the edge can register at `20.1`. Add `snapshot.cdn`. Wire the edge into the trace machine.
   - `test/sim/router.test.js`. The re-seat pins: `rightAddress: '20.254'`, identity response `200 Router 10.65 ⇄ 20.254`, `reject to 20.9` unchanged, the 20.9 `toThrow` message stays `network: no server at 20.9`.
   - `js/panel/layout-stage6.js`. `js/panel/stage6-registry.js`. `js/panel/inspector-source-stage6.js`. `js/panel/inspector-state.js`. `js/panel/render.js` `renderDnsHud` (lazy-element precedent for `/^\S/` DOM injected nodes). `js/panel/teaching.js` `STAGE_TEACHING[6]`. `panel.html`. `index.html`. `docs/plans/2026-10-24-stage6a-dns-crossnet.md` (for 6a wording context only).

## Deliverables

All deliverables go on branch `feat/stage6b-cdn-edge`.

### SIM layer

1. Create `js/sim/cdn.js`. Export `createCdnEdge({ address = '20.1', ttlTicks = 10, originAddress = '10.1' })`. Include `lookup(path, currentTick)`. Include `fill(path, body, currentTick)`. Include `snapshot(currentTick)`. Follow brief §1 exactly. Validation must fail-loud. Eviction must track alive-through-ticks. HIT and MISS branches must separate. POST must not fill. The trace machine decides what calls fill.
2. Update `js/sim/dns.js`. The authoritative table gains `cd.example.com -> 20.1`. Make no other change.
3. Update `js/sim/router.js`. Default `rightAddress = '20.254'`. Comment: the edge owns 20.1 from Stage 6b.
4. Update `js/sim/engine.js`. Instantiate the stage-6 edge. Register it on `rightNetwork` at `20.1`. Add `snapshot.cdn`. Wire the edge into the trace machine.
5. Update `js/sim/trace-stage6.js`. Implement the CDN chain per brief §3 hop specs. HIT = 6 hops. MISS = 9 hops. POST = pass-through (origin pull without fill). Hops 3, 5, 8 must do real `router.forward` crossings. Each increments `routed`. On MISS, hop 6 must do a real `lb.enqueue`. Hop 7 must do a real `drainUntilYou(backend)`. The origin cache-aside participates. Its `cacheStatus` rides the origin-serve frame. CDN HIT must serve whatever bytes the edge ledger holds. The bytes arrived via `fill` from an earlier real pull. Never fabricate body bytes.
6. A listed hop must not show a wire arrow toward a hostname. The browser's GET exists only after the DNS answer.
7. Warning: if `trace-stage6.js` exceeds 300 lines, split it into a sibling module. Use a sibling module ONLY if the 300-line cap demands it.

### Panel layer

8. Update `js/panel/layout-stage6.js`. Add the 9-ring registry and edge node.
9. Update `js/panel/stage6-registry.js`. Add the `#node-cdn` card with `#cdn-stats` and `#cdn-entries-list` (lazy lookups).
10. Update `js/panel/inspector-source-stage6.js` and `js/panel/inspector-state.js`. Add the cdn section.
11. Update `js/panel/teaching.js`. `STAGE_TEACHING[6]` gets the edge story per brief §4. Replace the "nothing is there yet" line.
12. Update `index.html`. The stage-6 card copy must complete the stage.

### Tests

13. Write `test/sim/cdn.test.js`. Titles must be verbatim per brief §5.
14. Update router re-seat tests in `test/sim/router.test.js`.
15. Add engine tests: edge wiring, HIT ends `Hop 6/6`, MISS ends `Hop 9/9`, POST pass-through leaves edge counters at initial values.
16. Update `test/panel/model-stage6.test.js` narrative pins.
17. Create `e2e/cdn-edge.spec.js`. Use the four pinned titles. Assert the real cards, `#journey-log`, and router `routed` counter. For the stale-at-edge pin, edit the origin file through the UI flow from `e2e/fs-editor.spec.js`'s edit helpers or replicate that flow inline.

### Manifests

18. Update `slices.yaml`. Add the new e2e spec explicitly. If SIM `js:` is glob-claimed, do not add an explicit `js/sim/cdn.js` entry (guard-slices double-claim rule).
19. Update `storymap.yaml`. SIM-6 and PANEL-6 rows must gain the new titles.

## Constraints

20. Stage-6a semantic shapes must stay byte-identical: hosted-home 9 hops, host-less 8, NX 2.
21. Pins that touch the 6a files must move only where the brief says (router re-seat, dns table). Where the re-seat changes `20.1` replica seatings, state the change in a comment but never weaken a pin.
22. Never weaken a guardrail. Existing test suites must pass except where the re-seat changes `20.1` replica seatings.
23. Respect file caps: 300 lines for `js/**` modules, 450 lines for test suites, 550 lines for HTML pages.

## Gate and close

24. Run `npm run verify`. The result must be green.
25. On a red gate, fix the named cause. On a second rejection of the same gate, stop and report.
26. Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
27. Commit everything as `feat(stage6b): cdn edge 20.1 with tick-TTL pull-through + router re-seat (stage6b Step 2)` on `feat/stage6b-cdn-edge`.
28. Do not push. Do not open a PR.

## Report back

29. Report: files added, files removed, `trace-stage6.js` final line count, any module split, test names added, exact verify result, commit hash, and anything in the brief that was ambiguous or under-pinned.
