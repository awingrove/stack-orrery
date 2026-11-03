# R3b — teaching prose binds to the trace machines' own vocabulary (batch round 2 of 3)

Paydown for full-review finding 5-02 (recommendations.md Stage R3b): the
teaching drawer's stage tables quote sim-output fragments ("STALE (lag
3t)", hop denominators, "Routed: 3") with no mechanical tie — a trace
reword leaves the drawer silently stale. The fix: the trace machines
export their vocabulary; the drawer's quoted fragments consume it; a
round-trip unit pin proves every quoted token appears verbatim in a real
walk.

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps.
- File sizes: trace.js 281/300, trace-stage6.js 257/300 — the exports are
  a few lines each; teaching.js 181 — the binding must not balloon it;
  all ≤ 300 hard. Deterministic sim (guard bites). Claim vocabulary strict.

## Boundary contracts (Step 2)

### 1. TRACE_VOCAB exports (js/sim/trace-helpers.js — the shared seam)

- NEW export `TRACE_VOCAB` — a frozen object of the machines' literal
  output tokens, assembled from what the machines actually mint (grep the
  frame sites first; the drawer's quoted fragments map onto these):
  `staleTag: (lag) => `STALE (lag ${lag}t)`` (composed from
DEFAULT_REPLICATION_LAG_TICKS — the R2b home), `refusedCard` /
`lbRefusedToken` ('connection refused (nothing enqueued)'),
`skipSuffix: (seat) => `— ${seat} is down — skipped``,
  `routedToken: 'Routed:'`, `idleWorker: 'idle — no async jobs in this
trace'`, `nxCard: 'NX no record'`, plus any token the drawer quotes
  that the walk finds (the executor greps teaching.js's quoted strings
  and maps each to its minting site — every token named in the map with
  its source file:line in a comment).
- CHECKS: names finding 5-02 + the binding rule (the drawer never
  re-authors sim vocabulary).

### 2. teaching.js binds, prose stays

- Every quoted fragment in the drawer tables that claims to quote sim
  output becomes a template interpolation of the TRACE_VOCAB token (the
  prose around it stays hand-written — the binding is the quoted token,
  not the sentence). E.g. 'GET immediately after — hop 5/7 names
  "STALE (lag 3t)" mid-trace' → the 'STALE (lag 3t)' part interpolates
  `TRACE_VOCAB.staleTag(DEFAULT_REPLICATION_LAG_TICKS)`.
- The rendered drawer text is byte-identical today (the tokens compose to
  the same strings the machines mint).

### 3. Round-trip pin (NEW test/panel/teaching-vocab.test.js)

- Title verbatim: `every quoted sim fragment in the teaching tables appears verbatim in a real walk of that stage — the drawer cannot go stale silently`.
- For each stage 1..6: run the engine's canonical walk (the same
  scenario shape engine.test.js uses per stage), concatenate the frames,
  and assert every QUOTED token in that stage's drawer entry appears
  verbatim in the walk output (token-by-token, extracted from the
  bound template — the test reads TRACE_VOCAB itself, so a reworded
  machine token makes the pin fail and the drawer follows).

## §Tests

- The new round-trip file; teaching.test.js's existing pins stay green
  (byte-identical rendering); no other surface.

## Manifests same-change

- storymap.yaml: one story under the PANEL task titled verbatim per the
  round-trip pin; slices.yaml: same ref under PANEL's tests list.

## Ticks

- [x] Step 1 (Lead session): human sign-off (batch round 2; option (b)
      binding gated 2026-11-02).
- [x] Step 2 (Executor sub-agent): cold implementation; `npm run verify`
      green; tick and commit.
- [ ] Step 3 (Lead session): probe + telemetry `R3B-TEACHING-VOCAB` +
      tick, commit.
