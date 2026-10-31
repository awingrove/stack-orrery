# Chunk 9 — Factory process — Context Brief (facts only)

## Corpus inventory

23 briefs exist under `docs/plans/` (corpus description said 30 — actual count is 23), dated 2026-10-12 → 2026-10-31. Every brief has ALL numbered execution steps ticked `- [x]` (phase1-bootstrap ticks its 8 steps; orrery-plane-camera ticks 8; all others tick Steps 1–3).

| Brief (date-name)                  | Stage / family covered                                    | Lines | Ticks       |
| ---------------------------------- | --------------------------------------------------------- | ----- | ----------- |
| 10-12 phase1-bootstrap             | factory bootstrap (AGENTS/FACTORY/tooling, no sim stage)  | 71    | 1–8 all [x] |
| 10-15 stage1-executable-model      | Stage 1 sim (Browser/Network/WebServer) + panel inspector | 130   | 1–3 all [x] |
| 10-16 stage1-interactive-orrery-ui | Stage 1 UI/SHELL/PANEL (trace, inspector)                 | 198   | 1–3 all [x] |
| 10-17 stage2-load-balancer         | Stage 2 LB (10.11/10.12)                                  | 120   | 1–3 all [x] |
| 10-18 orrery-plane-camera          | cross-stage PANEL (camera, rings, browser nodes)          | 172   | 1–8 all [x] |
| 10-20 stage3-cache                 | Stage 3 Cache-Aside/TTL (10.20)                           | 193   | 1–3 all [x] |
| 10-20 stage4-database              | Stage 4 DB primary/replica (10.30/10.31)                  | 137   | 1–3 all [x] |
| 10-21 stage5-worker-queue          | Stage 5 Worker Queue (10.40/10.41)                        | 57    | 1–3 all [x] |
| 10-24 editable-fs                  | PANEL WebServer inline fs editing                         | 104   | 1–3 all [x] |
| 10-24 stage6a-dns-crossnet         | Stage 6a DNS TTL ledger + Router cross-subnet             | 99    | 1–3 all [x] |
| 10-24 stage-teaching-drawer        | PANEL teach drawer                                        | 67    | 1–3 all [x] |
| 10-24 teaching-correctness         | PANEL amendment set (headline/journey/legend)             | 79    | 1–3 all [x] |
| 10-24 usability-state              | PANEL throughput/auto-refit/deep-links                    | 68    | 1–3 all [x] |
| 10-25 b5-compare-tray              | PANEL compare tray (run diff)                             | 52    | 1–3 all [x] |
| 10-25 stage6b-cdn-edge             | Stage 6b CDN edge (20.1)                                  | 61    | 1–3 all [x] |
| 10-26 b2-missions                  | PANEL missions (auto-verified detectors)                  | 44    | 1–3 all [x] |
| 10-26 style2-control-room-remodel  | cross-stage SHELL/PANEL remodel (right rail)              | 67    | 1–3 all [x] |
| 10-27 b6-fault-console             | fault-console slice 1 (WebServer down, stage 1)           | 96    | 1–3 all [x] |
| 10-28 b6b-backend-failover         | fault-console slice 2 (LB failover, stage 2)              | 111   | 1–3 all [x] |
| 10-29 b6c-cache-bypass             | fault-console slice 3 (cache bypassed, stage 3)           | 110   | 1–3 all [x] |
| 10-30 b6d-primary-down             | fault-console slice 4 (primary down, stage 4)             | 120   | 1–3 all [x] |
| 10-31 b6e-worker-crash             | fault-console slice 5 (worker crash, stage 5)             | 116   | 1–3 all [x] |
| 10-31 b6f-dns-ledger-drop          | fault-console slice 6 (DNS dropped, stage 6)              | 120   | 1–3 all [x] |

## Manifest facts

