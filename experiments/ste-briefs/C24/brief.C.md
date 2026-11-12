# Brief: r2c pool-truth rename (Step 2)

You are the factory executor sub-agent for stack-orrery, working in
`/home/awingrove/repos/stack-orrery/stack-orrery` on branch `feat/r2c-pool-truth`
(checked out). Commit and push HERE; the slice PR #38 targets it.

Execute Step 2 of the committed brief `docs/plans/2026-11-02-r2c-pool-truth.md`.
Its ticks show Step 1 unticked, so your first action is to tick `- [x] Step 1`,
then proceed at Step 2 as the first unticked step.

## Read order

`AGENTS.md`, `FACTORY.md`, `DESIGN.md`, then the brief. The brief's walk-scope
ledger is authoritative — it names every consumer of the two schema keys: only
four code sites plus two schema pins read them, so the rename touches exactly
those sites. fs-editor reads per-server shapes and must NOT be touched; e2e
reads rendered DOM only.

## Contracts

1. `js/sim/engine.js` (~281-282): rename
   `queue: serverSnapshots[0].queue, files: serverSnapshots[0].files` →
   `primaryQueue: serverSnapshots[0].queue, primaryFiles: serverSnapshots[0].files`.
   This is ±0 net lines; the engine sits at its 298 cap and must end ≤300.
2. Add the CHECKS comment naming the modeling rule and the finding lineage:
   "top-level shape = the pool's primary backend; per-server shapes live on
   snapshot.servers[i]; a merged aggregate is rejected — fs-editor already
   routes per-server".
3. `js/panel/inspector-state.js:173/177`: `snapshot.queue` →
   `snapshot.primaryQueue`; `snapshot.files` → `snapshot.primaryFiles`. The
   webserver shape gains the per-address provenance key
   `serverAddress: snapshot.servers?.[0]?.address ?? '10.1'` (stage-1 reads
   '10.1', stage-2+ reads '10.11').
4. `js/panel/render.js:211`: `snapshot.queue` → `snapshot.primaryQueue`.
   queueList2 is already per-server via `snapshot.servers?.[1]?.queue` —
   untouched.
5. Re-point tests IN PLACE, titles unchanged so manifest refs keep resolving:
   `test/sim/engine.test.js:136` `snap.queue` → `snap.primaryQueue`; `:244`
   `before.files` → `before.primaryFiles`. The stage-2 per-server
   counter-example pin (engine.test.js:257-263) stays byte-identical.
6. NEW `test/sim/pool-truth.test.js` (~25 LOC), titled verbatim per the brief
   §Test 4: `the primary shape names itself — 'primaryQueue' / 'primaryFiles' -
the pool's primary-backend story, not an aggregate`. Its content: with a
   stage-2 createEngine, `setWebFile('10.12', '/about', 'New body')` —
   `snap.primaryFiles['/about']` stays 'This is the about page' (the primary
   view unchanged), `snap.servers[1].files['/about']` becomes 'New body', and
   `snap.servers[0].files['/about']` is unchanged. Then a stage-1 engine:
   `setWebFile('10.1', ...)` lands and `snap.primaryFiles` carries that story.
   This test is itself the finding-1-06 acceptance pin: a 10.12-side edit lands
   ONLY in servers[1].files — the counter-example named in the brief.
7. Manifest same-change: in `storymap.yaml`, ONE story under the SIM slice
   titled verbatim per the new test's title, with refs to the
   pool-truth.test.js title plus the two re-pointed engine.test.js pins'
   existing titles (titles unchanged, so refs keep resolving). In
   `slices.yaml`, add the same ref to the SIM slice's tests list.

## Rails

All edits above are in place; keep the rails below while making them.

- `engine.js` ends ≤300 (298 today, ±0 net — the rename must not add lines).
- `engine.test.js` ≤450 HARD (434 today — no append; only the two in-place
  re-points, nothing else added to the file).
- Prettier `--write` on every touched file BEFORE commit.
- Zero behavior change on the healthy paths: all existing frame pins stay
  byte-identical.
- Claim vocabulary on new comments: `CHECKS:` for guarantee language; no bare
  guarantee words untagged.
- Zero runtime dependencies; determinism untouched.

## Run and report

Run `npm run verify` directly (no pipes) to green. Log reds per named cause;
fix the named cause, and on a second rejection of the same gate stop and
report rather than retrying. Then tick Step 2 and commit.

Report: commits, files changed with net deltas, red-gate runs, and one-line
decisions per brief gap.
