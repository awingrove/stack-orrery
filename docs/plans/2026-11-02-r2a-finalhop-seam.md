# R2a — finalHop shared seam + panel refusal parity (stages 2–6)

Paydown for full-review findings 3-05 + 5-03 (recommendations.md Stage R2a;
feasible-with-caveats deep-dive record). One count surface — `finalHop(
stage, trace)` in trace-helpers.js — replaces today's four homes of the
same knowledge: `model.js:15` TOTAL_HOPS, `panel.js:36` TOTAL_HOPS +
totalHopsFor + traceFinalHop, `trace.js:97-99`'s nominal/refusal ladders,
and `trace-stage6.js`'s shape tree. R1a's refusal semantics are the parity
debt that makes the panel side a fix, not a dedup: the panel's
traceFinalHop has no `refused` branches at all, so an all-down run today
relabels `hop 3/9`, and the Go sweep breaks comparing `hop === nominal`
(it replays the abort story until the nominal step count runs out).

## REOPENED 2026-11-02 (lead probe, before Step 2 landed the contract)

The Step-2 probe ran two walks the original contracts missed: HOSTED
all-down narrates the refusal at hop 4 (ask/answer/routed/card) while the
original tree said 3 → `hop 4/3`; CDN-MISS all-down narrates
`LB 10.1 -> null (GET /about) queued` — finding 1-01's phantom alive on
the branch R1a did not reach — with `trace.refused` never set. The
contracts below carry the hardened state that closes both; the base-scope
Step 2 commit predates them and rides this same slice.

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps. No
  inline handlers/styles. Deterministic js/sim (the R6a guard now bites).
- File sizes: js ≤ 300 (trace.js 279, trace-stage6.js 266, model.js 250,
  panel.js 285 — the deletions net them down). test ≤ 450: engine.test.js
  is 434 — the helper matrix gets a NEW file (test/sim/final-hop.test.js),
  NOT an engine.test append.

## Boundary contracts (Step 2, FINAL state incl. the reopen)

### 1. finalHop in js/sim/trace-helpers.js (new export)

- `export function finalHop(stage, trace = null)` — pure read; no state.
- NOMINAL table inside the helper: `{ 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 }`.
- Stage-6 shape tree (REOPENED, hardcoded abort anchors from the walk
  evidence): `trace.refused ? (trace.cdn ? 6 : trace.host ? 4 : 3) :
trace.nx ? 2 : trace.cdn ? (edgeStatus === 'HIT' ? 6 : 9) : trace.host ?
9 : 8` — the refusal's landing hop per shape: host-less 3, hosted 4,
  cdn 6.
