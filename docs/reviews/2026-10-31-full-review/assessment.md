# Full Project Review — Overall Assessment

- **Date:** 2026-10-31
- **Method:** 4-phase pipeline — chunk map (`map.md`) → 9 fact briefs by
  researcher sub-agents → 9 review reports by Qwen3.7 Plus (one per chunk,
  verify-against-source mandated) → this aggregation with de-duplication and
  impact ranking. 8 items escalated to Gemini 4 Argon (4-04, 1-01, 3-05,
  6-07, 9-02, 9-05, 9-08 + chunk-2's none); every verdict is consolidated
  into its chunk report.
- **Inputs:** `reports/chunk-{1..9}-*.md` (3,282 lines including the
  adjudications). Raw counts across all reports: **0 Critical, 6 High,
  24 Medium, 32 Low, 57 Praise.** After de-duplication: **0 Critical,
  5 High clusters, 12 Medium clusters, ~15 residual Low items.**

## Executive verdict

**No Critical defects. The core of this codebase is sound.** The three
layers the project's correctness rests on held independently:

1. **The sim runs a real machine, not a story.** Chunk 1 and chunk 2 both
   verified — separately, from different angles — that every component hot
   path is an actual data structure (Map lookups, tick math, FIFO cursors,
   version comparisons) with zero probability fakes, zero wall-clock reads,
   and one seeded RNG consumer. The refusal funnel is a literal single
   choke point (`network.js refusalOf`) and the trace frames are minted
   from real component records.
2. **The tests are a spec, not a demo.** Whole-frame/whole-record
   `toEqual` is the dominant assertion style; every one of the six B-6
   fault suites pins fail-loud validation, the fault branch, restore, and
   a byte-identical same-seed replay; DL-3 named counter-examples are
   substantive (normative absence of invented tokens), not smoke.
3. **The process is self-correcting and its ledgers are honest.** All 23
   briefs' boundary contracts verified against shipped code (20 clean,
   3 documented evolutions, 0 silent drops); all 47 storymap story refs
   resolve byte-identically; all 5 DL debt entries closed with in-code
   paydown; the register's silence during the b6 ladder audited candidate
   by candidate and ruled honest.

The risk is concentrated at **the panel's teaching-narrative boundary** —
where hand-maintained mirrors, prose tables, and duplicated knowledge sit
adjacent to (but are not mechanically derived from) the executable sim —
plus a classic "files at their size gates" maintenance-pressure cluster.

## Merged finding register (ranked by impact)

Each entry merges the chunks' per-finding IDs; all live in the chunk
reports with quoted evidence.

### Rank 1 — HIGH — Stage-6 trace machine dropped the LB refusal branch (1-01, 1-02, 1-08)

`trace-stage6.js` `chainStep` re-implements the LB hop without
`trace.js`'s `refused` handling and skip narration. With both stage-6
backends down, `trace.targetServer` becomes the refusal record object and
the UI renders `LB 10.1 -> [object Object] (GET /about) queued`, then walks
on with a phantom served record instead of the refusal card stages 1–5
show. Gemini 4 Argon calibration: **stays High (not Critical)** because the
trigger is API-only today — the fault console exposes one fault per stage
and no UI can down both stage-6 backends — but it becomes Critical
engineering the moment any multi-fault or cross-stage toggle ships.
Subsumes: 1-02 (the stage-1-5 `freshTrace` shape has `refused`, stage-6's
doesn't) and 1-08 (the third LB-frame copy is the only one without skip
support). **Fix:** shared `lbEnqueueHop()` in `trace-helpers.js` + a
stage-6 all-down engine test pinning the stage-2..5 refusal frame.

### Rank 2 — HIGH — hop-targets.js: false pin header + zero pin surface anywhere (4-01, 6-07-part, 4-04)

