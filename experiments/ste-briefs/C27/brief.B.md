# Brief B: R3a mirror labels

You are the factory executor sub-agent for `stack-orrery`.

Working directory: `/home/awingrove/repos/stack-orrery/stack-orrery`.
Branch: `feat/r3-teaching-truth-batch` (checked out).
Commit and push here. The batch PR `#41` targets this branch.
This is ROUND 1 of 3 (R3a). Rounds 2 and 3 dispatch after this round lands.

## Steps

1. Read the committed brief `docs/plans/2026-11-02-r3a-mirror-labels.md`. Execute Step 2 of this brief.
2. The brief ticks show Step 1 unticked. First, tick `- [x] Step 1`. Then proceed at Step 2 as the first unticked step.
3. Read `AGENTS.md`, `FACTORY.md`, `DESIGN.md`, and then the brief, in this order.
4. Implement strictly from the brief's contracts.
5. Open `js/panel/inspector-source.js`.
   - Replace the header's executable-truth claim line. Use the honest excerpt contract per the brief. The contract text is:

     > "simplified teaching excerpts — NOT the executable truth; the real implementation lives at each entry's `file` path…"

   - Export `EXCERPT_NOTE` (the one-line notice).
   - Add `excerpt: true` to every COMPONENT_SOURCE entry.
6. Open `js/panel/inspector-source-stage6.js`. Apply the same header treatment. Add `excerpt: true` to every STAGE6_SOURCE entry.
7. Grep for the consumer that renders COMPONENT_SOURCE entries. The consumer is likely `render.js` or the inspector render path.
8. Render the notice line under the component title in the inspector's rendered code panel. The notice line is `EXCERPT_NOTE` plus the entry's `file` path. The learner then always sees "simplified excerpt — real source: js/sim/queue.js"-style text above the mirrored code.
9. Add a `CHECKS:` comment on the render site. The comment names finding 5-01.
10. Create the new test file `test/panel/inspector-parity.test.js`. Title it with this verbatim string:

    `the inspector mirrors carry honest labels and resolvable sources — every entry names a real js/sim file, every code string names its factory, and the excerpt notice rides every panel`

    The test carries the four pins per the brief:
    - 10-component key parity
    - `existsSync` on every `file`
    - every code string is non-empty and names its `create*` factory
    - `EXCERPT_NOTE` is non-empty and every entry carries `excerpt:true`

    The test also carries the same four pins over STAGE6_SOURCE.

11. Grep `e2e/` for inspector text assertions. Find inspector-panel pins that break on the new notice line. If one pin asserts an exact full-panel string, update that pin per the named cause. Note the update.
12. Update `storymap.yaml` in the same change. Add one story under the PANEL task. Title the story verbatim per the parity pin.
13. Update `slices.yaml`. Add the same ref under the PANEL tests list. Stories must not carry ids.
14. `inspector-source.js` and `inspector-source-stage6.js` must stay at 300 lines or fewer.
15. The new test file must stay at 450 lines or fewer.
16. Before the commit, run `prettier --write` on every touched file.
17. Run `npm run verify` directly, with no pipes, to green. Log each red with its named cause.
18. On a red gate, fix the named cause. On a second rejection of the same gate, stop and report.
19. Apply the claim vocabulary strictly. Use `CHECKS:` only for guarantee language.
20. Tick Step 2. Commit.
21. Report these items: commits, files changed with net deltas, red-gate runs, and one-line decisions per brief gap.
