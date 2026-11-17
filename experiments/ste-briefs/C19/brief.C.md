# C19 — Arm C rewrite (executor brief for stage-6 LB hop unification)

## Role and branch

You are the factory executor sub-agent for stack-orrery. Working directory is `/home/awingrove/repos/stack-orrery/stack-orrery`. You are on branch `feat/r1a-stage6-lb-hop-unification`, which is already checked out. Commit and push here; slice PR #33 targets this branch.

## Starting point and reading order

Execute Step 2 of the committed brief `docs/plans/2026-11-01-r1a-stage6-lb-hop-unification.md`. Step 1 is already ticked, so begin at the first unticked step.

Before implementing, read in this order: `AGENTS.md`, `FACTORY.md`, `DESIGN.md`, then the brief itself. Implement strictly from the brief's Boundary contracts + §Tests + Manifests sections.

## Code changes

- Add a new shared export `lbEnqueueHop` in `js/sim/trace-helpers.js`.
- In `js/sim/trace.js`, the stage-5 LB branch should become a call to this helper and should pass `onRefusal` into `createStage6Trace`.
- In `js/sim/trace-stage6.js`, `chainStep(2)` should use the helper. Its `step()` final-height selection should end a refused trace at hop 3, restarting via the existing `hop >= finalHop` path.
- Stage-6 `freshTrace()` should gain `refused: false` with the CHECKS parity contract.

## Tests

Add the four named tests verbatim to `test/sim/engine.test.js`. Titles must match the brief byte-for-byte — storymap refs will match them the same way. Use the existing create-engine patterns already in that file (for example, seeded runs from the LB skip/refusal tests nearby).

## Manifests (same-change)

- `storymap.yaml`: add ONE story under the SIM slice, using the next unused id, with the brief's exact title and the four verbatim test refs.
- `slices.yaml`: the SIM slice should gain the same story id.

## File-size constraints

- `trace.js` ≤ 300 lines (it shrinks, because branch text moves into the helper).
- `trace-stage6.js` ≤ 300 lines.
- `trace-helpers.js` ≤ 300 lines.
- `engine.test.js` ≤ 450 lines.

Never trim comments or assertions to fit these limits.

## Constraints

- Use strict claim vocabulary.
- No new runtime dependencies.
- Determinism untouched: no `Math.random` or `Date.now` in `js/sim`.

## Commit and gates

Tick `- [x] Step 2` in the brief and commit; keep commits clean and scoped.

Run `npm run verify` directly (no pipes) and get green — you may iterate. On a red gate, fix the named cause. If the same gate rejects a second time, stop and report.

## Report back

Report: commits (hash + message), files changed, red-gate runs before green, and a one-line note of anything you had to decide that the brief left open.
