# Chunk 10 — file-size gate forensics (facts only)

Commit hashes: `git show <hash>` for context; dates 2026-10-15…2026-10-31.

## 1. Guard mechanics (scripts/guard-file-size.mjs)

- Thresholds: `LIMITS = { html: 550, test: 450, code: 300 }` — guard-file-size.mjs:10-14.
  `limitFor`: `.html`→550; path prefix `test/` or `e2e/`→450; else (js/, css/)→300 (:16-20).
- Scan set: `SOURCE_DIRS = ['js','css','e2e','test']` recursively + top-level `*.html` only (:29-30, :42-51). **Not scanned:** `scripts/`, `docs/`, `index.html` is scanned (top-level html), `panel.html` scanned.
- Measurement (:62-64): `split('\n')`, pop trailing empty line. Effectively `wc -l`. **Blank lines and comment lines count**. No max-line-length check, no complexity check, no AST.
- EXIT: offender `lines > limit` (strictly over, so 300 is legal for code, 450 legal for tests, 550 legal for html).
- Prettier: `.prettierrc` = `{ "printWidth": 100, "singleQuote": true }` (`.prettierrc`; prettier ^3.9.10, package.json:22; no other overrides). Prettier normalizes code layout but does not: split string/template literals, delete comments, or add blank lines (collapses >1 blank but repo median use is modest, see §4).
- Remaining golf vectors per this config: (a) long unwrapped string/template literals (printWidth can't split a literal), (b) comment removal, (c) removing blank lines, (d) merged test cases per `it()`. Statement packing into one line is largely blocked by printWidth=100 (verified below, §4c).

## 2. Headroom table — % of gate used (current files, sorted; "≥90%" = pressure-fat)

| file                                                                         | lines/gate | %         | comment+blank % | lines >100ch | notes |
| ---------------------------------------------------------------------------- | ---------- | --------- | --------------- | ------------ | ----- |
| e2e/panel.spec.js                                                            | 450/450    | **100.0** | 31.1            | 7            | ≥90%  |
| js/panel/viewport.js                                                         | 300/300    | **100.0** | 18.0            | 0            | ≥90%  |
| css/panel/canvas.css                                                         | 299/300    | **99.7**  | 16.4            | 0            | ≥90%  |
| js/sim/webserver.js                                                          | 299/300    | **99.7**  | 26.4            | 0            | ≥90%  |
| panel.html                                                                   | 548/550    | **99.6**  | 2.7             | 0            | ≥90%  |
| js/sim/engine.js                                                             | 298/300    | **99.3**  | 27.2            | 2            | ≥90%  |
| js/panel/fault-console.js                                                    | 296/300    | **98.7**  | 35.5            | 0            | ≥90%  |
| js/sim/trace.js                                                              | 294/300    | **98.0**  | 20.7            | 8            | ≥90%  |
| js/panel/layout.js                                                           | 287/300    | **95.7**  | 10.1            | 0            | ≥90%  |
| js/panel/panel.js                                                            | 285/300    | **95.0**  | 33.3            | 0            | ≥90%  |
| test/panel/missions.test.js                                                  | 421/450    | **93.6**  | 25.2            | 10           | ≥90%  |
| js/panel/missions.js                                                         | 280/300    | **93.3**  | 34.3            | 0            | ≥90%  |
| e2e/fault-console.spec.js                                                    | 417/450    | **92.7**  | 34.1            | 1            | ≥90%  |
| test/panel/camera.test.js                                                    | 406/450    | **90.2**  | 15.8            | 0            | ≥90%  |
| js/panel/inspector-source.js                                                 | 270/300    | **90.0**  | 6.3             | 4            | ≥90%  |
| js/panel/render.js                                                           | 262/300    | 87.3      | 18.3            | 0            |       |
| js/sim/trace-stage6.js                                                       | 256/300    | 85.3      | 29.3            | 1            |       |
| js/panel/model.js                                                            | 250/300    | 83.3      | 26.4            | 8            |       |
| test/sim/engine.test.js                                                      | 353/450    | 78.4      | 23.5            | 2            |       |
| js/panel/inspector-state.js                                                  | 235/300    | 78.3      | 6.8             | 0            |       |
| test/sim/worker-crash.test.js                                                | 334/450    | 74.2      | 25.1            | 6            |       |
| test/sim/dns-ledger-drop.test.js                                             | 331/450    | 73.6      | 22.7            | 8            |       |
| (further 47 files below ~72%, incl. index.html 141/550, url-state.js 29/300) |            |           |                 |              |       |

Guard runs clean: 105 source files scanned (guard output this session).

## 3. Extraction event history (git log --follow per file; "cap" = file size at that commit)

Pattern check: A-file `≥~90%` of gate AND a new js/css/test file added in the same commit.

- **panel.js → url-state.js**: 578507c (b6 fault console): panel.js 296→285 (-11); A url-state.js (29); A fault-console.js; A engine-stage6.js. numstat panel.js 17+/28-. Header (url-state.js:1-3): "split from panel.js by responsibility (guard-file-size)".
- **render.js → render-stage.js**: 2ad0e93 (stage3 cache): render.js hit 272→**177 called back**; render.js line history: 272 (9900ac1) → 177 after split (2ad0e93), render-stage.js A (149). Header (render-stage.js:1-3): "split from render.js by responsibility (guard-file-size)".
- **render-stage.js → hop-targets.js**: 3f9a7e4 render-stage 282 (94%); 43a6b3d (stage6b): render-stage 282→141; A hop-targets.js (197). numstat render.js at 43a6b3d 41+/37-. Header (hop-targets.js:1-2): "split from render-stage.js by responsibility (guard-file-size)".
- **layout.js → layout-stage6.js + layout-geo.js**: 7dadca4 (stage6a): layout.js 299→287; A layout-stage6.js (72), layout-geo.js (40). Header (layout-stage6.js:1-2): "split from layout.js by responsibility (guard-file-size)"; (layout-geo.js:1-2): "split from layout.js by responsibility (guard-file-size) so the per-stage registries … share them".
- **model.js → model-stage5-chain.js + model-stage6.js + model-dbop.js**: model.js 95.3% at 3f9a7e4 (259→**hit 300 at 578507c**); b30d3c6: model.js 300→293, A model-dbop.js (24); 36c3dd2: model.js 293→250, A model-stage5-chain.js (69). model-stage6.js was created earlier at 43a6b3d (82, "split from model.js by responsibility (guard-file-size)"). Headers: model-dbop.js:1-3 "extracted by responsibility, guard-file-size; the model-stage6.js precedent"; model-stage5-chain.js:1-3 "extracted from model.js by responsibility (guard-file-size; the model-dbop.js precedent)".
- **engine.js vs engine-pool/engine-stage6/engine-faults**: engine.js hit exactly 300 at 43a6b3d; 578507c: engine 300→298, A engine-stage6.js (56) — "split from engine.js by responsibility (guard-file-size)" (engine-stage6.js:4). 65e901e (b6c): engine numstat 33+/33-, A engine-pool.js (35) + webserver-helpers.js (38), engine stays **300**; then b30d3c6: 11+/18-, A engine-faults.js (41), engine→293; 36c3dd2 →298; 28cfeed →298. engine.js has never been reduced below ~89% of cap since 43a6b3d; two extractions left it line-neutral or refilled (33/33 is prettier reflow, not deletion).
- **trace.js → trace-helpers.js**: trace.js hit 299 at 7dadca4 (98.7%); 43a6b3d: trace.js 299→271, A trace-helpers.js (103). Header (trace-helpers.js:1-3): "Extracted by responsibility (guard-file-size): both machines run these identical hop[...]". trace.js rose again to 300 at 73d223b, 294 now; b30d3c6 split further into trace-stage6? No — trace-stage6.js A at 7dadca4 (trace at 299): "Split from trace.js by responsibility (guard-file-size): trace.js stays the stages 1-5 machine verbatim" (trace-stage6.js:4-5).
- **canvas.css → nodes.css**: d86e53c (orrery plane): canvas.css 222→200, A nodes.css (105). Header (nodes.css:1): "split from canvas.css by responsibility". canvas.css re-grown to 299 by fb0cf1a and held at 299 across the last 4 commits (fb0cf1a, 7dadca4, 2acf19d, 4fc23f9) — 13 commits touch the file in total, only the last 4 at 299.
- **webserver.js → webserver-helpers.js**: 65e901e: webserver numstat 34+/34-, A webserver-helpers.js (38), webserver stays **300→299**. Header: "extracted by responsibility, guard-file-size; the trace-helpers.js precedent — no behavior change".
- **viewport.js**: at 298 when camera.js + orrery-svg.js were carved out in one commit (80dc1b9: A camera.js, A orrery-svg.js 42, viewport 84+/47- — twice, not 4×); then viewport re-grew to exactly 300 at 2acf19d and 4fc23f9 — **never split at cap, held at 100% since 2026-10-26**.
- **panel.html → rail.js / teaching-drawer.js / stage6-registry.js (JS-built chrome)**: panel.html 547→550 (2ad0e93→7dadca4 lineage); teaching-drawer.js:1-3 "Built in js rather than panel.html because **that page sits at its 550-line cap**"; stage6-registry.js:1-4: "Injected from js rather than panel.html because that page sits at its 550-line cap (teaching-drawer.js precedent)". These two headers cite the html cap explicitly (not a js-cap split).
- **test splits**: test/panel/model.test.js 426 (94.7%) at ec89f94 → fb0cf1a split: model.test.js 426→268, A model-stage34.test.js (232). test/panel/model-stage6.test.js A at 7dadca4 (168, grew to 316 by 43a6b3d, 70.2%). **e2e/panel.spec.js pinned exactly at 450**: 6b9eaea 380, 63aa7f6 431, 80dc1b9 **450 exactly (+37/-0)**, 7dadca4 numstat 1+/1-, 4e8578c 2+/2-, 578507c → still 450 today; sibling specs created instead: panel-stage6.spec.js (7dadca4), fault-console specs, orrery-plane.spec.js, camera-drawer.spec.js.
- **Misses (no extraction):** viewport.js (current 100%, never split at cap), canvas.css (99.7% for 13 commits), e2e/panel.spec.js (100% × 5 commits), panel.html (99.6%), engine.js (99.3%), missions.test.js 421 (93.6%, no helper file, no third it() split), inspector-source.js (90%, cb 6.3%, no split since 7dadca4), trace.js (98%).
- **Header citations over all extraction/new-module files traced (n=37):** cite "guard-file-size" verbatim in own header (21): url-state.js, render-stage.js, hop-targets.js, layout-geo.js, layout-stage6.js, model-stage5-chain.js, model-stage6.js, model-dbop.js, engine-stage6.js, engine-pool.js, engine-faults.js, trace-helpers.js, trace-stage6.js, webserver-helpers.js, orrery-svg.js, nodes.css, cdn-chain.js, journey-log.js, inspector-source-stage6.js, inspector-state.js, viewport.js (orrery-svg block). NO guard mention — stage/responsibility or component contract only (16): rail.js, missions-view.js, compare.js, fs-editor.js, teaching.js, fault-console.js, camera.js, cdn.js, browser-seat.js, dns.js, router.js, queue.js, database.js, cache.js, trace.js. HTML-cap-cited instead: teaching-drawer.js:3 ("panel.html sits at its 550-line cap"), stage6-registry.js:4 ("that page sits at its 550-line cap (teaching-drawer.js precedent)"). Precedent chains are explicit in headers: engine-pool→engine-stage6, engine-faults→engine-pool, model-dbop→model-stage6, model-stage5-chain→model-dbop, webserver-helpers→trace-helpers, fault-console-helpers→panel-stage6.spec.js precedent, stage6-registry→teaching-drawer.

## 4. Golf-vector scans (per near-gate file; repo median cb% = 26.8% of all prod js/css)

- **(a) Comment+blank density (cb%):** near-gate prod (≥90%) set cb% median ≈ 23.6 (values above) vs repo prod median **26.8** — near-gate files are NOT systematically comment-stripped. Outliers BELOW the norm: inspector-source.js **6.3%** (17/270), inspector-state.js **6.8%**, layout.js **10.1%**, panel.html **2.7%** (html nature), teaching.js 6.6%. Outliers ABOVE (rich narrative kept despite cap): fault-console.js 35.5%, missions.js 34.3%, panel.js 33.3%, trace-helpers.js 42.7%, url-state.js 48.8%, network.js 45.5%, engine-faults.js 52.2%.
- **(b) Lines >100 chars (unwrapped literals prettier leaves):** teaching.js **47** (60.3% of gate) — teaching narrative template literals; trace.js 8, model.js 8, e2e/panel.spec.js 7, missions.test.js 10, engine.test.js 2, engine.js 2, inspector-source.js 4. Exemplars: trace.js:133 `frame = \`${trace.from} -> ${serverAddress} | ${trace.request} => connection refused (nothing enqueued)\``; model.js:203 `cacheStatsLabel: \`Hits: ${...} · Misses: ${...} · TTL: ${...}t\``; missions.test.js:20 `it('stages 1 and 3-6 carry four; stage 2 carries two to three (B-6 recovery + B-6b failover + B-6c bypass-cold + B-6d write-fail + B-6e worker-crash + B-6f dns-drop)', () => {`.
- **(c) Multi-statement packing:** scan of lines with ≥2 `;` (excluding `for (` and comments) across near-gate prod js = **essentially zero**. Only hits: engine.js:16 (a comment), inspector-source.js:95 `let queue = [];      // FIFO; work budget serviceRate * 2 per step()`, :199 `const replica = new Map();   // same shape; serves all reads` — those are code-mirror strings rendered for learners, not packed source.
- **(d) Dense chained ternaries:** confirmed pattern. inspector-state.js:79-141 = per-stage label maps inside `snapshot.stage === 6 ? {...} : {...}` blocks, one `.map` entry over ~60 lines, two-line-arrow per key, e.g. :135-137:
  ```
                  Crowd: `${snapshot.users} simulated browsers`,
                }
                : {
  ```
  Similar shape in model.js:203-236 and trace.js:218-219 (`frame = ... ? \`...\` : \`...\`` twinned template literals). These wrap the teaching content INTO the 300-line envelope rather than golfing statements.

## 5. Test-suite redirects

- e2e/fault-console-helpers.js A at b30d3c6 (29 lines now). Header: "shared helpers for the fault-console e2e specs ... — the panel-stage6.spec.js precedent for **keeping a spec under its cap**" (fault-console-helpers.js:1-4). Downstream: model-dbop.js — "the b6d Step 2 commit traced the model.js cap into model-dbop.js while spec infra also moved (helpers file)". Test work redirected: worker-crash.test.js (36c3dd2, 334), dns-ledger-drop.test.js (28cfeed, 331), primary-down.test.js (b30d3c6, 292) — sibling stage/fault specs each own a slice, avoiding a >450 master spec.
- No `**/fixtures/*` file ever created (`git log --diff-filter=A -- '**/fixtures*'` empty; ls of test/fixtures, e2e/fixtures: nothing).
- Net line accounting on cap hits (numstat): e2e/panel.spec.js pinned 450 across 80dc1b9/7dadca4/4e8578c (numstat +1/-1, +2/-2 — single-line trims balanced against new content); engine.js 33/33 and webserver.js 34/34 at 65e901e line-neutral prefactored refactors.

## 6. Exemptions & holes

- guard-plan-ticks.mjs:12-18: `LEGACY_LONG_BRIEFS` = 5 pre-rule briefs (2026-10-15 stage1-executable-model, 2026-10-16 stage1-interactive-orrery-ui, 2026-10-18 orrery-plane-camera, 2026-10-20 stage3-cache, 2026-10-20 stage4-database) exempt from the `MAX_BRIEF_LINES` check; check at :61 only grants the exemption, then still requires tick lines.
- **scripts/\*.mjs entirely outside the guard's scan set** — size history:
  | file                                                                                                                                                            | growth                                            |
  | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
  | extract-session-metrics.mjs                                                                                                                                     | 109 (a7f3e44) → 255 (fb5a796) → **327** (da048ac) |
  | guard-slices.mjs                                                                                                                                                | 259 once (4640a5f), unsplit                       |
  | guard-claims.mjs                                                                                                                                                | 134 once (8a6f0ec)                                |
  | guard-plan-ticks.mjs                                                                                                                                            | 71 (e5a6418) → 80 (4640a5f) → 98 (a7f3e44)        |
  | guard-metrics.mjs                                                                                                                                               | 109 (39b8f20) → 114                               |
  | guard-file-size.mjs                                                                                                                                             | 65 (4640a5f) → 77 (91dea54)                       |
  | static-server.mjs                                                                                                                                               | 88 (e5a6418)                                      |
  | guard-debt.mjs                                                                                                                                                  | 131 once; guard-story-refs.mjs 130 once           |
  | So the rule's own tooling never grew past 327 (extract-session-metrics 109% of a would-be 300 code limit if it were scanned), but no guard pressure acts there. |
- Scan also misses `docs/*.md`, `*.css` outside css/ (none exist), `*.js` at top level (none exist).

## 7. Attribution notes

- All line counts: `readFileSync().split('\n')` methodology identical to the guard (count is exact, blank+comment lines inclusive).
- Number types: "cb%" = `(comment_or_blank_lines / total_lines)`; "numstat" = `insertions/deletions` (git show --numstat).
- All % values computed from files at HEAD on 2026-10-31, working tree clean per guard run.
