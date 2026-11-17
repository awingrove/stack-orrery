# R3a — mirror labels (Round 1 of 3)

You are the factory executor sub-agent for stack-orrery, working dir
`/home/awingrove/repos/stack-orrery/stack-orrery` on branch
`feat/r3-teaching-truth-batch` (checked out — commit and push HERE; the batch
PR #41 targets it). This is ROUND 1 of 3 (R3a); rounds 2-3 dispatch after your
round lands.

## Setup

Execute Step 2 of the committed brief `docs/plans/2026-11-02-r3a-mirror-labels.md`.
Its ticks show Step 1 unticked, so your first action is to tick `- [x] Step 1`,
then proceed at Step 2 as the first unticked step.

Read in this order: `AGENTS.md`, `FACTORY.md`, `DESIGN.md`, then the brief.
Implement strictly from the brief's contracts — nothing beyond them.

## Code changes

1. `js/panel/inspector-source.js`: replace the header's executable-truth claim
   line with the honest excerpt contract per the brief ("simplified teaching
   excerpts — NOT the executable truth; the real implementation lives at each
   entry's `file` path..."). Export `EXCERPT_NOTE` (the one-line notice), and
   add `excerpt: true` to every COMPONENT_SOURCE entry.
2. `js/panel/inspector-source-stage6.js`: the same header treatment, plus
   `excerpt: true` on every STAGE6_SOURCE entry.
3. The inspector's rendered code panel: grep for the consumer that renders
   COMPONENT_SOURCE entries in the codebase (likely render.js or the inspector
   render path).
   Under the component title, render the notice line — `EXCERPT_NOTE` + the
   entry's `file` path — so the learner always sees "simplified excerpt — real
   source: js/sim/queue.js"-style text above the mirrored code. Add a CHECKS
   comment on the render site naming finding 5-01.

## Test

4. NEW `test/panel/inspector-parity.test.js`, titled verbatim: `the inspector
mirrors carry honest labels and resolvable sources — every entry names a
real js/sim file, every code string names its factory, and the excerpt
notice rides every panel`. It carries the four pins per the brief:
   10-component key parity; `existsSync` on every `file`; every code string
   non-empty and naming its `create*` factory; `EXCERPT_NOTE` non-empty plus
   every entry `excerpt:true`. Then the same four pins over STAGE6_SOURCE.
5. Check e2e for inspector-panel pins that would break on the new notice line
   (grep `e2e/` for inspector text assertions). If one asserts an exact
   full-panel string, update that pin per named cause and note it.

## Manifests (same change)

6. `storymap.yaml`: one story under the PANEL task, titled verbatim per the
   parity pin. `slices.yaml`: the same ref under PANEL's tests list. Stories
   carry no ids.

## Rails and gates

- `inspector-source.js` and `inspector-source-stage6.js` stay ≤ 300 lines; the
  new test file at most 450.
- Run prettier `--write` on every touched file BEFORE commit.
- Run `npm run verify` directly (no pipes) to green. Log reds per named cause;
  fix the named cause, and if the same gate is rejected a second time, stop
  and report.
- Claim vocabulary strict: `CHECKS:` only for guarantee language.

## Close out

Finally, tick Step 2 and commit. Report: commits, files changed with net deltas,
red-gate runs, and one-line decisions per brief gap.