- `slices.yaml` (285 lines): 3 slices — `SHELL`, `SIM`, `PANEL`; every slice declares roles `pages/js/css/unit_tests/e2e_specs` (globs like `js/sim/**`, `test/sim/**`, named specs) plus `calls/owns`, `tests:` (file::title refs), `entry_point`.
- `storymap.yaml` (479 lines): 13 activity ids (`SHELL-1`; `SIM-1`…`SIM-6`; `PANEL-1`…`PANEL-6`), 47 stories, 47 `status: done` (zero other statuses); 47 `tests:` blocks using `unit: test/…::title` / `e2e: <spec-stem>::title`; ref-fragment count 204.
- Test refs name test titles verbatim (e.g. `test/sim/engine.test.js::same seed replays the identical tick sequence`). All 26 distinct files referenced by both manifests exist under `test/` and `e2e/` — zero path mismatches. `scripts/guard-story-refs.mjs` additionally enforces verbatim fragment presence in the file.
- Last-commit cross-check: `slices.yaml` and `storymap.yaml` last touched `28cfeed` 2026-10-31 ("feat(b6f)… b6f Step 2") — the newest feature; manifests updated in the same change as the feature (sampled `28cfeed` and `36c3dd2`/b6e both carry slices.yaml+storymap.yaml in the same commit). Manifests are not stale vs the corpus.

## Ledger facts