The module's header claims unit pins in `render.test.js` and
`model-stage6.test.js`; neither imports it, e2e never asserts
`.active-hop`/`.lane-active`, so **nothing anywhere pins the
hop→(card, lane) mapping** — 197 lines of pure branching with no
contract. This violates the claim-vocabulary contract (`PINS:`
language that is not load-bearing is forbidden currency for a maintainer
scanning for the test contract) _and_ the test contract. Chunk 5's
reviewer independently flagged the same file's false header shape.
Gemini adjudication of the duplication itself (4-04): **refactor-minimally**
— keep explicit per-stage sequences, collapse to per-hop
`[cardId, laneId]` tuple tables (~45% shorter), preserve the stage-6
`hop - 2` delegation verbatim. **Fix:** `test/panel/hop-targets.test.js`
(the deep-dive for 6-07 supplies the exact pin surface) + the adjudicated
tuple-table shape + corrected header.

### Rank 3 — HIGH — inspector-source mirrors drift from the code they claim to mirror (5-01, 6-07-part)

The inspector's code panel tells learners it renders "the executable
truth": it doesn't. The workerqueue mirror omits `crashed`, the redelivery
queue, `redeliveredCommits`, and `setCrashed` entirely — none of the
B-6e machinery. Cache/database mirrors are proportionally thin (44 source
lines vs 142; 47 vs 191). No test compares mirror to source. This is DL-1
class (narrative not sourced from the real thing). **Fix (3 options,
pick one):** a same-change guard diffing mirrors against `js/sim`; or
re-label as "simplified teaching excerpt"; or render the real source via
`fetch` (CSP-fine). Note: the 5-01 drift directly threatens missing B-6e
fault surface teaching.

### Rank 4 — HIGH — 17 panel modules with no unit file; 5 have pure logic worth pinning (6-07)

The Gemini 6-07 adjudication classified all 17: **5 pure** (`hop-targets`,
`model-dbop`, `layout-geo` transitively covered, `inspector-source`×2),
**5 mixed** (`fault-console`, `journey-log`, `url-state`, `panel.js`,
`fs-editor` — each with a trivially extractable pure core), **7 DOM-only**
(e2e is the right layer). Prioritized targets with exact contract
surfaces delivered by the deep-dive: `hop-targets.test.js`,
`fault-console.test.js` (pure readers/writers + `flipFault` round-trip
through real engine setters), `journey-log.test.js` (dedupe + 20-cap +
run relabel + defensive copying), `model-dbop.js` (all 4 `dbOpSentence`
branches incl. the pinned **B-6d `WRITE_DOWN`**), inspector-source
structural parity.

### Rank 5 — HIGH — files at their size gates = next feature forces a pressure refactor (7-01, 7-02, 4-06, 1-07, 5-13, 6-06 nears)

Six files sit at pressing distance from their gates with real pressure
behind them: `panel.spec.js` (450/450, **≥7 mixed responsibilities**),
`panel.html` (548/550 — rail chrome already JS-built because of it),
`canvas.css` (299/300, held there across the last 4 commits), `viewport.js`
(300/300, camera+position+SVG+5 interaction listeners), `engine.js` (298)

- `trace.js` (294), plus four panel modules within 30 lines of the rim.
  Chunk 7's assessment: each is a single responsibility, not an emergency —
  but the next stage costs a forced split instead of a planned one. Planned
  splits: panel.spec → overload/stage-ladder/hygiene; canvas.css → nodes.css;
  viewport.js → input listeners module; engine.js/trace.js → snapshot-assembly
  and stage-5-prelude extractions.

### Rank 6 — Medium — teaching.js prose table drifts unbound from the sim's vocabulary (5-02)

Stage-keyed prose table quotes fragments of trace output (`"STALE (lag
3t)"`, `"Routed: 3"`, hop denominators) with no mechanical tie; a trace
reword leaves the drawer stale forever. The student reads text the sim no longer
speaks. Same class as ranks 1 & 3 — **fourth instance of the repo's one
recurring theme: narrative not tied to the component messages it
describes.** Fix: export
`TRACE_VOCAB` tokens from the trace machines (or a unit test asserting
teaching quotes appear verbatim in a real `traceHop` run).

