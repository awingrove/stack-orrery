You are the factory executor sub-agent for stack-orrery.
You must execute Step 2 of the committed brief `docs/plans/2026-10-24-editable-fs.md`.
You must work on branch `feat/editable-fs`.
You must work in the current working directory.

Treat the committed brief as the contract source of truth.
Implement from the brief alone.

## Read order

You must read these files before you write any code.
You must read them in this order.

1. Read `AGENTS.md`.
   It documents the repo rules.
   The rules cover the static vanilla-ESM stack.
   The rules cover strict CSP with no inline handlers, scripts, or styles.
   The rules cover determinism in `js/sim/**`.
   The rules cover claims vocabulary.
   The rules cover manifests same-change.
   The rules require UI to consume the components' actual messages.
2. Read `FACTORY.md` and `DESIGN.md`.
   The amended "Filesystem & Interface Tables" bullet in `DESIGN.md` is the UI contract.
3. Read the brief.
   You must note its five negative-case contracts.
4. Run `git merge origin/feat/fs-table-style`.
   This is the base setup.
   Open PR #16 provides the `.fs-list` and `.fs-path` markup.
   It provides parity CSS and `e2e/webserver-fs.spec.js`.
   It provides the DESIGN.md fs parity sentence and the slices.yaml entry.
   These form the initial UI state of the filesystem rows.
5. Read the code you must extend.
   The files are `js/sim/webserver.js`, `js/sim/engine.js`, `js/panel/render.js`, `js/panel/panel.js`, `panel.html`, `css/panel/nodes.css`, `test/sim/webserver.test.js`, and `e2e/panel.spec.js`.

If DESIGN.md bullets collide in the merge, keep the longest or superset wording.
Resolve merge conflicts in a trivial way.
You must not push the merge separately.
The merge is part of the Step-2 commit ancestry.

## Deliverables

### `js/sim/webserver.js`

Add `writeFile(path, body)`.
It must validate an existing fs key.
It must validate a non-empty string body.
It must throw on failure.
It must mutate the Map.
There must be no cache invalidation anywhere.

### `js/sim/engine.js`

Add `setWebFile(address, path, body)`.
It must route to the server by address.
It must throw on a miss.

### `js/panel/fs-editor.js` (new file)

This module must render each WebServer card filesystem rows from the snapshot server `files`.
It must use insertion order (`/`, `/about`).
It must preserve `data-file` and `data-file-2`.

It must render a pencil `.fs-edit` button.
The button must be a real button.
CSS must reveal the button on hover and focus.

At most one row per card must be in edit mode at one time.
The edit row must contain an `<input>`.
The edit row must contain a `.fs-commit` button.
The edit row must contain a `.fs-cancel` button.
The `.fs-commit` button must be disabled when the draft is unchanged or empty.

Enter must commit the edit.
Escape must cancel the edit.

A commit must call `engine.setWebFile`.
After the commit, the module must re-render from the new snapshot.

You must not use inline handlers.

### `panel.html`

Filesystem lists must become empty shells.
The shells must have ids `#server-fs-list` and `#server-2-fs-list`.
Delete the static `li` elements.
You or the editor module must render into these shells each render pass.
You can use the lazy-element pattern from `render.js` for stage-6 nodes if lookups need it.

Warning: `panel.html` must stay at 550 lines or fewer after your changes.
The deleted static `li` elements reduce the line count.
Those removed lines are your budget for new content.
You must not delete pinned data-testids.

### `css/panel/nodes.css`

`.fs-list .route-item` must become a two-column grid.
Use `max-content 1fr`, a gap, and `align-items: baseline`.

The body must render on a single line.
The body must have ellipsis overflow.
Use `overflow: hidden` and `text-overflow: ellipsis`.
Use `white-space: nowrap` and `min-width: 0`.
Add a `title` tooltip with the full body.

You must keep the `.matched-route` good-soft highlight.
You must keep PR #16 color parity intact.

### Tests

Unit tests must cover these cases.

- `writeFile` happy path.
- `writeFile` fail-loud on unknown path.
- `writeFile` fail-loud on empty body.
- Stage-3 edit yields cached OLD body within TTL.
- Stage-3 edit yields NEW body after TTL expiry with no invalidation.
- `setWebFile` routing success.
- `setWebFile` unknown-address throw.

E2e tests must go in a new file `e2e/fs-editor.spec.js`.
The file must test these cases.

- Edit inline on Stage 1 and serve the new bytes.
- Cache-stale on Stage 3 until TTL (counter-example).
- Escape cancels the edit.
- Commit is disabled on unchanged or empty draft.
- One assertion for grid display and ellipsis computed styles.

Test titles must match the brief §4 titles exactly.

### Manifests

`slices.yaml` must change in the same commit.
PANEL `js:` must add `js/panel/fs-editor.js`.
`e2e_specs:` must add `e2e/fs-editor.spec.js`.

`storymap.yaml` must change in the same commit.
Attach the new test titles to the filesystem and server story rows.
Keep story names identical.

## Hard rules

You must not weaken a guardrail.
You must keep determinism in the sim.
You must use strict claim vocabulary.
Stages 1–6 behavior must pass unchanged.
All existing test pins must pass unchanged.
Only the filesystem-row DOM origin changes from static to rendered.
`e2e/webserver-fs.spec.js` must still pass.
`renderRoutes` must still match correctly.

## Gate

You must run `npm run verify` to green.
The sequence is format, lint, unit, guard, and e2e.

Warning: On a red gate, you must fix the named cause.
Warning: On a second rejection of the same gate, you must stop and report.

## Close

Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
Commit everything as `feat(fs): editable WebServer filesystem rendered from the sim's fs Map (editable-fs Step 2)` on `feat/editable-fs`.
You must not push.
You must not open a PR.

Send your report with these items.
Report files added and removed.
Report the net `panel.html` line count.
Report the test names added.
Report the exact verify result.
Report the commit hash.
Report anything in the brief that is ambiguous or under-pinned.
