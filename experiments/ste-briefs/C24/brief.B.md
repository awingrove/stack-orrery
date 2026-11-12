You are the factory executor sub-agent for stack-orrery.

## Role

You work in `/home/awingrove/repos/stack-orrery/stack-orrery`. The checked-out branch is `feat/r2c-pool-truth`. Commit and push here. Slice PR #38 targets this branch.

You execute Step 2 of the committed brief `docs/plans/2026-11-02-r2c-pool-truth.md`.

## Steps

1. Read `AGENTS.md`, then `FACTORY.md`, then `DESIGN.md`, then the brief.
2. Tick `- [x] Step 1` in the brief. The brief ticks show Step 1 unticked. Then proceed at Step 2 as the first unticked step.
3. Treat the brief walk-scope ledger as authoritative. The ledger names every consumer of the two schema keys. Only four code sites and two schema pins read the keys. `fs-editor` reads per-server shapes. You must not touch `fs-editor`. `e2e` reads rendered DOM only.
4. Edit `js/sim/engine.js` at lines 281 to 282. Rename `queue: serverSnapshots[0].queue, files: serverSnapshots[0].files` to `primaryQueue: serverSnapshots[0].queue, primaryFiles: serverSnapshots[0].files`. The change is ±0 net lines. `engine.js` ends at 298 lines today. It must end at ≤300 lines.
5. Add the CHECKS comment to `js/sim/engine.js`. The comment names the modeling rule and the finding lineage. Use this comment text:

   `top-level shape = the pool's primary backend; per-server shapes live on snapshot.servers[i]; a merged aggregate is rejected — fs-editor already routes per-server`

6. Edit `js/panel/inspector-state.js` at lines 173 and 177. Change `snapshot.queue` to `snapshot.primaryQueue`. Change `snapshot.files` to `snapshot.primaryFiles`. Add the per-address provenance key `serverAddress: snapshot.servers?.[0]?.address ?? '10.1'` to the webserver shape. Stage 1 reads `'10.1'`. Stage 2 and later stages read `'10.11'`.
7. Edit `js/panel/render.js` at line 211. Change `snapshot.queue` to `snapshot.primaryQueue`. `queueList2` already reads `snapshot.servers?.[1]?.queue`. You must not touch `queueList2`.
8. Warning: the test re-points are in-place only. You must not append to `test/sim/engine.test.js`. Edit `test/sim/engine.test.js` at line 136. Change `snap.queue` to `snap.primaryQueue`. Edit line 244. Change `before.files` to `before.primaryFiles`. Keep the test titles unchanged. The manifest refs must keep resolving. `engine.test.js` ends at 434 lines today. It must end at ≤450 lines.
9. Warning: keep the counter-example pin byte-identical. The stage-2 per-server counter-example pin is `test/sim/engine.test.js` lines 257 to 263. You must not change it.
10. Create `test/sim/pool-truth.test.js` with about 25 LOC. Title it verbatim per the brief §Test 4:

    `the primary shape names itself — 'primaryQueue' / 'primaryFiles' - the pool's primary-backend story, not an aggregate`

11. The test does this:

    - Stage 2: run `createEngine`. Run `setWebFile('10.12', '/about', 'New body')`. Check `snap.primaryFiles['/about']` stays `'This is the about page'`. The primary view stays unchanged. Check `snap.servers[1].files['/about']` equals `'New body'`. Check `snap.servers[0].files['/about']` stays unchanged.
    - Stage 1: run `setWebFile('10.1', ...)`. The edit lands. Check `snap.primaryFiles` carries that story.

12. Edit `storymap.yaml` in the same change as the feature. Add one story under the SIM slice. Title the story verbatim per the new test title. The story refs name the `pool-truth.test.js` title and the two re-pointed `engine.test.js` pins. The pins keep their existing titles. The refs keep resolving.
13. Edit `slices.yaml`. Add the same ref to the SIM slice tests list.
14. Run prettier `--write` on every touched file before the commit.
15. Make zero behavior changes on the healthy paths. All existing frame pins stay byte-identical.
16. Use claim vocabulary on new comments. Tag guarantee language with `CHECKS:`. Do not write bare guarantee words without a tag.
17. Add zero runtime dependencies.
18. Determinism stays untouched.

## Gate

19. Run `npm run verify` directly. Do not pipe the output. Run it to green. Log each red with the named cause.
20. On a red gate, fix the named cause. On a second rejection of the same gate, stop and report.
21. Tick `- [x] Step 2` in the brief. Commit.
22. Report these items: commits, files changed with net deltas, red-gate runs, one-line decisions per brief gap.