### Rank 7 — Medium — snapshot() pools the counters but not the state (1-06)

`snapshot().queue` and `.files` read `serverSnapshots[0]` while `served`
and `queueDepth` pool all backends. A `setWebFile('10.12', ...)` edit is
invisible in the panel fs view until the learner asks a 10.11 path. Load-
bearing for the fs-editor contract today and compounding with any new
backend (stage 7+).**Fix:** pool-aggregate or rename to `primary*` and
expose per-server views.

### Rank 8 — Medium — hop-count knowledge: reconciled only by comments (3-05, 5-03)

`TOTAL_HOPS` panel-side vs the sim's per-machine final-hop computation
agree by comments and the author's care; `panel.js` `traceFinalHop`
hand-re-derives `trace-stage6.js`'s branch ladder; no test or shared
constant connects them. A stage-7 hop count or re-balanced CDN shape
drifts silently. The 3-05 deep-dive verdict: **feasible-with-caveats** —
a read-only `finalHop(stage, trace?)` in `trace-helpers.js` serves both
sim termination and panel denominators (caveats: shape-flag discovery
timing; stage 2–5 refusal semantics, `model.js` must align).

### Rank 9 — Medium — the panel re-authors sim knowledge (3-01, 3-02, 3-03, 3-09)

The same drift-window family, three shapes: the hand-built per-stage
`network.interfaces` ternary table (each new stage adds a branch + footgun
mini-IP quoting); the five sim defaults (`ttlTicks 10/300`, `lag 3`,
`jobDuration 2`, `serviceRate 4`) duplicated as panel-side `??` fallbacks
across 4 files (a rebalance lies silently); naming drift `serviceRate` ↔
`serviceRatePerTick` and FIRST_TEXT zero-state strings rebuilt from the
same numbers. Fixes: expose a network read-side registry; mint
`sim-defaults.js` (or always-populate the snapshot); one naming pass.

### Rank 10 — Medium — cdn-chain.js copies trace-helpers verbatim + an API-shaped inefficiency (2-01, 2-02, 2-04)

Three helpers re-declared byte-identically (`drainUntilYou`,
`backendFor`, `finish`), `routeIdFor` re-implemented inline, and the CDN
HIT hop forced into a throwaway `snapshot().ledger.find()` because
`cdn.lookup` doesn't expose the body it already has in hand. Import the
helpers; return `{ status, body }` from lookup.

### Rank 11 — Medium — two implicit cross-contract gaps in the render pipeline (4-02, 4-03)

`render-stage.js:129-130` writes world-space `left/top` for compact
browsers — DESIGN.md DL-1 names `viewport.js positionParts` as the single
writer (works today because two mates write the same values); the
`LANE_WIRES` ↔ `makeWire` wire-id name sync has no automated check and
fails as a visually misplaced lane, not a crash. Fixes: delete
render-stage's write, let `positionParts` own the first; export or test
the wire-id parity.

### Rank 12 — Medium — factory process residuals (9-05 → Low after audit, 9-07, 9-08-deep-dive, 9-09)

The deep-dives hardened these: register silence ruled **honest**
(candidate-by-candidate audit — all in-gate catches); residual is an
audit-trail convenience and two nits (`fix_commits: 0` undercount at
slice-metrics.yaml:588; stale `DOCUMENTS:` prose at fault-console.js:14-15
from the b6f FOLLOW-UP). `human_interventions` blurs solicited vs
unsolicited (split the field or add a notes field). The 9-08 sweep found
the one genuine gap: **four pre-convention briefs (stage1-UI, stage2-LB,
stage3, stage4) specified negative branch behavior in contracts but
pinned nothing in §Tests and carry no DL remediation trace** — the only
unresolved pre-convention debt surface. And `slices`-spec-reading: one
brief-level note that `guard-claims` applies to source comments, not
briefs, would prevent reader confusion.

