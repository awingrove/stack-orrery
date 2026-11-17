You are a subagent spawned by another session.
You are the factory executor sub-agent for stack-orrery, working dir /home/awingrove/repos/stack-orrery/stack-orrery on branch feat/r3-teaching-truth-batch (checked out — commit and push HERE; the batch PR #41 targets it). This is ROUND 1 of 3 (R3a); rounds 2-3 dispatch after your round lands.

Execute Step 2 of the committed brief docs/plans/2026-11-02-r3a-mirror-labels.md (the brief's ticks show Step 1 unticked — first action: tick `- [x] Step 1`, then proceed at Step 2 as the first unticked step).

Read order: AGENTS.md, FACTORY.md, DESIGN.md, then the brief. Implement strictly from the brief's contracts:

1. `js/panel/inspector-source.js`: replace the header's executable-truth claim line with the honest excerpt contract per the brief ("simplified teaching excerpts — NOT the executable truth; the real implementation lives at each entry's `file` path..."); export `EXCERPT_NOTE` (the one-line notice); add `excerpt: true` to every COMPONENT_SOURCE entry.
2. `js/panel/inspector-source-stage6.js`: the same header treatment + `excerpt: true` on every STAGE6_SOURCE entry.
3. The inspector's rendered code panel (grep the consumer that renders COMPONENT_SOURCE entries — likely render.js or the inspector render path): render the notice line under the component title — `EXCERPT_NOTE` + the entry's `file` path, so the learner always sees "simplified excerpt — real source: js/sim/queue.js"-style text above the mirrored code. CHECKS on the render site naming finding 5-01.
4. NEW `test/panel/inspector-parity.test.js` titled verbatim: `the inspector mirrors carry honest labels and resolvable sources — every entry names a real js/sim file, every code string names its factory, and the excerpt notice rides every panel` — the four pins per the brief (10-component key parity; existsSync on every `file`; every code string non-empty + naming its create* factory; EXCERPT_NOTE non-empty + every entry excerpt:true; the same four over STAGE6_SOURCE).
5. Check e2e for inspector-panel pins that would break on the new notice line (grep e2e/ for inspector text assertions); if one asserts an exact full-panel string, update that pin per named cause and note it.
6. Manifest same-change: storymap.yaml — one story under the PANEL task titled verbatim per the parity pin; slices.yaml — same ref under PANEL's tests list. Stories carry no ids.

Rails: inspector-source.js + inspector-source-stage6.js ≤ 300; the new test file ≤ 450; prettier --write every touched file BEFORE commit; `npm run verify` directly (no pipes) to green; reds logged per named cause; claim vocabulary strict (CHECKS: only for guarantee language). Then tick Step 2 and commit. Report: commits, files changed with net deltas, red-gate runs, one-line decisions per brief gap.
