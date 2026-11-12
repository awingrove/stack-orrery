# C09 — requirements extracted from arm A

Source: `brief.A.md` (dispatch text exactly as received). The committed brief
`docs/plans/2026-10-25-stage6b-cdn-edge.md` is an arm-independent instruction
file present in the start commit.

1. Treat the committed brief (`docs/plans/2026-10-25-stage6b-cdn-edge.md`) as the contract source of truth; implement cold from it.
2. Execute Step 2 of that brief on branch `feat/stage6b-cdn-edge` in the current working directory (stack-orrery).
3. Before coding, read `AGENTS.md` (static vanilla-ESM stack, strict CSP — no inline handlers/scripts/styles, determinism in `js/sim/**` — no `Math.random`/`Date.now`, strict `CHECKS:`/`PINS:`/`DOCUMENTS:` claim vocabulary, manifests same-change, UI must consume the components' actual messages — a listed hop must never narrate a delivery the model never makes).
4. Before coding, read `FACTORY.md` and `DESIGN.md`, noting the amended Stage 6 (9 rings) registry, the Router re-seat (`10.65 ⇄ 20.254`), and the new CDN Edge component contract in the Service Internals section.
5. Before coding, read the brief — especially its five negative-case contracts, then its hop-by-hop trace shapes (HIT = 6 hops, MISS = 9, POST = MISS minus fill).
6. Before coding, read the listed code you extend without breaking: `js/sim/dns.js`, `js/sim/router.js`, `js/sim/trace-stage6.js`, `js/sim/engine.js`, `test/sim/router.test.js`, `js/panel/layout-stage6.js`, `js/panel/stage6-registry.js`, `js/panel/inspector-source-stage6.js`, `js/panel/inspector-state.js`, `js/panel/render.js` (`renderDnsHud`), `js/panel/teaching.js` (`STAGE_TEACHING[6]`), `panel.html`, `index.html`, and `docs/plans/2026-10-24-stage6a-dns-crossnet.md` (for 6a wording context only).
7. In `js/sim/cdn.js`, deliver `createCdnEdge({ address = '20.1', ttlTicks = 10, originAddress = '10.1' })` with `lookup(path, currentTick)` / `fill(path, body, currentTick)` / `snapshot(currentTick)` exactly per brief §1 — validation fail-loud, alive-through-ticks eviction, HIT/MISS branch, POST never fills (the trace machine decides what calls fill).
8. In `js/sim/dns.js`: the authoritative table gains `cd.example.com -> 20.1`. No other change.
9. In `js/sim/router.js`: default `rightAddress = '20.254'` (comment: the edge owns 20.1 from Stage 6b); update its comment lines accordingly.
10. In `js/sim/engine.js`: stage-6 edge instantiation + registration on `rightNetwork` at `20.1` + `snapshot.cdn`; wire the edge into the trace machine (hoist the inline `createNetwork()` right-side instance to a variable `rightNetwork` so the edge can register at `20.1`).
11. In `js/sim/trace-stage6.js` (and a sibling module ONLY if the 300-line cap demands): implement the CDN chain per brief §3 hop specs — HIT 6 hops, MISS 9 hops, POST pass-through (origin pull without fill).
12. Hops 3/5/8 do real `router.forward` crossings (each increments `routed`).
13. On MISS, hop 6 does a real `lb.enqueue` and hop 7 a real `drainUntilYou(backend)` so the origin cache-aside participates (its `cacheStatus` rides the origin-serve frame).
14. CDN HIT serves whatever bytes the edge ledger holds — bytes that arrived via `fill` from an earlier real pull. Never fabricate body bytes.
15. In the stage-6 trace machine, key the CDN branch on the DNS answer's subnet (`subnetOf(answer.target) === subnetOf(edge.address)`) using the same fail-loud conventions; when the answer targets subnet 20, the GET rides the Router into `20.1`.
16. A listed hop must never show a wire arrow toward a hostname; the browser's GET exists only after the DNS answer.
17. Panels: `layout-stage6.js` gets the 9-ring registry + edge node; `stage6-registry.js` gets a `#node-cdn` card with `#cdn-stats` + `#cdn-entries-list` (lazy lookups); inspector source/state gain the cdn section.
18. `js/panel/teaching.js`: `STAGE_TEACHING[6]` gets the edge story per brief §4 (replace the "nothing is there yet" line).
19. `index.html`: the stage-6 card copy completes the stage.
20. Unit tests per brief §5 — titles verbatim: `test/sim/cdn.test.js`; router re-seat updates; engine additions (edge wiring, HIT ends `Hop 6/6`, MISS ends `Hop 9/9`, POST pass-through leaves edge counters at initial values); `test/panel/model-stage6.test.js` narrative pins.
21. E2e: NEW `e2e/cdn-edge.spec.js` with the four pinned titles (assert the real cards + `#journey-log` + router `routed` counter; for the stale-at-edge pin, edit the origin file through the UI flow from `e2e/fs-editor.spec.js`'s edit helpers or replicate that flow inline).
22. Manifests same-change: `slices.yaml` — add the new e2e spec explicitly; if SIM `js:` is glob-claimed, do NOT add an explicit `js/sim/cdn.js` entry (guard-slices double-claim rule).
23. `storymap.yaml` — SIM-6/PANEL-6 rows gain the new titles.
24. Stage-6a semantic shapes must stay byte-identical: hosted-home 9 hops / host-less 8 / NX 2.
25. Any pin touching the 6a files moves only where the brief says (router re-seat, dns table); where the re-seat changes `20.1` replica seatings, state the change in a comment but never weaken a pin.
26. Never weaken a guardrail; existing test suites keep passing except where the re-seat changes `20.1` replica seatings.
27. Respect the file caps (300 lines for `js/**`; split `trace-stage6.js` only if the cap demands).
28. Run `npm run verify` to green.
29. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
30. Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
31. Commit everything as `feat(stage6b): cdn edge 20.1 with tick-TTL pull-through + router re-seat (stage6b Step 2)` on `feat/stage6b-cdn-edge`.
32. Do not push; do not open a PR.
33. Report back: files added/removed, `trace-stage6.js` final line count (and any module split), test names added, exact verify result, commit hash, and anything in the brief that was ambiguous or under-pinned.
