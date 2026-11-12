# C19 — requirements extracted from arm A

Source: `brief.A.md` (dispatch text exactly as received). The committed brief
`docs/plans/2026-11-01-r1a-stage6-lb-hop-unification.md` is an
arm-independent instruction file present in the start commit.

1. Work in `/home/awingrove/repos/stack-orrery/stack-orrery` on branch `feat/r1a-stage6-lb-hop-unification` (already checked out) — commit and push HERE; the slice PR #33 targets it.
2. Execute Step 2 of the committed brief `docs/plans/2026-11-01-r1a-stage6-lb-hop-unification.md` (Step 1 is ticked; start at the first unticked step).
3. Read `AGENTS.md`, `FACTORY.md`, `DESIGN.md`, then the brief, in that order, before implementing.
4. Implement strictly from the brief's Boundary contracts + §Tests + Manifests sections.
5. Add a new shared export `lbEnqueueHop` in `js/sim/trace-helpers.js`.
6. `js/sim/trace.js`'s stage-5 LB branch becomes the helper call and passes `onRefusal` into `createStage6Trace`.
7. `js/sim/trace-stage6.js` `chainStep(2)` uses the helper; its `step()` final-height selection ends a refused trace at hop 3 (restart via the existing hop >= finalHop path).
8. Stage-6 `freshTrace()` gains `refused: false` with the CHECKS parity contract.
9. Add the four named tests verbatim to `test/sim/engine.test.js` (titles exactly as the brief writes them — storymap refs match them byte-for-byte; use the existing create-engine patterns in that file, e.g. seeded runs from the LB skip/refusal tests nearby).
10. Manifests same-change: `storymap.yaml` gains ONE story under the SIM slice with the next unused id and the brief's exact title plus the four verbatim test refs.
11. `slices.yaml` SIM slice gains the same story id.
12. File sizes: `trace.js` ≤ 300 (it shrinks), `trace-stage6.js` ≤ 300, `trace-helpers.js` ≤ 300, `engine.test.js` ≤ 450; never trim comments or assertions to fit.
13. Use strict claim vocabulary.
14. No new runtime dependencies.
15. Determinism untouched (no `Math.random`/`Date.now` in `js/sim`).
16. Tick `- [x] Step 2` in the brief and commit; keep commits clean and scoped.
17. Run `npm run verify` directly (no pipes) and get green; you may iterate.
18. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
19. Report back: commits (hash + message), files changed, red-gate runs before green, and a one-line note of anything you had to decide that the brief left open.
