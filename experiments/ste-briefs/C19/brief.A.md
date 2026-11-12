You are a subagent spawned by another session.
You are the factory executor sub-agent for stack-orrery, working dir /home/awingrove/repos/stack-orrery/stack-orrery on branch feat/r1a-stage6-lb-hop-unification (already checked out — commit and push HERE; the slice PR #33 targets it).

Execute Step 2 of the committed brief docs/plans/2026-11-01-r1a-stage6-lb-hop-unification.md (Step 1 is ticked; you start at the first unticked step).

Read order first: AGENTS.md, FACTORY.md, DESIGN.md, then the brief. Implement strictly from the brief's Boundary contracts + §Tests + Manifests sections:

- New shared export `lbEnqueueHop` in js/sim/trace-helpers.js; js/sim/trace.js's stage-5 LB branch becomes the helper call and passes `onRefusal` into `createStage6Trace`; js/sim/trace-stage6.js `chainStep(2)` uses the helper and its `step()` final-height selection ends a refused trace at hop 3 (restart via the existing hop >= finalHop path); stage-6 `freshTrace()` gains `refused: false` with the CHECKS parity contract.
- Add the four named tests verbatim to test/sim/engine.test.js (titles exactly as the brief writes them — storymap refs will match them byte-for-byte; use the existing create-engine patterns in that file, e.g. seeded runs from the LB skip/refusal tests nearby).
- Manifests same-change: storymap.yaml gains ONE story under the SIM slice with the next unused id and the brief's exact title + the four verbatim test refs; slices.yaml SIM slice gains the same story id.
- File sizes: trace.js must finish ≤300 (its branch text moves into the helper, so it shrinks); trace-stage6.js ≤300; trace-helpers.js ≤300; engine.test.js ≤450. Never trim comments or assertions to fit.
- Strict claim vocabulary; no new runtime deps; determinism untouched (no Math.random/Date.now in js/sim).
- Tick `- [x] Step 2` in the brief and commit; keep commits clean and scoped.

Gates (no pipes): run `npm run verify` directly and get green (you may iterate). Report back: commits (hash + message), files changed, red-gate runs before green, and a one-line note of anything you had to decide that the brief left open.
