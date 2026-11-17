# C24 — requirements extracted from arm A

Source: `brief.A.md` (dispatch text exactly as received). The committed brief
`docs/plans/2026-11-02-r2c-pool-truth.md` is an arm-independent instruction
file present in the start commit.

1. Work in `/home/awingrove/repos/stack-orrery/stack-orrery` on branch `feat/r2c-pool-truth` (checked out) — commit and push HERE; slice PR #38 targets it.
2. Execute Step 2 of the committed brief `docs/plans/2026-11-02-r2c-pool-truth.md`.
3. First action: tick `- [x] Step 1` in the brief (its ticks show Step 1 unticked), then proceed at Step 2 as the first unticked step.
4. Read `AGENTS.md`, `FACTORY.md`, `DESIGN.md`, then the brief, in that order.
5. Treat the brief's walk-scope ledger as authoritative — it names every consumer of the two schema keys (only four code sites + two schema pins read them; fs-editor reads per-server shapes and must NOT be touched; e2e reads rendered DOM only).
6. In `js/sim/engine.js` (~lines 281-282): rename `queue: serverSnapshots[0].queue, files: serverSnapshots[0].files` → `primaryQueue: serverSnapshots[0].queue, primaryFiles: serverSnapshots[0].files` (±0 net lines; engine ends ≤300 at its 298 cap).
7. Add the CHECKS comment naming the modeling rule + the finding lineage ("top-level shape = the pool's primary backend; per-server shapes live on snapshot.servers[i]; a merged aggregate is rejected — fs-editor already routes per-server").
8. In `js/panel/inspector-state.js` lines 173/177: `snapshot.queue` → `snapshot.primaryQueue`; `snapshot.files` → `snapshot.primaryFiles`; the webserver shape gains the per-address provenance key `serverAddress: snapshot.servers?.[0]?.address ?? '10.1'` (stage-1 reads '10.1', stage-2+ reads '10.11').
9. In `js/panel/render.js` line 211: `snapshot.queue` → `snapshot.primaryQueue` (queueList2 is already per-server via `snapshot.servers?.[1]?.queue` — untouched).
10. Re-point tests IN PLACE, titles unchanged so manifest refs keep resolving: `test/sim/engine.test.js` line 136 `snap.queue` → `snap.primaryQueue`; line 244 `before.files` → `before.primaryFiles`.
11. The stage-2 per-server counter-example pin (`engine.test.js` lines 257-263) stays byte-identical.
12. Deliver NEW `test/sim/pool-truth.test.js` (~25 LOC) titled verbatim per the brief §Test 4: `the primary shape names itself — 'primaryQueue' / 'primaryFiles' - the pool's primary-backend story, not an aggregate`.
13. That test: stage-2 createEngine, `setWebFile('10.12', '/about', 'New body')` — `snap.primaryFiles['/about']` stays 'This is the about page' (primary view unchanged), `snap.servers[1].files['/about']` = 'New body', `snap.servers[0].files['/about']` unchanged; then a stage-1 engine: `setWebFile('10.1', …)` lands and `snap.primaryFiles` carries that story.
14. Manifest same-change: `storymap.yaml` — ONE story under the SIM slice titled verbatim per the new test's title, with refs to the `pool-truth.test.js` title + the two re-pointed `engine.test.js` pins' existing titles (unchanged titles, refs keep resolving).
15. `slices.yaml` — the same ref added to the SIM slice's tests list.
16. Rails: `engine.js` ends ≤300 (298 today, ±0 net).
17. `engine.test.js` ≤450 HARD (434 today — no append, only the two in-place re-points).
18. Run prettier `--write` on every touched file BEFORE commit.
19. Zero behavior change on the healthy paths — all existing frame pins stay byte-identical.
20. Claim vocabulary on new comments (CHECKS: for guarantee language; no bare guarantee words untagged).
21. Zero runtime dependencies.
22. Determinism untouched.
23. Run `npm run verify` directly (no pipes) to green; reds logged per named cause.
24. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
25. Tick Step 2 and commit.
26. Report: commits, files changed with net deltas, red-gate runs, one-line decisions per brief gap.