- Stages 1–5: `trace?.refused ? (stage === 1 ? 2 : 3) : NOMINAL[stage]`.
- Unknown stage falls back to 4 (trace.js's existing default). CHECKS:
  names both consumers (machines terminate their walks; the panel resolves
  denominators) + the DL-3 named counter-example (a refusal lands at its
  own shape's hop; it is not a renumber of the served ladder).

### 2. Sim machines + cdn-chain consume the helper, not local trees

- trace.js: nominal/refusal ladders → `finalHop(stage, trace)`; the
  `hop >= finalHop` exit logic stays.
- trace-stage6.js: the shape tree + violated refusal branch →
  `finalHop(6, trace)`.
- cdn-chain.js (REOPENED): the pull-side LB narration consumes
  `lbEnqueueHop` — a refused pull narrates the shared refusal card
  (`lbRefusedFrame`), sets `trace.refused = true`, and the walk aborts.
  No `null` narration, no phantom re-run.

### 3. Panel consumers consume the helper

- panel.js: delete TOTAL_HOPS + totalHopsFor + traceFinalHop; the three
  journey call sites use `finalHop(stage, snapshot.trace)`; the Go sweep's
  loop bound uses `finalHop(currentStage)` (nominal pacing) and its
  per-hop break resolves the abort at the shape's own final hop instead of
  replaying.
- model.js: TOTAL_HOPS deleted; `describeSnapshot.totalHops` =
  `finalHop(stage, t)`; hopSentences routes its shape dispatch through the
  helper (see 4–5). model-stage6.js: the four literal denominators →
  `finalHop(6, t)`.

### 4. Stages 1–4 literals → withHopPrefix(parts, finalHop(stage, t))

- hopSentences' healthy ladders for stages 2–4 (the hand-written `Hop x/N:`
  strings incl. stage-4's dbOpSentence template) become bare `parts[]`
  composed through `withHopPrefix(parts, finalHop(stage, t))`. Strings
  byte-identical to today's output (the existing pins are the proof; any
  drift is a red gate). Stage-1's refusal branch: same, with
  `finalHop(1, t)` as the total.

### 5. Refusal panel shapes (stages 1–5, plus stage-6 per the reopen)

- Stages 2..5 (deep-dive option b): `trace?.refused` → 3 sentences — the
  stage's existing emit + routed sentences + the LB card
  `LoadBalancer (10.1): connection refused — the pool is all-down, nothing
enqueued, nothing served`, totals from `finalHop(stage, t)`. Stage-1's
  2-hop shape is the precedent.
- Stage 6 (REOPENED): `trace.refused` → 3 sub-shapes per walk evidence,
  totals via `finalHop(6, t)`: host-less 3 sentences (emit, routed, card);
  hosted 4 (ask, answer, routed, card); cdn 6 (ask, answer, forward,
  MISS announce, pull, card). CHECKS: names the DL-3 counter-example
  (a refusal lands at its own shape's hop; no renumber, no replay) + the
  parity rule (sim abort hop === panel total).

## §Tests (titles verbatim — storymap refs)

1. NEW test/sim/final-hop.test.js: `finalHop resolves the shape matrix — stage 1..5 nominal and refusal, stage-6 refusal at host-less 3 / hosted 4 / cdn 6, nx 2, cdn HIT 6 / MISS 9, host 9, host-less 8, and nominal for a null trace`.
2. test/sim/final-hop.test.js: `engine walks confirm the paper arithmetic — all-down refusals land at their shape's own hop: 3 host-less, 4 hosted, 6 cdn (no replay, no [object Object], no LB-null narration)` — real createEngine walks.
3. test/panel/model.test.js: `stage-2 refused run narrates the 3-hop abort (DL-3 counter-example: not the served ladder renumbered, no hop 4+/3 residue)`; plus `an all-down stage-6 journey relabel resolves to the shape's own abort denominator (3 host-less / 4 hosted / 6 cdn), never the nominal 9`.
4. test/panel/model-stage34.test.js + model-stage5.test.js: `refused runs narrate the 3-hop abort per stage`.
5. test/panel/model-stage6.test.js: the three stage-6 refusal panel shapes (host-less / hosted / cdn) with the LB card and the shape's own totals.

## Manifests same-change

- storymap.yaml: one story under the SIM slice (tests 1+2) and one under
  the PANEL slice (tests 3–5's titles as refs). slices.yaml: same refs in
  both slices' tests lists. Stories carry no ids (R1b grammar note).

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-02) + the
      probe-driven reopen recorded above.
- [x] Step 2 base scope executed (commit `f1e4b17`).
- [x] Step 2 reopen round (contracts above reflect the FINAL state the
      reopen must reach): cdn-chain hop, hardened helper tree, stage-6
      refusal shapes, pins — `npm run verify` green; tick and commit.
- [x] Step 3 (Lead session): `npm run metrics:extract -- ses_e63b9bae7ffextCakwCwUUid2R + ses_e63a3bd39ffeNGuu6imravHr9i`, entry `R2A-FINALHOP-SEAM` appended, ticked, committed. Original contract: `npm run metrics:extract -- <sessionID>`,
      append entry `R2A-FINALHOP-SEAM`, tick, commit.
