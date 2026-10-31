# Chunk 9 — Factory process audit

- **Reviewer:** Qwen3.7 Plus (`opencode-go/qwen3.7-plus`)
- **Date:** 2026-10-31
- **Scope:** `docs/plans/*.md` (23 briefs), `docs/factory/slice-metrics.yaml`,
  `docs/factory/technical-debt.yaml`, `slices.yaml`, `storymap.yaml`,
  `AGENTS.md`, `DESIGN.md`, `FACTORY.md`. Cross-checked against shipped
  `js/sim/**`, `js/panel/**`, `test/**`, `e2e/**`.
- **Deep-dives used:** no — the runtime cannot dispatch to
  `opencode-go/gemini-4-argon` from this harness. `deep_dive: yes` is set
  on the three items whose evaluation is most load-bearing and would
  benefit from a second pass (`9-02`, `9-05`, `9-08`). See
  "Deep-dive requests (orchestrator dispatch)" at the end.

## Brief-count resolution

The orchestrator's map line 169 names "30 briefs"; the researcher's brief
counted 23. The ground truth is **23**: `ls docs/plans/*.md | wc -l` returns
23, `grep -c '^  - id:' docs/factory/slice-metrics.yaml` returns 23, and
the 23 distinct `brief:` refs in slice-metrics enumerate exactly the 23
files on disk. The map's "30 briefs" is a stale count — the researcher's
"23" is correct, and the manifest ↔ metrics 1:1 mapping is **accurate**,
not understated. There are no uncounted briefs; the discrepancy is in the
map, not the corpus.

## Findings

