# R2c — pool truth: the primary-back end shape names itself (primaryQueue / primaryFiles)

Paydown for full-review finding 1-06 (recommendations.md Stage R2c). The
snapshot schema's `queue` and `files` are — per engine.js:281-282 — silently
`serverSnapshots[0]`'s own shape: in stage 2+ the learner's panel-narrated
"queue" and "filesystem" are backend 10.11's story without the schema saying
so, while the honest per-server shapes already live one level down
(`snapshot.servers[i].queue` / `.files`, both rendered — render.js:212's
second queue list and fs-editor's per-server tables). The finding's option
(b) — rename the top-level keys to `primaryQueue` / `primaryFiles` so the
nnarrative names the pool's primary backend itself, and leave the
per-server shapes where they are — is the walk-validated contract here.
The stronger option (pool-aggregate views) is rejected: a merged file map
mixes two fs maps the fs-editor is already routing per-server, so there is
nothing those merges would teach.

## Walk-scope ledger (per the R2a lesson, pre-contracted)

- Consumers reading the primary shape by name: inspector-state.js:173/177
  (queuedRequests + the webserver进步 files visibility), render.js:211
  (queueList), and the schema pins engine.test.js:136 (`snap.queue`) and
  :244 (`before.files` stage-1 setWebFile) — those four are the complete
  rename surface.
- fs-editor.js does NOT read the top-level shape (it walks
  `snapshot.servers[i].files` per container and `data-server-address`
  addresses every edit at `engine.setWebFile` — fs-editor.js:113/171):
  untouched.
- Already-honest per-server pins: engine.test.js:257-263 routes the
  10.12-setWebFile edit into `snapshot.servers[1].files` while
  `snapshot.files` stays 10.11's — stage 2's exact acceptance pin already
  exists; this slice renames the name the finding flagged and adds the
  stage-1-visible naming pin.
- model.js:206's `queueDepth` fallback and model-stage5-chain.js:56's lag
  have nothing to rename (queueDepth is pool-wide aggregated).
- e2e reads rendered DOM only (webserver-fs.spec.js's fs rows); no e2e
  pins on the schema names.

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps.
- File sizes: engine.test.js is 434/450 — NO append; the new inspection
  pin lives in a NEW test/sim/pool-truth.test.js (~25 LOC). engine.js is
  298: the rename is a two-tree shift (± 1 line net at the cap, both
  ends ≤ 300).

## Boundary contracts (Step 2)

### 1. engine.snapshot() — the top-level shape names itself

- Rename: `queue: serverSnapshots[0].queue, files: serverSnapshots[0].files`
  → `primaryQueue: serverSnapshots[0].queue, primaryFiles:
serverSnapshots[0].files` (same one-line-pair engine.js records; ±0 net
  lines, both ends ≤ 300).
- CHECKS: names the modeling rule ("the top-level shape is the pool's
  primary backend — 10.11 in every stage; per-server shapes live on
  snapshot.servers[i] — a rename is the finding 1-06 contract; a merged
  aggregate is rejected (fs-editor already routes per-server)") + the
  accepted finding lineage.

### 2. The three schema consumers re-point

- inspector-state.js:173 `snapshot.queue` → `snapshot.primaryQueue`;
  :177 `snapshot.files` → `snapshot.primaryFiles` AND the webserver
  shape gains the per-address provenance
  (`serverAddress: snapshot.servers?.[0]?.address ?? '10.1'` — the
  learner reads whose queue/files these are without guessing; stage-1
  reads '10.1', stage-2+ reads '10.11').
- render.js:211 `snapshot.queue` → `snapshot.primaryQueue` (queueList2's
  servers[1].queue is already per-server).
- No other consumer: model.js:206, model-stage5-chain.js:56, fs-editor,
  journey-log all untouched per the walk ledger.

### 3. Tests re-point (titles unchanged, refs resolve)

- engine.test.js:136 `snap.queue` → `snap.primaryQueue`; :244
  `before.files` → `before.primaryFiles`. (No new titles — the same
  two pins re-pointed; manifest refs keep resolving.)
- Existing stage-2 per-server pin (engine.test.js:257-263) stays
  byte-identical — it is this finding's named counter-example, already
  honest.

### 4. NEW test/sim/pool-truth.test.js (~25 LOC)

- Verbatim title: `the primary shape names itself — 'queue'-'files'

  (10.11's story at stage 2) and a 10.12-side fs edit lands ONLY in
  servers[1].files (finding 1-06's counter-example pinned)`.

- Stage-2 createEngine, setWebFile('10.12', '/about', 'New body'):
  `snap.primaryFiles['/about']` stays 'This is the about page' (the
  primary/backend-10.11 view unchanged), `snap.servers[1].files['/about']`
  = 'New body', `snap.servers[0].files['/about']` unchanged; then the
  stage-1 engine: `setWebFile('10.1', ...)` lands and
  `snap.primaryFiles` is that story (one backend, one shape, no falsy
  empty-state claim).

## §Tests | Manifests same-change

- `§Tests` above; the manifest touch is a ONE story under the SIM slice
  titled verbatim per the new test's title plus the ref to the two
  re-pointed engine.test pins' `it` blocks (titles unchanged).
- slices.yaml: same ref added to the SIM slice's tests list.

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-02; the
      walk-scope ledger done first per the R2a lesson).
- [x] Step 2 (Executor sub-agent): cold implementation; `npm run verify`
      green; tick and commit.
- [x] Step 3 (Lead session): `npm run metrics:extract -- ses_e623592d1ffeDBOMNgKVQ8Yb1r`, entry `R2C-POOL-TRUTH` appended, ticked, committed. Original contract: `npm run metrics:extract -- <sessionID>`,
      append entry `R2C-POOL-TRUTH`, tick, commit.
