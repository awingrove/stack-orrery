# C27 — requirements extracted from arm A

Source: `brief.A.md` (dispatch text exactly as received). The committed brief
`docs/plans/2026-11-02-r3a-mirror-labels.md` is an arm-independent instruction
file present in the start commit.

1. Work in `/home/awingrove/repos/stack-orrery/stack-orrery` on branch `feat/r3-teaching-truth-batch` (checked out) — commit and push HERE; the batch PR #41 targets it.
2. This is ROUND 1 of 3 (R3a); rounds 2-3 dispatch after this round lands.
3. Execute Step 2 of the committed brief `docs/plans/2026-11-02-r3a-mirror-labels.md`.
4. First action: tick `- [x] Step 1` in the brief (its ticks show Step 1 unticked), then proceed at Step 2 as the first unticked step.
5. Read `AGENTS.md`, `FACTORY.md`, `DESIGN.md`, then the brief, in that order.
6. Implement strictly from the brief's contracts.
7. In `js/panel/inspector-source.js`: replace the header's executable-truth claim line with the honest excerpt contract per the brief ("simplified teaching excerpts — NOT the executable truth; the real implementation lives at each entry's `file` path…").
8. Export `EXCERPT_NOTE` (the one-line notice).
9. Add `excerpt: true` to every COMPONENT_SOURCE entry.
10. In `js/panel/inspector-source-stage6.js`: the same header treatment + `excerpt: true` on every STAGE6_SOURCE entry.
11. In the inspector's rendered code panel (grep the consumer that renders COMPONENT_SOURCE entries — likely render.js or the inspector render path): render the notice line under the component title — `EXCERPT_NOTE` + the entry's `file` path — so the learner always sees "simplified excerpt — real source: js/sim/queue.js"-style text above the mirrored code.
12. Add a CHECKS comment on the render site naming finding 5-01.
13. Deliver NEW `test/panel/inspector-parity.test.js` titled verbatim: `the inspector mirrors carry honest labels and resolvable sources — every entry names a real js/sim file, every code string names its factory, and the excerpt notice rides every panel`.
14. That test carries the four pins per the brief: 10-component key parity; `existsSync` on every `file`; every code string non-empty + naming its `create*` factory; `EXCERPT_NOTE` non-empty + every entry `excerpt:true`; and the same four over STAGE6_SOURCE.
15. Check e2e for inspector-panel pins that would break on the new notice line (grep `e2e/` for inspector text assertions); if one asserts an exact full-panel string, update that pin per named cause and note it.
16. Manifest same-change: `storymap.yaml` — one story under the PANEL task titled verbatim per the parity pin.
17. `slices.yaml` — the same ref under PANEL's tests list. Stories carry no ids.
18. `inspector-source.js` + `inspector-source-stage6.js` ≤ 300 lines.
19. The new test file ≤ 450 lines.
20. Run prettier `--write` on every touched file BEFORE commit.
21. Run `npm run verify` directly (no pipes) to green; reds logged per named cause.
22. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
23. Claim vocabulary strict (CHECKS: only for guarantee language).
24. Tick Step 2 and commit.
25. Report: commits, files changed with net deltas, red-gate runs, one-line decisions per brief gap.