### Rank 13 — Low cluster — test-suite hygiene smalls (6-01, 6-02, 6-06)

Renames (`render.test.js` actually tests `model.js` ordering helpers —
bake the acknowledgment into the file name), the LB-failover suite's
missing toggle-no-residue check (the one B-6 asymmetry; ~10 lines),
`camera.test.js` fixtures extraction before the 450 gate.

### Rank 14 — Low cluster — media & stage-7 readiness smalls (4-05, 3-04, 3-07, 3-08)

Document the stage-7 layout runbook (nested stage-2..5 conditional is the
unrepeatable debt; the stage-6 external-module pattern is the model);
break the `model.js ↔ model-stage6.js` cycle by lifting
`withHopPrefix`; split the model.js hub at the next stage addendum;
prevent new 24-line extractions without the same precedent responsibility
clarity.

### Rank 15 — Low cluster — CSS token discipline + tooling polish (7-03, 7-04, 8-02, 8-01, 8-03, 8-04, 8-05, 4-07, 4-08, 4-09, 5-04..5-07)

All real but small: `#061224` → `var(--on-accent)`; drop the `.brand`
`!important`; guard `extract-session-metrics.mjs`'s `JSON.parse`
(its URL correctness caveat blocks the entire Step-3 pipeline — the one
tooling item worth prioritizing); 404/500 CSP headers; the near-nod
five-liner utilities and naming-polish items as listed in the chunk
reports.

## The one recurring theme

Across 4 of the top 6 findings, the defect class is the same: **a panel-
side representation of sim truth that is honestly built but not
mechanically derived** — the stage-6 trace machine (rank 1), the
hop-targets matrix (rank 2, from the render side), the inspector mirrors
(rank 3), and the teaching prose (rank 6). The sim itself is clean: the
process already caught, named, and registered this exact class twice
(DL-1, DL-4) where it _mattered_ past the era that produced it. What has
not been fully paid down is the residual class where hand-rebuilt
knowledge survived the refactor era. Every fix in ranks 1–3 lowers the
same family of risk; they should be treated as one campaign, not
separate chores.

## If you only do five things

1. **Shared `lbEnqueueHop()` into `trace-helpers.js` + stage-6 all-down
   engine test** (rank 1) — the only finding with a Critical transition
   condition.
2. **`test/panel/hop-targets.test.js` + tuple-table refactor + header
   correction** (rank 2) — the repo's forbidden claim language made
   load-bearing again on 197 unpinned lines.
3. **Repair the inspector mirrors** (rank 3) — the teaching surface most
   often read as code. Both 5-01 recommendations take an afternoon at
   most.
4. **The at-the-gate splits, planned not under pressure** (rank 5) —
   nothing here is urgent, everything gets _more_ expensive after the
   b6-era momentum carries into stage 7.
5. **The `finalHop` sim surface** (rank 8) — kills the
   `TOTAL_HOPS`/`traceFinalHop`/comment reconciliation class permanently
   and is pre-validated feasible by deep-dive.

## Strengths worth naming

- **Mechanism realism end-to-end** (2-05): the product IS the executable
  model and every layer honors it — Map lookups, cursor math, ledger
  semantics, version comparisons.
- **Determinism as a first test** (1-P01): mulberry32, one consumer,
  seed-replay pinned at engine.test.js:17-29 before anything else.
- **Single-funnel refusal choke point** (1-P02): one place mints a
  refusal record, which is what made six teachable fault paths possible.
- **The suite as spec-of-record** (6-03..6-15): whole-frame pins, zero
  mocks except one justified sink stub, zero skips, byte-identical
  same-seed replays, named counter-examples in titles that storymap
  rides on.
