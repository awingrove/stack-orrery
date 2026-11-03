# R3c — hop-targets: pin truth + the adjudicated tuple tables (batch round 3 of 3)

Paydown for full-review findings 4-01 + 4-04 + 6-07(#1) (recommendations.md
Stage R3c). Three truths in one slice: the module's header claims unit pins
that do not exist (4-01 — the claim-vocabulary defect, closed by the new
pin file + honest header); the five per-stage owner/lane matrices collapse
to the gemini-adjudicated tuple-table shape (4-04: `refactor-minimally`,
~45% shorter); the mapping gets its first real unit file (6-07's priority-1
target).

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps.
- File sizes: hop-targets.js ends ≤ 120 (from 197 — the adjudicated
  shape); the new test file ≤ 450; every touched file prettier-clean.

## Boundary contracts (Step 2)

### 1. The adjudicated tuple-table refactor (js/panel/hop-targets.js)

- Each stage's mapping becomes ONE indexed table of `[cardId, laneId]`
  tuples with a small `pick(table, hop, fallback)` helper;
  `backendCard`/`dbLane` hoisted once into `activeHopTarget`.
- NO cross-stage splice/insertion builder (the adjudication's keep-rule:
  each stage's story stays explicit and self-contained — the Gemini
  verdict's exact rationale: stages are not pure additive insertions;
  hiding stage differences behind index arithmetic violates the readable
  conceptual-model goal).
- PRESERVED VERBATIM (the adjudication's invariant list):
  the stage-6 → stage-5 `hop - 2` delegation (hop-targets.js:120) — a
  load-bearing domain invariant (a hosted non-CDN request is the 2-hop
  DNS prelude followed by the full stage-5 chain shifted +2);
  the fallback semantics per path (stage-6 hosted non-CDN `hop <= 2` →
  `{ cardId: undefined, laneId: undefined }`; all other out-of-range
  paths → `{ cardId: 'node-browser', laneId: 'packet-req-left' }`;
  stage-5 asyncJob hop 5 hardcodes 'node-webserver' while sync hop 5
  uses the backendCard);
  the cdnHopTarget branch shape (edgeStatus HIT 6-hop vs MISS/PASS 9-hop).
- Target shape ~105–115 lines (the adjudication's estimate; the honest
  measure is "every hop's (card, lane) pairing visible on one line").

### 2. The header tells the truth (finding 4-01's fix)

- The false claim ("unit-pinned shapes in test/panel/render.test.js and
  model-stage6.test.js") is REPLACED by the real pin reference: the new
  unit file + the e2e paths that exercise the mapping
  (e2e/panel-stage6.spec.js's active-hop/lane-active selectors).
- CHECKS: the PINS: claim names a real, resolvable pin per the AGENTS.md
  TD-6 rule (an aspirational pin is a defect).

### 3. The unit file (NEW test/panel/hop-targets.test.js)

- Title verbatim: `the hop mapping is pinned — stage 1..4 chains switch on targetServer and dbOp, stage-5 async vs sync counter-examples, and stage-6 reuses stage-5 at hop - 2 with the DNS prelude`.
- Pins per the 6-07 deep-dive's contract surface: stage 1–4 chains
  (`node-webserver` vs `node-webserver-2` on `trace.targetServer ===
'10.12'`; `packet-req-db` vs `packet-res-db` on `trace.dbOp ===
'WRITE'`); stage-5 asyncJob counter-example (hop 4 → node-queue/
  packet-req-queue vs node-db; hop 8 → packet-res-db vs
  packet-res-worker); stage-6 host-less verbatim reuse; hosted DNS
  prelude (hops 1–2 → node-dns/packet-req-dns + node-browser/
  packet-res-dns before the +2 shift); CDN HIT 6-hop vs MISS/PASS 9-hop.

## §Tests

- The new unit file only; e2e untouched (the unit file is the contract;
  the e2e class-assertion gap is noted as optional follow-up, not batch
  scope).

## Manifests same-change

- storymap.yaml: one story under the PANEL task titled verbatim per the
  unit file's title; slices.yaml: same ref under PANEL's tests list.

## Ticks

- [ ] Step 1 (Lead session): human sign-off (batch round 3; gemini-
      adjudicated shape gated 2026-11-02).
- [ ] Step 2 (Executor sub-agent): cold implementation; `npm run verify`
      green; tick and commit.
- [ ] Step 3 (Lead session): probe + telemetry `R3C-HOP-TARGETS-TRUTH` +
      tick, commit.
