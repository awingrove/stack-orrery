You are a subagent spawned by another session.
You are the factory executor sub-agent for stack-orrery, working dir /home/awingrove/repos/stack-orrery/stack-orrery on branch feat/r2c-pool-truth (checked out — commit and push HERE; slice PR #38 targets it).

Execute Step 2 of the committed brief docs/plans/2026-11-02-r2c-pool-truth.md. The brief's ticks show Step 1 unticked — first action: tick `- [x] Step 1`, then proceed at Step 2 as the first unticked step.

Read order: AGENTS.md, FACTORY.md, DESIGN.md, then the brief. The brief's walk-scope ledger is authoritative — it names every consumer of the two schema keys (only four code sites + two schema pins read them; fs-editor reads per-server shapes and must NOT be touched; e2e reads rendered DOM only).

Contracts:

1. `js/sim/engine.js` (~281-282): rename `queue: serverSnapshots[0].queue, files: serverSnapshots[0].files` → `primaryQueue: serverSnapshots[0].queue, primaryFiles: serverSnapshots[0].files` (±0 net lines; engine ends ≤300 at its 298 cap). Add the CHECKS comment naming the modeling rule + the finding lineage ("top-level shape = the pool's primary backend; per-server shapes live on snapshot.servers[i]; a merged aggregate is rejected — fs-editor already routes per-server").
2. `js/panel/inspector-state.js:173/177`: `snapshot.queue` → `snapshot.primaryQueue`; `snapshot.files` → `snapshot.primaryFiles`; the webserver shape gains the per-address provenance key `serverAddress: snapshot.servers?.[0]?.address ?? '10.1'` (stage-1 reads '10.1', stage-2+ reads '10.11').
3. `js/panel/render.js:211`: `snapshot.queue` → `snapshot.primaryQueue` (queueList2 is already per-server via `snapshot.servers?.[1]?.queue` — untouched).
4. Tests re-pointed IN PLACE (titles unchanged, manifest refs keep resolving): `test/sim/engine.test.js:136` `snap.queue` → `snap.primaryQueue`; `:244` `before.files` → `before.primaryFiles`. The stage-2 per-server counter-example pin (engine.test.js:257-263) stays byte-identical.
5. NEW `test/sim/pool-truth.test.js` (~25 LOC) titled verbatim per the brief §Test 4: `the primary shape names itself — 'primaryQueue' / 'primaryFiles' - the pool's primary-backend story, not an aggregate` — stage-2 createEngine, setWebFile('10.12', '/about', 'New body'): snap.primaryFiles['/about'] stays 'This is the about page' (the primary view unchanged), snap.servers[1].files['/about'] = 'New body', snap.servers[0].files['/about'] unchanged; then a stage-1 engine: setWebFile('10.1', ...) lands and snap.primaryFiles carries that story.
6. Manifest same-change: storymap.yaml — ONE story under the SIM slice titled verbatim per the new test's title, with refs to the pool-truth.test.js title + the two re-pointed engine.test.js pins' existing titles (unchanged titles, refs keep resolving); slices.yaml: same ref added to the SIM slice's tests list.

Rails: engine.js ends ≤300 (298 today, ±0 net); engine.test.js ≤450 HARD (434 today — no append, only the two in-place re-points); every touched file prettier --write BEFORE commit; zero behavior change on the healthy paths (all existing frame pins byte-identical); claim vocabulary on new comments (CHECKS: for guarantee language; no bare guarantee words untagged); zero runtime deps; determinism untouched.

Probe round per guard where relevant: the new pool-truth.test.js is itself the finding-1-06 acceptance pin (a 10.12-side edit lands ONLY in servers[1].files — the counter-example named in the brief).

Run `npm run verify` directly (no pipes) to green; reds logged per named cause. Then tick Step 2 + commit. Report: commits, files changed with net deltas, red-gate runs, one-line decisions per brief gap.