- `docs/factory/technical-debt.yaml` (163 lines): grammar header (kit DEBT-REGISTER), `open: []`, `closed: []`, and 5 entries under `defects:` — DL-1..DL-5, all closed via `closed_in:` commit-backed notes: DL-1 ring-gap slider missed compact browser nodes (found 10-19); DL-2 lead executed Stage 4 Step 2 inline instead of dispatching executor; DL-3 Stage 5 shipped without brief-mandated e2e/hop-label tests; DL-4 Stage 5 trace hardcoded async narrative for GET (401 bytes DL); DL-5 camera drawers intercepted wheel/drag (found 10-26, closed_in slide fix `2acf19d`).
- Last commit touching the register: `2acf19d` 2026-10-26 — the register has not moved for the five b6-family slices (b6f's lead note records follow-up candidates in the brief itself, not the register).
- `docs/factory/slice-metrics.yaml` (902 lines): 23 entries (one per brief), fields per kit METRICS: id/slice/name/brief/agent/lead_model/agent_model/session_id/tokens_*/cost_usd/human_interventions/agent_review_rounds/guardrail_failures/fix_commits/defects_escaped/notes; `guard-metrics.mjs` cited as validator.
- `guardrail_failures` sum 83; largest: STAGE6B-CDN 15, ORRERY-CAMERA 11, STAGE6A 8, B6B 6. `human_interventions` sum 10 (STAGE-5 4; six slices 1 each). `defects_escaped` sum 3 (ORRERY-CAMERA 1, STAGE-5 2). Session telemetry present in 19/23; PHASE1-BOOTSTRAP, STAGE1-MODEL, STAGE1-UI, STAGE2-LB carry no session_id/token/cost data. `cost_usd` nonzero only on ORRERY-CAMERA 0.6166, STAGE-3 0.3001, STAGE-4 0.4337. Executor models vary: 4 early gemini-4-argon entries, flash_lite (STAGE-5), free glm-5.3-flash-free, mimo-v2.6-flash-free/flash, glm-5.3-flash.

## Brief-discipline facts

- Line counts: 5 briefs exceed 120 lines — stage1-model 130, stage4-database 137, orrery-plane-camera 172, stage3-cache 193, stage1-ui 198. All five are on the explicit `LEGACY_LONG_BRIEFS` exemption list in `scripts/guard-plan-ticks.mjs` (authored before the 120-line rule); every post-stage4 brief is ≤120 (three sit at exactly 120).
- Ghost-coding: only `2026-10-26-style2-control-room-remodel.md` contains code fences (1 block, lines 7–17), an ASCII layout mockup of zones/rail — no line-by-line implementation pseudocode found in any brief. All other 22 briefs have 0 fences; contracts are prose boundary shapes (module exports, snapshot fields, testids, verbatim e2e titles, named counter-examples).

## Claim vocabulary facts

- `CHECKS:` appears in 15 of 23 briefs (counts: stage2/stage3/stage4 ×4, camera ×3, stage1-model ×3, 6a/5 ×2, b5/6b/b2/drawer/correctness/usability/editable-fs/stage1-ui ×1) plus AGENTS.md rule line ×1.
- `PINS:` appears in the same 15 briefs (1–2 each) + AGENTS.md ×1.
- `DOCUMENTS:`: zero claim-tag usages anywhere; every occurrence is inside the vocabulary-definition sentences of the briefs themselves.
- The 8 briefs with no CHECKS:/PINS: tags: phase1-bootstrap (rule line only), style2-remodel, and all six b6-family slices (fault-console, b6b, b6c, b6d, b6e, b6f). `scripts/guard-claims.mjs` enforces the vocabulary on source comments (js/css/test/e2e), not on briefs.

## Negative-case contract facts

- Stage-family samples: `stage6a-dns-crossnet` carries explicit "Named counter-example" pins — "`GET /about` on stage 6 keeps the stage-5 hop count…" — pinned in §Tests to `test/sim/dns.test.js` TTL-branch test and e2e title "`should keep GET /about on Stage 6 at the Stage 5 hop story`" (counter-example pin). `stage6b-cdn-edge` carries 7 negative-language hits; `b6f` names four DL counter-examples (NX-run byte-identity, host-less URLs, `cd.example.com` immunity, restored-record residue) and §Tests states "the four DL counter-examples pinned" plus a self-correcting lead note (normalized-equality landing, ACCEPTED).
- Panel-family samples: `b5-compare-tray` has a "Branch contracts (DL-3/DL-4) — with named counter-examples" section (tick-run purity, snapshot-at-completion), with both counter-examples assigned to named unit pins; `stage-teaching-drawer` names "on stage 1 the drawer must NOT show stage 2's cache…" pinned as "stage 1 content never mentions cache TTL names (negative-case pin)"; `b2-missions` opens with the same "Branch contracts (DL-3/DL-4) — with named counter-examples" header; `b6-fault-console`/`b6c`/`b6d` carry 11/8/10 negative-language hits each.
- Early stage-family briefs predate the DL-3/DL-4 wording: `stage3-cache`, `stage5-worker-queue` contain no "counter-example" or "Branch contracts" section (1 negative-word hit each); `phase1-bootstrap` carries no named counter-examples. The explicit-header pattern begins with the 2026-10-24 → 10-26 posts.

## Cross-cutting drift facts

- No story/manifest/DL/metrics double-booking found in this pass: 23 metrics entries ↔ 23 briefs 1:1 (each field `brief:` points to its own brief); all 47 storymap stories are `done` and each carries a `tests:` block; manifest ref files all exist on disk; sampled feature commits carry manifests in the same change.
- Counter-example drift recorded as date-pattern drift (facts): DL-3/DL-4 as register entries exist precisely to answer the early-era gap — DL-3's entry text records that Stage 5's brief-mandated Stage 5 e2e/hop-label tests were never written while Step 2 still closed green, and DL-4 records the hardcoded async-narrative trace for GET requests (a queued-job story rendered while the queue saw nothing); the negative-case contract rule was then applied in the 2026-10-24+ briefs (6a §Tests includes its named counter-examples as pinned tests).
- `open: []`, `closed: []` are empty and no `TD-\d+` entries exist — all 5 defects are `DL-*`, every entry closed via `closed_in:`; closedness lives on the entries themselves.
- No gate-leave issues surfaced in sampled artifacts: `npm run verify` named gate appears in AGENTS.md and in each post-10-24 brief's Step 2/3; b6b/b6c/b6d/b6e/b6f Step 3 lines all record "strict acceptance probe over every boundary contract"; b6f and b6e note "probe green FIRST PASS" (b6c/b6d step-3 probes recorded as over every boundary contract including counter-examples).
