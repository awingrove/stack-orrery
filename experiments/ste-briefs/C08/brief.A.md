You are a subagent spawned by another session.
You are executing Step 2 of the committed factory brief `docs/plans/2026-10-24-editable-fs.md` on branch `feat/editable-fs` (current working directory, stack-orrery). The brief is your contract source of truth — implement cold from it.

Before coding, read in this order:

1. `AGENTS.md` — repo rules (static vanilla-ESM stack, strict CSP: no inline handlers/scripts/styles, determinism in `js/sim/**`, claims vocabulary, manifests same-change, UI must consume the components' actual messages — this slice's whole point is that the filesystem UI becomes the sim's live view).
2. `FACTORY.md`, `DESIGN.md` (the amended "Filesystem & Interface Tables" bullet is your UI contract).
3. The brief — especially its five negative-case contracts.
4. Base setup FIRST: `git merge origin/feat/fs-table-style` — the open PR #16 (its `.fs-list`/`.fs-path` markup, parity CSS, `e2e/webserver-fs.spec.js`, DESIGN.md fs parity sentence, slices.yaml entry) is the starting UI state of the filesystem rows. Resolve conflicts trivially; if DESIGN.md bullets collide keep the longest/superset wording (it was written to include #16's sentences). Do not push that merge separately — it is part of your Step-2 commit's ancestry.
5. Code you extend: `js/sim/webserver.js` (existing `fs` Map + `filesSnapshot` already consumed by `engine.snapshot()` as `servers[i].files`), `js/sim/engine.js`, `js/panel/render.js` (`renderRoutes` matches `data-file`/`data-file-2`; render pipeline calls), `js/panel/panel.js` (control wiring patterns, engine accessor), `panel.html` (WebServer cards' filesystem lists — currently static lis; `panel.html` is at the 550-line cap, removing the static lis must net-reduce it), `css/panel/nodes.css` (`.fs-list` rules from PR #16), `test/sim/webserver.test.js`, `e2e/panel.spec.js`.

Deliverables per brief §1–§4 (all on this branch):

- `js/sim/webserver.js`: `writeFile(path, body)` — validates existing fs key + non-empty string body, throws otherwise; mutates the Map; no cache invalidation anywhere.
- `js/sim/engine.js`: `setWebFile(address, path, body)` — routes to the server by address, throws on miss.
- `js/panel/fs-editor.js` (new): renders each WebServer card's filesystem rows from the snapshot server's `files` (insertion order: `/`, `/about`), preserving `data-file`/`data-file-2`; pencil `.fs-edit` button (real button, hover/focus-revealed via CSS); one row per card in edit mode max: `<input>` + `.fs-commit` (disabled when unchanged/empty) + `.fs-cancel`; Enter commits, Escape cancels; commit calls `engine.setWebFile` then re-renders from the new snapshot. No inline handlers.
- `panel.html`: filesystem lists become empty shells (`#server-fs-list`, `#server-2-fs-list`); delete the static lis; `js/panel/render.js` or the editor module renders into them each render pass (lookups may need the lazy-element pattern `render.js` uses for stage-6 nodes).
- `css/panel/nodes.css`: `.fs-list .route-item` two-column grid (`max-content 1fr`, gap, `align-items: baseline`); body single-line, ellipsis overflow (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0`) + `title` tooltip with the full body. Keep the `.matched-route` good-soft highlight and PR #16's color parity intact.
- Tests: unit — writeFile happy path + fail-loud (unknown path / empty body), stage-3 edit → cached OLD body within TTL and NEW body after TTL expiry (no invalidation), `setWebFile` routing + unknown-address throw; e2e — new `e2e/fs-editor.spec.js`: edit inline on Stage 1 and serve the new bytes; cache-stale on Stage 3 until TTL (counter-example); Escape cancels + commit disabled on unchanged/empty draft; one assertion for grid display + ellipsis computed styles. Test titles exactly as the brief §4 lists them.
- Manifests same-change: `slices.yaml` — PANEL `js:` adds `js/panel/fs-editor.js`, `e2e_specs:` adds `e2e/fs-editor.spec.js`; `storymap.yaml` — attach the new test titles to the filesystem/server story rows (keep names identical).

Hard rules: never weaken a guardrail; `panel.html` must stay ≤ 550 lines after your changes (net line removal from dropping static lis is your headroom — do NOT delete pinned data-testids); determinism in sim; strict claim vocabulary; stages 1–6 behavior and all existing test pins pass unchanged (only the filesystem-row DOM origin changes: rendered instead of static — `e2e/webserver-fs.spec.js` and `renderRoutes` matching must still work).

Gate + close: `npm run verify` (format → lint → unit → guard → e2e). Red gate = fix the named cause; same-gate second rejection = stop and report. Then tick `- [x] Step 2 (Executor sub-agent): …` in the brief and commit everything as `feat(fs): editable WebServer filesystem rendered from the sim's fs Map (editable-fs Step 2)` on `feat/editable-fs`. Do NOT push, do NOT open a PR.

Report back: files added/removed, net `panel.html` line count, test names added, exact verify result, commit hash, and anything in the brief ambiguous or under-pinned.