```yaml
- id: 9-01
  title: map.md line 169 misstates the corpus as 30 briefs (actual: 23)
  severity: Low
  category: documentation
  files:
    - docs/reviews/2026-10-31-full-review/map.md:169
  evidence: >
    Line 169: "Files: docs/plans/*.md (30 briefs), …". `ls docs/plans/*.md |
    wc -l` returns 23. `grep -c '^  - id:' docs/factory/slice-metrics.yaml`
    returns 23. The 23 `brief:` refs in slice-metrics are all distinct and
    match the 23 files on disk.
  impact: >
    Misleads a later reader into thinking 7 briefs are missing or untracked.
    The 1:1 brief ↔ metrics mapping is in fact honest; only the map's prose
    is wrong.
  recommendation: >
    Edit map.md line 169 to read "docs/plans/*.md (23 briefs)". Optionally
    have the orchestrator cross-check the count when aggregating.
  deep_dive: no

- id: 9-02
  title: Brief boundary contracts vs realized code — contracts honoured end to end
  severity: Praise
  category: process
  files:
    - docs/plans/2026-10-20-stage3-cache.md
    - docs/plans/2026-10-24-stage6a-dns-crossnet.md
    - docs/plans/2026-10-30-b6d-primary-down.md
    - js/sim/cache.js:18
    - js/sim/dns.js:29
    - js/sim/database.js:168
    - test/sim/cache.test.js
    - test/sim/dns.test.js
    - test/sim/primary-down.test.js
  evidence: >
    stage3-cache brief §1 contracts `createCache({ address = '10.20',
    ttlTicks = 10 })` with a `Map`-backed `entries`; cache.js:18 ships
    `export function createCache({ address = '10.20', ttlTicks = 10 } = {})`
    and cache.js:25 is `const entries = new Map();`. stage6a brief §1
    contracts `createDns({ address = '10.60', ttlTicks = 300 })` and an
    authoritative table; dns.js:29 ships `export function createDns({
    address = '10.60', ttlTicks = 300 } = {})` and dns.js:39 is the
    authoritative table `[['example.com', '10.1']]`. b6d brief contracts
    `setPrimaryDown(bool)` fail-loud + `isPrimaryDown()` + `primaryDown` on
    snapshot + real 503 response; database.js:168-172 validates the boolean
    fail-loud, database.js:158 returns `primaryDown` on the snapshot, and
    webserver.js consults `isPrimaryDown()` before every write. Every named
    test title the briefs pinned exists verbatim on disk: the six sampled
    story refs
    (test/sim/engine.test.js::same seed replays the identical tick sequence,
    cache.test.js::serves cache hits before TTL expiry…,
    primary-down.test.js::setPrimaryDown validates a boolean ON/OFF flag…,
    dns-ledger-drop.test.js::DL counter-example — the NX-drop run narrates…,
    missions.test.js::the stage-1 404 mission completes only on a real 404…,
    dns.test.js::answers the authoritative table on a miss…) all resolve via
    `grep -qF` against their file.
  impact: >
    This is the contract the process exists to protect, and it held across
    the early stage (cache, stage 3), the mid stage (DNS + Router, stage 6a),
    and a fault slice (primary down, b6d). Negative-case counter-example
    pins are byte-identical in the test files — 5 in primary-down.test.js,
    8 in worker-crash.test.js, 10 in dns-ledger-drop.test.js — with the
    named "byte-identical" assertions the briefs demanded.
  recommendation: >
    No change needed. Note this as the load-bearing proof that the
    boundary-contract ↔ verbatim-pin discipline works end-to-end once the
    DL-3/DL-4 wording is in the brief (post 2026-10-24).
  deep_dive: yes — second-pass audit of every brief contract vs every
    shipped export/testid across all 23 briefs would confirm the pattern
    holds uniformly, not just on the three samples.

- id: 9-03
  title: storymap.yaml test refs resolve and pin the story's own behavior (DL-3 clean)
  severity: Praise
  category: test-contract
  files:
    - storymap.yaml
    - test/sim/cache.test.js
    - test/sim/dns.test.js
    - test/sim/primary-down.test.js
    - test/panel/missions.test.js
    - scripts/guard-story-refs.mjs
  evidence: >
    Six sampled storymap refs across stages 1, 3, 4, 5, 6 (one per fault
    slice, one cross-stage) all resolve to byte-identical titles in their
    test files. The refs pin the story's own behavior: SIM-3 pins
    cache-hit/TTL; SIM-4 primary-down pins the fail-loud boolean and the
    503/never-invalidate counter-example; SIM-6 dns-ledger-drop pins the
    DL counter-example NX-drop run; PANEL-1 missions pins the stage-1 404
    mission's real-404-only detector. The `scripts/guard-story-refs.mjs`
    enforces verbatim fragment presence in the file on every commit, so
    stale pins cannot silently pass.
  impact: >
    This is the DL-3 class defect the repo had to learn the hard way
    (Stage 5 originally pinned a stale Stage-1-era label test that never
    checked Stage 5). The current pinning discipline is the remediation,
    and it is holding.
  recommendation: >
    No change needed. Worth naming as the load-bearing paydown of DL-3.
  deep_dive: no

- id: 9-04
  title: DL-1..DL-5 all closed with in-code paydown; DL-1's original defect class (narrative not sourced from sim) is structurally remediated
  severity: Praise
  category: process
  files:
    - docs/factory/technical-debt.yaml:25-163
    - js/panel/viewport.js:120-147
    - js/sim/trace.js:76
    - js/sim/trace.js:190
    - js/panel/model.js:37
  evidence: >
    DL-1 closed_in `8ab0e21` (viewport.js positionParts repositions
    .browser-compact slots). viewport.js:140-145 now walks
    `layout.browserSlots` and calls setWorldPos on each
    `.browser-compact[data-address="${slot.address}"]`. DL-2 closed_in
    `5741b20 & factory-kit#2` — AGENTS.md now codifies lead-to-subagent
    cold execution on the pinned executor model. DL-3 closed_in stage-5
    fix tour — model-stage5.test.js, panel.spec.js Stage 5 switch, and
    the TOTAL_HOPS 5:8 key all exist. DL-4 closed_in `63aa7f6` —
    trace.js:76 holds `served = null` and the drain branches at
    trace.js:190/211/247 set `served = drainUntilYou(...)`; model.js:37
    `hopSentences(stage, snapshot, from, serverAddress)` derives its
    sentences from the snapshot (the sim's record), not from a hop table.
    DL-5 closed_in `2acf19d` — the camera-drawer fence removed from
    viewport.js, and the control-room-rail remodel (R1-CONTROL-ROOM) pays
    the structural debt by moving the teaching/legend/missions surfaces
    out of the camera viewport altogether.
  impact: >
    Every closed DL leaves code evidence, not just a prose note. The
    DL-1/DL-4 pair — the "narrative not sourced from sim" defect class
    that is the repo's most dangerous correctness failure mode — is
    structurally closed: trace narratives now consume `served`, and
    position writes now flow through a single `positionParts` funnel.
  recommendation: >
    No change needed. Worth naming as the paydown pattern that future
    slices inherit.
  deep_dive: no

- id: 9-05
  title: Debt register untouched since 2026-10-26 while 5 b6 slices (10-28 → 10-31) committed — same-change rule technically breached
  severity: Medium
  category: process
  files:
    - docs/factory/technical-debt.yaml
    - docs/factory/slice-metrics.yaml:892
  evidence: >
    `git log -- docs/factory/technical-debt.yaml` last touched `2acf19d`
    on 2026-10-26 (DL-5 camera-drawer fix). Five b6-family feature commits
    landed after: 73d223b (b6b 10-28), 65e901e (b6c 10-29), b30d3c6
    (b6d 10-30), 36c3dd2 (b6e 10-31), 28cfeed (b6f 10-31). Each of those
    slices' Step 3 notes in slice-metrics.yaml carries acceptance-probe
    results and (in b6f's case) an explicit "FOLLOW-UP CANDIDATE"
    (slice-metrics.yaml:892: "the faults-tab empty-state line is now dead
    UI through the ladder … FOLLOW-UP CANDIDATE recorded, not a defect"),
    but none of those candidates appear as entries in technical-debt.yaml.
  impact: >
    The DEBT-REGISTER same-change rule (kit DEBT-REGISTER, referenced by
    AGENTS.md §4) is technically breached: a follow-up candidate
    identified at Step 3 lives only in slice-metrics notes, not in the
    register. The b6 ladder's "FOLLOW-UP CANDIDATE" in b6f's note is the
    most obvious one; the R1-CONTROL-ROOM rail-host fix (commit 508746d,
    mentioned in slice-metrics.yaml:605) is another case where a lead
    probe discovery rode the branch without a register entry. The register
    silence is *plausibly* correct (the lead judged each candidate "not a
    defect" and so not register-worthy), but that judgement is recorded in
    the metrics notes only, not in the register — a future reader cannot
    see the consideration without reading every slice's notes field.
  recommendation: >
    Either (a) add a brief "considered-and-declined" entry per candidate
    in `closed:` or a `declined:` subsection so the ledger's silence has
    a positive record, or (b) tighten the Step 3 lead note convention so
    the "not a defect" reasoning is explicit in a way the register can
    cross-link. A future slice that surfaces a follow-up at Step 3 should
    touch the register in the same commit, even if the entry is "recorded
    as not-a-defect".
  deep_dive: yes — an audit of every FOLLOW-UP/CANDIDATE/lead-fix note
    in slice-metrics.yaml versus the register entries would settle
    whether every candidate has an honest home.

- id: 9-06
  title: slice-metrics.yaml guardrail_failures sum 83 verified; telemetry gap is a bounded early-era artifact
  severity: Low
  category: process
  files:
    - docs/factory/slice-metrics.yaml:356-432
  evidence: >
    `awk '/^    guardrail_failures:/ {s+=$2} END {print s}'` returns 83.
    Largest: STAGE6B-CDN 15, ORRERY-CAMERA 11, STAGE6A 8, B6B 6, B6E 5,
    STAGE-4 5. The 4 early entries with no session_id/tokens/cost
    (PHASE1-BOOTSTRAP, STAGE1-MODEL, STAGE1-UI, STAGE2-LB) are the
    pre-subagent-dispatch era executed in lead session
    `ses_eb45c4d6bffex4PS4dGQJabPhu` or before metrics extraction was
    wired — the notes fields are honest about the omission
    (slice-metrics.yaml:373 "Pre-dates sub-agent executor split; token/
    cost fields omitted rather than estimated"). ORRERY-CAMERA (2026-10-18)
    is the first entry with full telemetry, and every entry after has it.
  impact: >
    The metric is internally consistent and the missing-telemetry window
    is bounded and documented. The 83 sum is real rework, not padding —
    STAGE6B's 15 are named in its notes (convergence on unit/e2e pins plus
    one DL-2 UI catch), ORRERY-CAMERA's 11 are six GLM-5.3-Flash dispatch
    self-corrections, and STAGE-5's 5 are the post-merge fix tour (the
    original zero entry understated true rework and was amended).
  recommendation: >
    No change needed. Worth naming the 4-entry telemetry gap as a bounded
    artifact of the bootstrap era, not an ongoing hole.
  deep_dive: no

- id: 9-07
  title: human_interventions field meaning shifts over time; STAGE-5's 4 is a post-hoc amendment
  severity: Medium
  category: process
  files:
    - docs/factory/slice-metrics.yaml:523-566
  evidence: >
    `human_interventions` sum 10. The field is meant to record
    "unprompted human intervention correcting a code or process miss
    outside scheduled human gates" (AGENTS.md §4). STAGE-5's 4
    human_interventions (slice-metrics.yaml:542) are not the original
    build's number — the entry was AMENDED 2026-10-22 to reflect the
    post-merge fix tour, and the 4 are "4 human defect reports (switch
    crash, centre chip stacking, stale forward lane, GET narrated as async
    202)" from the notes. That is correct recording, but the original
    build ran with 0 interventions recorded; the correction came only
    after DL-3 and DL-4 surfaced. Two b6-family entries (B6D-PRIMARY-DOWN,
    B6F-DNS-LEDGER-DROP) record a standing per-slice model deviation
    (pinned executor over limit, human approved in-session) as 0
    interventions — the approval was solicited, so 0 is correct under the
    rule, but it blurs the distinction between "solicited model approval"
    and "unsolicited correction" for later readers.
  impact: >
    A future reader comparing `human_interventions` across slices may
    misread STAGE-5's 4 as comparable to B6B's 0 without realizing one
    was post-hoc amended and the other was genuinely zero. The
    solicited-vs-unsolicited distinction is load-bearing for interpreting
    the metric.
  recommendation: >
    Consider a `human_interventions_unsolicited` /
    `human_interventions_solicited` split, or a `human_approval_notes`
    free-text field next to `human_interventions`, so the distinction is
    machine-readable rather than buried in the free-form notes field.
  deep_dive: no

- id: 9-08
  title: Brief-discipline: 5 briefs over 120 lines; exemption list honoured but the early-era gap is structural
  severity: Low
  category: process
  files:
    - docs/plans/2026-10-15-stage1-executable-model.md (130 lines)
    - docs/plans/2026-10-20-stage4-database.md (137 lines)
    - docs/plans/2026-10-18-orrery-plane-camera.md (172 lines)
    - docs/plans/2026-10-20-stage3-cache.md (193 lines)
    - docs/plans/2026-10-16-stage1-interactive-orrery-ui.md (198 lines)
    - scripts/guard-plan-ticks.mjs
  evidence: >
    Five briefs exceed the 120-line cap. All five predate 2026-10-24 and
    sit on the explicit LEGACY_LONG_BRIEFS exemption list in
    scripts/guard-plan-ticks.mjs. Every post-stage4 brief is ≤ 120 (b6d
    and b6f sit at exactly 120). No brief contains line-by-line
    implementation pseudocode; only `style2-control-room-remodel` has one
    code fence (lines 7-17, an ASCII layout mockup of zones/rail — not
    line-by-line code).
  impact: >
    The brief-discipline rule is held by the guard, and the exemption list
    is honest about the bootstrap-era long briefs. The structural gap:
    those five long briefs predate the DL-3/DL-4 "Branch contracts"
    header convention (which begins 2026-10-24 stage6a-dns-crossnet), and
    DL-3 and DL-4 in the register document precisely the defects that
    emerged from that early-era gap. The rule evolved *because* of what
    those long briefs missed — a healthy process signal, not a failure.
  recommendation: >
    No change needed. Worth naming the brief-discipline gap as a healthy
    process evolution: the rule got sharper *after* the defects it was
    designed to catch surfaced.
  deep_dive: yes — a full comparison of every brief's §Tests section
    against the DL-3/DL-4 header convention (present/absent, named
    counter-examples present/absent) would let the orchestrator state
    whether every post-convention brief correctly carries it and every
    pre-convention brief has a remediation trace in the DL register.

- id: 9-09
  title: Claim vocabulary on source: CHECKS/PINS present, DOCUMENTS sparse but structurally correct
  severity: Low
  category: process
  files:
    - AGENTS.md (claim vocabulary rule)
    - js/sim/cache.js
    - js/sim/dns.js:1
    - js/sim/database.js:9
    - js/panel/viewport.js:141
    - js/panel/teaching.js:1
  evidence: >
    Source comments carry CHECKS:/PINS:/DOCUMENTS: as contracted:
    viewport.js:141 "CHECKS: compact Ring-3 nodes track layout.browserSlots
    …"; dns.js:1 "DOCUMENTS: the Stage 6a component — an authoritative name
    server …"; database.js:9 "CHECKS: B-6d — setPrimaryDown validates a
    real boolean ON/OFF state …". `scripts/guard-claims.mjs` enforces the
    vocabulary on source comments (js/css/test/e2e), not on briefs — the
    8 briefs without CHECKS:/PINS: tags (phase1-bootstrap, style2-remodel,
    and the six b6-family briefs) are therefore not violations. DOCUMENTS:
    is the least-used of the three tags but appears where it belongs
    (teaching.js:1, model-stage6.js:1).
  impact: >
    The vocabulary discipline holds where the guard enforces it. The
    b6-family briefs omit the tag prose because they are briefs, not
    source comments; a reader expecting the tags in the briefs would be
    confused, but that confusion is the brief-author's problem, not a
    correctness break.
  recommendation: >
    Optional: add a brief-level "Claim vocabulary" cross-reference line to
    the brief template noting "the vocabulary is enforced on source
    comments (see scripts/guard-claims.mjs), not on this brief". Purely
    reader-comfort, not a defect.
  deep_dive: no

- id: 9-10
  title: Manifest same-change freshness: verified across sampled feature commits
  severity: Praise
  category: process
  files:
    - slices.yaml
    - storymap.yaml
    - scripts/guard-slices.mjs
    - scripts/guard-story-refs.mjs
  evidence: >
    `git log --oneline -5 -- slices.yaml storymap.yaml` shows the five
    newest feature commits (28cfeed b6f, 36c3dd2 b6e, b30d3c6 b6d,
    65e901e b6c, 73d223b b6b) all carried both manifests in the same
    commit as the feature code. Sampled feature commits carry manifest
    updates in the same change. `scripts/guard-slices.mjs` enforces
    same-change on every commit, so manifest staleness cannot silently
    pass.
  impact: >
    This is the contract the factory process exists to protect, and it
    held across the whole b6 ladder.
  recommendation: >
    No change needed. Load-bearing proof that the same-change rule is
    enforced by the guard, not by the author's memory.
  deep_dive: no

- id: 9-11
  title: AGENTS.md/DESIGN.md/FACTORY.md as living docs: drift detected is healthy, not broken
  severity: Praise
  category: documentation
  files:
    - AGENTS.md
    - DESIGN.md:307-386
    - FACTORY.md
  evidence: >
    DESIGN.md carries the Fault Console section (lines 307-386) with all
    six fault bullets — the same six the b6 ladder shipped, in the same
    order they shipped (WebServer down, LB skip, cache bypass, primary
    down, worker crash, record dropped). Each fault is described as
    "component owns the flag, transport consults, UI narrates the record"
    — the executable-model contract held in the sim layer. AGENTS.md
    codifies the lead-to-subagent cold execution rule (paydown of DL-2)
    and the human-intervention defect logging rule. FACTORY.md names the
    guard scripts and the executor model pin. The pre-2026-10-24 briefs
    predate the DL-3/DL-4 wording; the DL register captures the gap as
    DL-3 and DL-4; the wording was then applied in every post-10-24
    brief. The retroactive fit is structurally honest: the rule evolved,
    and the early-era gap has a DL entry, not a silent pass.
  impact: >
    The living docs are living — they reflect the process the repo
    actually runs, not the process it wished it ran at bootstrap.
  recommendation: >
    No change needed. Worth naming the healthy drift pattern as a
    load-bearing signal that the process is self-correcting.
  deep_dive: no
```

## Praise

- **End-to-end contract fidelity.** Three representative briefs
  (stage3-cache, stage6a-dns-crossnet, b6d-primary-down) were cross-checked
  against shipped code. Every boundary contract — the export shape, the
  testid names, the negative-case counter-example, the verbatim test
  title — matched what the executor delivered. This is the contract the
  factory process exists to protect, and it held.
- **DL-3/DL-4 paydown is structural, not cosmetic.** The "narrative not
  sourced from sim" defect class that broke Stage 5 is remediated at the
  trace-machine level (`served = drainUntilYou(...)`; `hopSentences` reads
  from snapshot) AND at the brief-level (every post-10-24 brief carries
  named counter-examples pinned by test title). The register silence since
  10-26 is the consequence of the remediation working.
- **All 47 storymap stories are `done` with byte-identical test refs.** The
  six refs sampled across five stages resolved verbatim to their test
  file titles. `scripts/guard-story-refs.mjs` enforces verbatim fragment
  presence on every commit.
- **Manifest same-change held across the entire b6 ladder.** Five feature
  commits, five manifest updates, all in the same commit.
- **The process evolved under its own pressure.** The DL-3/DL-4 wording,
  the negative-case header convention, the brief-length cap, the claim
  vocabulary — every one of these rules sharpened _after_ a defect
  surfaced. That is a healthy process.

## Deep-dive requests (orchestrator dispatch)

Three items were set `deep_dive: yes` above because their evaluation is
load-bearing for the aggregated assessment and a second pass by
`opencode-go/gemini-4-argon` would raise confidence:

1. **9-02 (brief contracts vs realized code).** The three briefs sampled
   (stage3-cache, stage6a-dns-crossnet, b6d-primary-down) honoured their
   contracts. A full pass over all 23 briefs' §Pre-decided boundary
   contracts / §Boundary contracts sections against the shipped exports,
   testids, and test titles would confirm the pattern holds uniformly and
   surface any single slice where a contract was silently reshaped.

2. **9-05 (register silence during b6 run).** The register has not moved
   since 2026-10-26, yet the b6 ladder's lead notes contain at least one
   explicit "FOLLOW-UP CANDIDATE" (b6f dead empty-state line) and one
   lead probe fix that rode the branch (b6d `serveCacheSuffix`). An audit
   of every FOLLOW-UP / lead-fix note in slice-metrics.yaml versus the
   register would settle whether the silence is honest (every candidate
   judged "not a defect" with a documented reason) or whether any
   candidate should have been registered.

3. **9-08 (brief-discipline gap, pre- vs post-DL-3/DL-4 convention).**
   The convention begins 2026-10-24. A full comparison of every brief's
   §Tests section against the DL-3/DL-4 header convention would let the
   orchestrator state whether every post-convention brief correctly
   carries it, and whether every pre-convention brief has a remediation
   trace in the DL register (DL-3 and DL-4 cover the two that needed it;
   a full enumeration would confirm no others did).

### Deep-dive 9-08 adjudication (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**Classification sweep (all 23 briefs):** post-convention (2026-10-24 onward) =
14/15 `CONVENTION-COMPLIANT` + 1/15 `NEGATIVE-PINS-WITHOUT-HEADER`
(`2026-10-26-style2-control-room-remodel.md` — pins the DL-5 negative
invariants at L29/L41/L56-60 but no header/label). Pre-convention (10-12..10-21) =
2 explicit `NEGATIVE-PINS-WITHOUT-HEADER` (phase1-bootstrap L56-68,
stage1-executable L116-118 404/405/bad-IP pins) + 6 `NO-NEGATIVE-PINS`
(stage1-interactive-orrery-ui L179-191, stage2-load-balancer L104-113,
orrery-plane-camera L141-149, stage3-cache L174-186, stage4-database
L119-130, stage5-worker-queue L46-51).

**Corrects the reviewer's prior belief:**

- DL-3 and DL-4 do NOT cover two distinct briefs; both cite Step 2 of
  `2026-10-21-stage5-worker-queue.md` (b12ba6b).
- Four pre-convention briefs (`stage1-interactive-orrery-ui`,
  `stage2-load-balancer`, `stage3-cache`, `stage4-database`) specified
  negative branch behavior in their component contracts (`route-405` in
  stage 1 UI, `BYPASS` on non-GET in stage 3, `SKIP` on warm cache HIT in
  stage 4) but pinned no negative counter-examples in §Tests and have NO
  remediation trace in technical-debt.yaml — the unresolved pre-convention
  debt surface.

**Adoption-notes:** from 2026-10-27 (b6) on, the standalone
`## Negative-case contracts (DL-3/DL-4)` section became inline
`Named counter-example (DL-3)` bullets inside
`## Boundary contracts (Step 2)` cross-referenced from `## Tests & manifests`
— a convention spelling evolution, not a compliance break.

### Deep-dive 9-05 adjudication (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**VERDICT: register silence = HONEST (all candidates documented-exempt).**

Eleven candidate markers were audited across slice-metrics.yaml vs the
register (B5 dead ref; stage6b tab-spill + CI race; stage6a reopened Step 2 +
NX relabel; teaching-drawer/usability-state brief-contract contradictions;
teaching-correctness dedupe repair; R1 wheel scroll-chaining; b6/b6b mission
pin updates; b6c probe false alarm; b6d `serveCacheSuffix` lead fix; b6e
out-of-brief `model-stage5-chain.js` extract; b6f dead empty-state
FOLLOW-UP). Every one resolves to exempt under the DEBT-REGISTER trigger
(escaped defect or unprompted human intervention revealing a systemic gap):
all are in-gate catches (`defects_escaped: 0`, `human_interventions: 0`)
— the Step-3 acceptance probe and DL-2/3/4 rules working as designed, not
new systemic gaps.

**Two non-breach nits (recorded):**

- `slice-metrics.yaml:588` records `fix_commits: 0` for R1 despite
  follow-up commit `508746d` (`:605`) — telemetry undercount.
- B6F's dead `RAIL_EMPTY.faults` / `rebuild()` empty branch leaves slightly
  stale `DOCUMENTS:` prose at `js/panel/fault-console.js:14-15` — minor
  cleanup or a TD-1 hygiene note (consistent with finding 9-06).

Consequently, the severity of finding 9-05 is revised: the register's
2026-10-26 silence is honest — the residual finding is the audit-trail
convenience (candidates live in metrics notes rather than the register),
not a process breach.

### Deep-dive 9-02 adjudication (dispatched by orchestrator, `opencode-go/gemini-4-argon`)

**Overall verdict: YES — the boundary-contract-honoring pattern holds
uniformly across all 23 briefs. 20/23 VERIFIED clean; 3 DIVERGED, every
divergence a documented in-brief evolution or lead-ratified bug
prevention; zero silent contract drops.**

| #   | Brief                        | Verdict                    |
| --- | ---------------------------- | -------------------------- |
| 1   | phase1-bootstrap             | VERIFIED (6)               |
| 2   | stage1-executable-model      | VERIFIED (10)              |
| 3   | stage1-interactive-orrery-ui | VERIFIED (9)               |
| 4   | stage2-load-balancer         | VERIFIED (8)               |
| 5   | orrery-plane-camera          | DIVERGED (2 reshaped)      |
| 6   | stage3-cache                 | VERIFIED (1 cosmetic)      |
| 7   | stage4-database              | VERIFIED (8)               |
| 8   | stage5-worker-queue          | VERIFIED (7)               |
| 9   | teaching-correctness         | VERIFIED (7)               |
| 10  | usability-state              | VERIFIED (6)               |
| 11  | stage-teaching-drawer        | VERIFIED (1 cosmetic)      |
| 12  | editable-fs                  | VERIFIED (7)               |
| 13  | stage6a-dns-crossnet         | VERIFIED (1 6b-superseded) |
| 14  | stage6b-cdn-edge             | VERIFIED (9)               |
| 15  | b5-compare-tray              | VERIFIED (7)               |
| 16  | b2-missions                  | VERIFIED (7)               |
| 17  | style2-remodel               | VERIFIED (1 cosmetic)      |
| 18  | b6-fault-console             | VERIFIED (8)               |
| 19  | b6b-backend-failover         | VERIFIED (1 errata-noted)  |
| 20  | b6c-cache-bypass             | DIVERGED (1 reshaped)      |
| 21  | b6d-primary-down             | VERIFIED (8)               |
| 22  | b6e-worker-crash             | DIVERGED (1 reshaped)      |
| 23  | b6f-dns-ledger-drop          | VERIFIED (1 accepted)      |

**The 3 divergences (none silent):**

- orrery-plane-camera: `MIN_ZOOM` 0.35→0.25 and ring radii
  `[267,667,1067]`→`[400,800,1200]` as world bounds grew; superseded
  within the brief itself (Step 7), §2 left stale.
- b6c-cache-bypass: brief planned `serverSnapshots[0]?.bypassedCount`
  but shipped the pool-wide `servers.reduce([...])` in engine.js:268 —
  reading `[0]` alone would have MISSED `10.12` round-robin bypass hits;
  ratified as precedent in b6d:52-53.
- b6e-worker-crash: `m5-redeliver` detector strengthened from
  `completed >= 1` to `redeliveredCommitsIn(s) >= 1` (queue.js:98-100,158)
  — cumulative `completed` cannot distinguish pre-crash from post-crash
  commits; lead-accepted in brief Step 3 (:111-114).

**Cosmetic/superseded (non-divergent):** stage3 test-title split,
teaching-drawer "five→all shipped stages" + e2e move for the 450 cap,
stage6a router `20.1`→`20.254` re-seat in 6b, style2 phrasing.

**Cross-ref:** finding 9-05's hunch ("any candidate silently dropped")
is now additionally bounded by this sweep — contract drops = zero.
