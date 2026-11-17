# C08 — requirements extracted from arm A

Source: `brief.A.md` (dispatch text exactly as received). The committed brief
`docs/plans/2026-10-24-editable-fs.md` is an arm-independent instruction file
present in the start commit.

1. Treat the committed brief (`docs/plans/2026-10-24-editable-fs.md`) as the contract source of truth; implement cold from it.
2. Execute Step 2 of that brief on branch `feat/editable-fs` in the current working directory (stack-orrery).
3. Before coding, read `AGENTS.md` (static vanilla-ESM stack, strict CSP — no inline handlers/scripts/styles, determinism in `js/sim/**`, claims vocabulary, manifests same-change, UI must consume the components' actual messages).
4. Before coding, read `FACTORY.md` and `DESIGN.md` (the amended "Filesystem & Interface Tables" bullet is the UI contract).
5. Before coding, read the brief, especially its five negative-case contracts.
6. Before coding, run `git merge origin/feat/fs-table-style` (open PR #16) as base setup — its `.fs-list`/`.fs-path` markup, parity CSS, `e2e/webserver-fs.spec.js`, DESIGN.md fs parity sentence, and slices.yaml entry are the starting UI state of the filesystem rows.
7. Resolve merge conflicts trivially; if DESIGN.md bullets collide, keep the longest/superset wording.
8. Do not push the merge separately — it is part of the Step-2 commit's ancestry.
9. Before coding, read the listed code you extend: `js/sim/webserver.js`, `js/sim/engine.js`, `js/panel/render.js`, `js/panel/panel.js`, `panel.html`, `css/panel/nodes.css`, `test/sim/webserver.test.js`, `e2e/panel.spec.js`.
10. In `js/sim/webserver.js`, deliver `writeFile(path, body)`: validates an existing fs key and a non-empty string body, throws otherwise; mutates the Map; no cache invalidation anywhere.
11. In `js/sim/engine.js`, deliver `setWebFile(address, path, body)`: routes to the server by address, throws on miss.
12. Deliver new `js/panel/fs-editor.js`: renders each WebServer card's filesystem rows from the snapshot server's `files`, in insertion order (`/`, `/about`), preserving `data-file`/`data-file-2`.
13. The editor renders a pencil `.fs-edit` button — a real button, hover/focus-revealed via CSS.
14. At most one row per card is in edit mode: an `<input>` plus `.fs-commit` (disabled when unchanged or empty) plus `.fs-cancel`.
15. Enter commits; Escape cancels.
16. Commit calls `engine.setWebFile` then re-renders from the new snapshot.
17. No inline handlers.
18. In `panel.html`: filesystem lists become empty shells (`#server-fs-list`, `#server-2-fs-list`); delete the static `li`s; render into them each render pass (use the lazy-element pattern `render.js` uses for stage-6 nodes if lookups need it).
19. `panel.html` must stay ≤ 550 lines after the changes; the net line removal from dropping the static `li`s is the headroom.
20. Do not delete pinned data-testids.
21. In `css/panel/nodes.css`: `.fs-list .route-item` becomes a two-column grid (`max-content 1fr`, gap, `align-items: baseline`).
22. Body renders single-line with ellipsis overflow (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0`) plus a `title` tooltip with the full body.
23. Keep the `.matched-route` good-soft highlight and PR #16's color parity intact.
24. Unit tests: writeFile happy path + fail-loud (unknown path / empty body); stage-3 edit → cached OLD body within TTL and NEW body after TTL expiry (no invalidation); `setWebFile` routing + unknown-address throw.
25. E2e: new `e2e/fs-editor.spec.js` — edit inline on Stage 1 and serve the new bytes; cache-stale on Stage 3 until TTL (counter-example); Escape cancels + commit disabled on unchanged/empty draft; one assertion for grid display + ellipsis computed styles.
26. Test titles exactly as the brief §4 lists them.
27. Manifests same-change: `slices.yaml` — PANEL `js:` adds `js/panel/fs-editor.js`, `e2e_specs:` adds `e2e/fs-editor.spec.js`.
28. `storymap.yaml` — attach the new test titles to the filesystem/server story rows, keeping names identical.
29. Never weaken a guardrail.
30. Keep determinism in sim.
31. Use strict claim vocabulary.
32. Stages 1–6 behavior and all existing test pins pass unchanged — only the filesystem-row DOM origin changes (rendered instead of static); `e2e/webserver-fs.spec.js` and `renderRoutes` matching must still work.
33. Run `npm run verify` (format → lint → unit → guard → e2e) to green.
34. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
35. Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
36. Commit everything as `feat(fs): editable WebServer filesystem rendered from the sim's fs Map (editable-fs Step 2)` on `feat/editable-fs`.
37. Do not push; do not open a PR.
38. Report back: files added/removed, net `panel.html` line count, test names added, exact verify result, commit hash, and anything in the brief ambiguous or under-pinned.
