# R2a — finalHop shared seam + panel refusal parity (stages 2–6)

Paydown for full-review findings 3-05 + 5-03 (recommendations.md Stage R2a;
feasible-with-caveats deep-dive record). One count surface, brand `finalHop(
stage, trace)` in trace-helpers.js, replaces today's four homes of the same
knowledge: `model.js:15` TOTAL_HOPS, `panel.js:36` TOTAL_HOPS + totalHopsFor

- traceFinalHop, `trace.js:97-99` nominal/refusal ladders, and
  `trace-stage6.js:191-199`'s shape tree. R1a's refusal semantics are the
  parity debt that makes the panel side a fix, not a dedup: the panel's
  traceFinalHop has no `refused` branches at all, so an all-down run today
  relabels `hop 3/9`, and the Go sweep breaks comparing `hop === nominal`
  (it replays the abort story until the nominal step count runs out).

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps. No
  inline handlers/styles. Deterministic js/sim (the R6a guard now bites).
- File sizes: js ≤ 300 (trace.js 279, trace-stage6.js 266, model.js 250,
  panel.js 285 — the deletions net them down). test ≤ 450: engine.test.js
  is 434 — the helper matrix gets a NEW file (test/sim/final-hop.test.js),
  NOT an engine.test append.

## Boundary contracts (Step 2)

### 1. finalHop in js/sim/trace-helpers.js (new export)

- `export function finalHop(stage, trace = null)` — pure read; no state.
- NOMINAL table inside the helper: `{ 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 }`.
- Shape branches (the exact union of today's two machines + the panel's
  traceFinalHop intent): stage 6 → `trace.refused ? 3 : trace.nx ? 2 :
trace.cdn ? (edgeStatus === 'HIT' ? 6 : 9) : trace.host ? 9 : 8`;
  stages 1–5 → `trace?.refused ? (stage === 1 ? 2 : 3) : NOMINAL[stage]`.
- Unknown stage falls back to 4 (trace.js's existing default); CHECKS:
  names both consumers (machines terminate their walks; the panel resolves
  denominators) + the DL-3 named counter-example (a refusal is its own
  shape, not a renumber of the served ladder).

### 2. Sim machines consume the helper, not local trees

- trace.js:97-99: `finalStageHop` + trace.refused ternary → `finalHop(stage,
trace)`; the `hop >= finalHop` exit stays as-is; stage-1 refused
  remains 2-hop abort. trace-stage6.js:191-199: the 6-branch tree →
  `finalHop(6, trace)`. Behavior identical — this is a relocation.

### 3. Panel consumers consume the helper

- panel.js: delete TOTAL_HOPS + totalHopsFor + traceFinalHop; the three
  journey call sites use `finalHop(stage, snapshot.trace)`; the Go sweep's
  loop bound uses `finalHop(currentStage)` (nominal — the sweep is the
  healthy-path pacing; the per-hop break after the helper resolves an
  abort at its final hop instead of replaying).
- model.js: TOTAL_HOPS deleted; `describeSnapshot.totalHops` =
  `finalHop(stage, t)`; hopSentences routes its shape dispatch partly
  through the helper (see 4). model-stage6.js: the three literal
  denominators (8, `HIT ? 6 : 9`, 2, 9) → `finalHop(6, t)`.

### 4. Stages 1–4 literals → withHopPrefix(parts, finalHop(stage, t))

- hopSentences' healthy ladders for stages 2–4 (the hand-written `Hop x/N:`
  strings incl. stage-4's dbOpSentence template) are rewritten as bare
  `parts[]` composed through `withHopPrefix(parts, finalHop(stage, t))`.
  Strings byte-identical to today's output (the existing pins are the
  proof; any drift is a red gate). Stage-1 refusal branch: same, with
  `finalHop(1, t)` as the total.

### 5. NEW: stages 1–5 refusal panel shapes (deep-dive option b)

- hopSentences gains a refused shape for stages 2..5 (today only stage 1
  has one): `trace?.refused` → 3 sentences — the stage's existing emit +
  routed sentences (sentences 1–2 of today's ladder) + a third LB card:
  `LoadBalancer (10.1): connection refused — the pool is all-down, nothing
enqueued, nothing served` — built via `withHopPrefix(parts, 3)`, totals
  from `finalHop(stage, t)`. Stage-1's existing 2-hop shape stays the
  precedent. CHECKS: names the DL-3 counter-example (the refusal is not a
  renumber of the served ladder) + the parity rule (sim abort hop ===
  panel total).

## §Tests (titles verbatim — storymap refs; told to place by suite layout)

1. NEW test/sim/final-hop.test.js: `finalHop resolves the shape matrix — stage 1..5 nominal and refusal, stage-6 refusal/nx/cdn-HIT/MISS/host/host-less, and nominal for a null trace` — withHopPrefix-free unit pins over the full matrix.
2. test/panel/model.test.js: `stage-2 refused run narrates the 3-hop abort (DL-3 counter-example: not the served ladder renumbered, no hop 4+/3 residue)`.
3. test/panel/model-stage34.test.js: `stage-3 and stage-4 refused runs narrate the 3-hop abort, not a renumbered served ladder`.
4. test/panel/model-stage5.test.js: `stage-5 refused run narrates the 3-hop abort with the worker ladder absent`.
5. test/panel/model.test.js: `describeSnapshot and the journey relabel resolve an all-down stage-6 run to the 3-hop abort denominator, not the nominal 9`.

## Manifests same-change

- storymap.yaml: ONE story under the SIM slice (helper matrix pin, title
  of test 1) + ONE story under the PANEL slice (tests 2–5 ref list: the
  refusal-shape parity contract). slices.yaml: same refs under the SIM /
  PANEL slices' tests lists. Stories carry no ids (R1b grammar note).

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-02; scope per
      the deep dive + the live post-R1a panel residue listed above).
- [x] Step 2 (Executor sub-agent): cold implementation, `npm run verify`
      green; tick and commit.
- [ ] Step 3 (Lead session): `npm run metrics:extract -- <sessionID>`,
      append entry `R2A-FINALHOP-SEAM`, tick, commit.
