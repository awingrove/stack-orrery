# Editable WebServer filesystem — aligned two-column rows + inline editing

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Execute mechanically from Step 2 and keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test assertion, threshold, or manifest rule.
- **Zero runtime dependencies; no inline handlers/styles** (strict CSP — wire
  the editor with `addEventListener` in external JS).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Strict `CHECKS:`, `PINS:`, `DOCUMENTS:` tags only.
- **File size.** js/css ≤ 300, tests ≤ 450, `panel.html` ≤ 550 (at the cap —
  the static filesystem lis you remove free the headroom you need; never
  delete a pinned `data-testid` to fit).
- **Base:** commence from `origin/main`; first `git merge
origin/feat/fs-table-style` (open PR #16 — its `.fs-list` spans, parity CSS,
  `e2e/webserver-fs.spec.js`, and slices entry are the starting UI state;
  resolve trivially, do not revert it).
- **Same-change manifests:** `slices.yaml` (+ `storymap.yaml` if refs change)
  in the same commit as the feature.

## Negative-case contracts (DL-3/DL-4)

- **UI is the sim's view (DL-1 class).** Filesystem rows render FROM the
  snapshot (`servers[i].files`); no static row markup remains in
  `panel.html`. Named counter-example: after
  `engine.setWebFile('10.11', '/about', 'New body')`, the row, the next
  served `GET /about` record, and the browser card body all show `New body`.
- **Cache staleness branch.** An edit does NOT invalidate the Cache: on
  stage ≥ 3, a `GET /about` inside the entry's TTL after an edit returns the
  OLD body with a cache HIT; the new body serves only after TTL expiry.
  Named counter-example: a POST-style cache write-through invalidation must
  not happen on edit (stage 4 keeps db semantics; edit is not a POST). §Tests pin it.
- **Fail-loud branch.** `writeFile`/`setWebFile` with an unknown path, an
  unknown address, or an empty/non-string body throws (DL-1). §Tests pin it.
- **Editor branch.** At most one row per card is in edit mode; Escape
  restores the original value; the commit control is disabled while the
  draft is unchanged or empty; committing with a valid draft writes the sim
  and re-renders from the snapshot.
- **Highlight/parity survives.** `renderRoutes()`' `data-file` / `data-file-2`
  matching and the `.matched-route` highlight behave on rendered rows exactly
  as on today's static rows; `e2e/webserver-fs.spec.js` (PR #16 parity pins)
  keeps passing unchanged.

## Pre-decided boundary contracts

### 1. `js/sim/webserver.js` — `writeFile(path, body)`

- Validates `path` is an existing `fs` key and `body` is a non-empty string;
  throws otherwise. Mutates the Map; deterministic; touches nothing else.
- Cached copies age out by TTL only (no invalidation helper, no hooks).

### 2. `js/sim/engine.js` — `setWebFile(address, path, body)`

- Finds the server whose `address` matches in `servers`; throws on miss;
  delegates to `writeFile`. Nothing new in `snapshot()`
  (`servers[i].files` already present).

### 3. `js/panel/fs-editor.js` (new module) + `render.js` / `panel.html`

- New module owns both cards' filesystem lists: renders rows from the
  snapshot server's `files` in original insertion order (`/`, then `/about`),
  preserving `data-file` / `data-file-2` attributes (stage-1 server =
  first server; second card = second server).
- Rows: `path` in `.fs-path` span + body text; pencil button `.fs-edit`
  (real `<button type="button">`, hover/focus-revealed); per-card one row
  swaps to `<input>` + `.fs-commit` (✔, disabled when unchanged/empty) +
  `.fs-cancel` (✕); Enter = commit, Escape = cancel; commit calls
  `engine.setWebFile(...)` then re-renders from the new snapshot. Wiring in
  the module; `panel.js` passes the engine accessor, no inline handlers.
- `panel.html`: lists become empty `#server-fs-list` /
  `#server-2-fs-list` shells (rendered by the module); remove the static lis.
- `css/panel/nodes.css`: `.fs-list .route-item` becomes a two-column grid
  (`grid-template-columns: max-content 1fr`, gap, `align-items: baseline`);
  body cell single-line with `overflow: hidden; text-overflow: ellipsis;
white-space: nowrap; min-width: 0;` and a `title` tooltip carrying the
  full body. No new palette tokens.

### 4. Tests & manifests

- `test/sim/webserver.test.js`: writeFile happy path serves new body;
  fail-loud ×3 (unknown path, unknown address at engine level, empty body);
  stage-3 edit → cached OLD body within TTL, NEW body after TTL expiry, and
  no invalidation cross-leak into the db write-through path.
- `test/panel/engine.test.js` (or its natural home): `setWebFile` routing +
  throws (counter-example pin).
- `e2e/fs-editor.spec.js` (NEW file — `e2e/panel.spec.js` is at its 450 cap):
  `should edit a file inline on Stage 1 and serve the new bytes`;
  `should keep the edit cached-stale on Stage 3 until the TTL expires`
  (counter-example pin); `should cancel an inline edit with Escape and
disable commit on an empty draft`. Assert grid + ellipsis computeds once.
- `slices.yaml`: PANEL js adds `js/panel/fs-editor.js`; e2e_specs adds
  `e2e/fs-editor.spec.js`.
- Manifest refs for any storymap row touched name these exact test titles.

## Execution steps

- [x] Step 1 (Lead session): human design sign-off (grid+ellipsis /
      pencil+inline / content-only cached-stale) committed in `DESIGN.md` and this brief.
- [x] Step 2 (Executor sub-agent): cold implementation from brief contracts,
      unit & e2e tests, manifest updates, green `npm run verify`; tick and commit.
- [ ] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`,
      append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, commit.
