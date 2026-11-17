# Step 2 executor — editable WebServer filesystem

You are a subagent spawned by another session. You are executing Step 2 of the committed factory brief `docs/plans/2026-10-24-editable-fs.md` on branch `feat/editable-fs` (current working directory, stack-orrery). The brief is your contract source of truth — implement cold from it.

## Reading order (before coding)

Work through these in order before you touch any file:

1. `AGENTS.md` — repo rules. The static vanilla-ESM stack, strict CSP (no inline handlers/scripts/styles, the server sends `script-src 'self'; style-src 'self'`), determinism in `js/sim/**` (seeded RNG only, no `Math.random()` or `Date.now()`), claims vocabulary (`CHECKS:` / `PINS:` / `DOCUMENTS:`), manifests same-change, and the rule that UI must consume the components' actual messages. This slice's whole point is that the filesystem UI becomes the sim's live view.
2. `FACTORY.md` and `DESIGN.md` — the amended "Filesystem & Interface Tables" bullet in DESIGN.md is your UI contract for this slice.
3. The committed brief itself — especially its five negative-case contracts.
4. Base merge (see below).
5. Code you extend: `js/sim/webserver.js` (existing `fs` Map + `filesSnapshot` already consumed by `engine.snapshot()` as `servers[i].files`), `js/sim/engine.js`, `js/panel/render.js` (`renderRoutes` matches `data-file`/`data-file-2`; render pipeline calls), `js/panel/panel.js` (control wiring patterns, engine accessor), `panel.html` (WebServer cards' filesystem lists — currently static `li`s; `panel.html` is at the 550-line cap, so dropping the static `li`s must net-reduce it), `css/panel/nodes.css` (`.fs-list` rules from PR #16), `test/sim/webserver.test.js`, `e2e/panel.spec.js`.

## Base setup — merge PR #16 first

Run `git merge origin/feat/fs-table-style` before any code changes. Open PR #16's `.fs-list`/`.fs-path` markup, parity CSS, `e2e/webserver-fs.spec.js`, the DESIGN.md fs parity sentence, and its slices.yaml entry are the starting UI state of the filesystem rows. Resolve conflicts trivially; if DESIGN.md bullets collide, keep the longest/superset wording (PR #16 was written to include those sentences, so the superset should cover both). Do not push the merge separately — it is part of your Step-2 commit's ancestry.

## Deliverables

Deliver these per brief §1–§4 (all on this branch):

**`js/sim/webserver.js`** — add `writeFile(path, body)`: validates that the path is an existing fs key and that body is a non-empty string; throws otherwise; mutates the Map; no cache invalidation anywhere.

**`js/sim/engine.js`** — add `setWebFile(address, path, body)`: routes to the server by address, throws on miss.

**`js/panel/fs-editor.js`** (new) — for each WebServer card, renders filesystem rows from the snapshot server's `files` in insertion order (`/`, `/about`), preserving `data-file`/`data-file-2`. Adds a pencil `.fs-edit` button — a real `<button>`, hover/focus-revealed via CSS. At most one row per card in edit mode at a time: `<input>` + `.fs-commit` (disabled when unchanged or empty) + `.fs-cancel`. Enter commits, Escape cancels. Commit calls `engine.setWebFile` then re-renders from the new snapshot. No inline handlers — wire behavior with `addEventListener`.

**`panel.html`** — filesystem lists become empty shells (`#server-fs-list`, `#server-2-fs-list`); delete the static `li`s. `js/panel/render.js` or the editor module renders into them each render pass (lookups may need the lazy-element pattern `render.js` uses for stage-6 nodes). Must stay ≤ 550 lines after the changes — the net line removal from dropping the static `li`s is your headroom. Do not delete pinned data-testids.

**`css/panel/nodes.css`** — `.fs-list .route-item` becomes a two-column grid (`max-content 1fr`, gap, `align-items: baseline`). Body single-line with ellipsis overflow (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0`) plus `title` tooltip with the full body. Keep the `.matched-route` good-soft highlight and PR #16's color parity intact.

## Tests

Unit tests — cover these cases:

- `writeFile` happy path + fail-loud (unknown path / empty body)
- Stage-3 edit → cached OLD body within TTL and NEW body after TTL expiry (no invalidation)
- `setWebFile` routing + unknown-address throw

E2e — new `e2e/fs-editor.spec.js`:

- Edit inline on Stage 1 and serve the new bytes
- Cache-stale on Stage 3 until TTL (counter-example)
- Escape cancels + commit disabled on unchanged/empty draft
- One assertion for grid display + ellipsis computed styles

Test titles must match the brief §4 listings exactly.

## Manifests (same change)

These must change in the same commit as the feature:

- `slices.yaml` — PANEL `js:` adds `js/panel/fs-editor.js`, `e2e_specs:` adds `e2e/fs-editor.spec.js`.
- `storymap.yaml` — attach the new test titles to the filesystem/server story rows, keeping story names identical.

## Hard rules

- Never weaken a guardrail, test, or manifest entry.
- Keep determinism in `js/sim/**` — seeded RNG only, no `Math.random()` or `Date.now()`, time advances by explicit tick.
- Use strict claim vocabulary — guarantee-comments carry `CHECKS:` / `PINS:` / `DOCUMENTS:`; guarantee-language outside a claim is a review defect.
- Stages 1–6 behavior and all existing test pins must pass unchanged — only the filesystem-row DOM origin changes (rendered from the sim's `fs` Map instead of static HTML). `e2e/webserver-fs.spec.js` and `renderRoutes` matching on `data-file`/`data-file-2` must still work.

## Gate & close

Run `npm run verify` (format → lint → unit → guard → e2e). This is the named gate — never reimplement it ad hoc. Red gate = fix the named cause; second rejection of the same gate = stop and report. Never weaken a guardrail, test, or manifest entry to pass.

Tick `- [x] Step 2 (Executor sub-agent): …` in the brief and commit everything as `feat(fs): editable WebServer filesystem rendered from the sim's fs Map (editable-fs Step 2)` on `feat/editable-fs`. Do not push; do not open a PR.

## Report back

Report: files added/removed, net `panel.html` line count, test names added, exact verify result, commit hash, and anything in the brief ambiguous or under-pinned.