- **E2E as browser contract** (7-09, 7-10): 62 tests, testid-dominant, zero
  pixel snapshots, zero inline CSP violations, every fault branch closes
  its DL-3/DL-4 counter-example e2e-side too.
- **Tooling that bites** (8-P1..P8): all seven guards verified against
  realistic violations; CI replicates the verify contract faithfully.
- **Process ledgers that survive an audit** (9-02..9-04, 9-10, 9-11):
  contracts honored across all 23 briefs, 47/47 story refs resolving,
  DL-1..DL-5 closed with code evidence, self-correcting rule evolution.
- **The B-6 teachings themselves** (5-09, 6-09, 7-10): the fault ladder's
  sim-is-the-referee pattern is the repo's best-practice fingerprint.

## Appendix — finding index

Raw findings live in `reports/chunk-{1..9}-*.md` under the ids
`{chunk}-{NN}` (plus `{chunk}-P{n}` praise ids in chunks 1–3). The merged
register above cites them; their quoted line-level evidence is the record
of what was found, not reconstructed here.

## Addendum (2026-10-31, chunk 10) — are the file-size limits working?

Commissioned by the repo owner to test the suspicion that models game the
300/450/550-line gates. Method: forensic researcher brief (git-archeology
of ~15 extraction events, comment/blank density scan, golf-vector scan)

- Qwen3.7 Plus adjudication (`reports/chunk-10-size-gate-forensics.md`;
  researcher brief-vs-data mismatches 10-01/10-02 also caught and amended).

**Verdict: MIXED, overwhelmingly in the gate's favor — KEEP with minimal
tightening.**

- **11 of 15 extraction pairs are GENUINE-SPLIT** with nameable single
  responsibilities and zero dead modules; 2 are line-neutral refactors
  (numstat symmetric; still-useful seams); **0 DODGE splits**. Pressure
  transmits usefully across classes: panel.html's 550 cap produced the
  JS-built teaching-drawer/stage6-registry pattern, and at cap hits
  e2e/panel.spec.js spawned sibling specs rather than a second monster.
- **The gaming surface is real but narrow, `js/**` only:** two capped
  panel files fold content into prettier-unbreakable shapes instead of
  splitting — the six-branch chained ternary tables in
  `inspector-state.js:79-141` and `model.js:203-236` — and sit
  comment-thin (6.3–6.8% comment/blank vs 26.8% repo median; finding
  10-04). No comment-stripping trend otherwise, zero statement packing.
- **Gate as context, not cause** (10-06): the model.js↔model-stage6
  cycle (3-04) and hop-targets' false pin header (4-01) happened
  _during_ guard-motivated splits but were authoring errors, not forced
  ones — and 4-01 is the one case where gate-split context made a
  contract lie cheap.
- **Guard holes** (10-05): `scripts/` is outside the scan set while
  `extract-session-metrics.mjs` grew to 327 (109% of would-be cap);
  the two write-around shapes above are invisible to a pure line count.
- **Recommendations (minimal, no pressure loss):** (1) add `scripts/`
  to `SOURCE_DIRS` at 300; (2) a _soft_ CI warning for prod files with
  many >100-char lines — visibility, not a failure; do NOT add AST or
  complexity checks (the guard's blunt simplicity is what kept it
  ungameable at scale); (3) AGENTS.md one-liner for new-module headers:
  "name a real test or omit the pin — never a fabricated reference"
  (10-06).
- **For the fix backlog:** rank 5's at-the-gate splits stand, now with
  `inspector-source.js`/`inspector-state.js` comment-thinness added to
  the planned `inspector*` split rationale.

## Addendum (2026-10-31) — the factory process that produced this code, vs October 2026 practice

Evidence base: chunk 9 audit (all 23 briefs, ledgers, manifests, DL register),
chunk 8 tooling review (7 guards, CI fidelity), chunk 10 gate forensics, plus
23/23 telemetry entries and reviewed defects across this whole pipeline.

### What the process is

Per feature: a lead session signs off a committed decision with the human,
commits a ≤120-line resumable brief carrying _boundary contracts only_
(module exports, DOM testids, ring ids, test titles) plus mandatory named
negative-case counter-examples; a **cold executor sub-agent on a pinned
cheap model** implements code+tests+manifests from the brief alone
(ghost-coding banned, guard-enforced); the lead then runs a scripted
**acceptance probe** walking every contract, opens a PR with the human as
reviewer (never self-approvers/merger), and records session telemetry,
guardrail failures, and interventions in a metrics ledger; discovered
defect classes get DL-N entries + rule-doc updates **in the same change**;
`slices.yaml`/`storymap.yaml` must change with the feature they describe
(git-diff meta-rule). Seven guards machine-enforce this whole meta-process;
`npm run verify` is the single named gate; agents hold an isolated,
fail-closed GitHub identity.

### vs October 2026 mainstream (spec-kit/Kiro/OpenSpec/BMAD era, agentic-SDLC

"agents execute, humans verify" doctrine)

- **Spec-as-executable-artifact: at the leading edge.** 2026's SDD
  best-practice is specs tied to checklists and gates; this repo goes
  further — brief contracts, test titles, and storymap refs form a
  closed, machine-checked loop. The full review verified 47/47 story refs
  resolve byte-identically and 23/23 brief contracts were honored in
  shipped code. Most 2026 adoptions assert that linkage; few enforce it
  with a guard that fails the commit on a stale ref.
- **Verification as a load-bearing layer: above mainstream.** The 2026
  doctrine is "vibe, then verify" with deterministic analysis in the
  loop; here the _process itself_ is deterministically verified (plan
  ticks, debt schema, line counts, claim vocabulary, same-change
  manifests) — not just the code. Chunk 8 confirmed all guards bite and
  CI replicates the gate faithfully.
- **Context engineering: ahead of typical.** Cold-execution briefs,
  ghost-coding ban, and read-only boundary contracts match 2026's
  context-engineering guidance closely enough to look like its
  reference implementation — encoded as linters, not articles.
- **Human gates: current and correct.** Design sign-off before work,
  human-only bypass on rulesets, reviewer assignment, and the post-Kiro
  (Feb 2026 AWS incident) instinct to forbid agent-approved destructive
  merges — all present.
- **Organizational memory: rarer than it should be.** DL register with
  same-change rule updates + honest telemetry (83 guardrail failures,
  10 interventions, 3 escaped defects across 23 slices — every escaped
  defect registered, root-caused, and remediated in-code) is the
  process-learning loop most teams still lack.
- **Model-tier discipline by telemetry** (cheap executor + recorded
  guardrail-failure cost per slice) matches 2026 batch-model-selection
  practice and is measured rather than folklore.

### Gaps vs 2026 leading edge

1. **No inline automated review layer.** 2026 mainstream adds an
   LLM-as-judge/CodeRabbit-style pass on every PR; this repo relies on
   lead review + the Step-3 acceptance probe. The evidence (3 escaped
   defects of DL-class, zero Criticals) says the probe compensates — but
   the probe is lead-scripted per slice, not a standing reviewer agent.
   The one standing adversarial review (this 10-chunk audit) was
   commissioned, not scheduled.
2. **Guard blind spots are small but real** (scripts/ outside the
   file-size gate; comment-thin capped outliers; no WebKit in e2e).
3. **Residual truthfulness risk sits where the process has no guard:
   narrative artifacts** (inspector mirrors, teaching prose) — the one
   DL-1-family surface not mechanically checked.

### Net verdict

For a solo-operator AI factory this is **top-decile implementation of
October 2026 best practice** — it operationalizes what the ecosystem
describes philosophically and adds machine enforcement of the meta-process
that most tooling does not attempt. The gap is not discipline but
standing automation: adopt an inline review agent on PRs, close the two
guard blind spots ranked 1-15/Mediums, and the process matches the
leading edge end to end.
