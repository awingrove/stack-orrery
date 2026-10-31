# Chunk 7 — E2E + CSS + HTML — Context Brief

## E2E inventory table

| spec (LOC)                             | user journey covered                                                                                                                                                                                                                   | tests | page under test                     | selector strategy                                                                                                    |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| e2e/panel.spec.js (450)                | queue depth vs users; tick-step slim HTTP over mini-IP 10.1; per-stage traces (Stage 1→5), stage-1 headline, journey log 1/4–4/4, legend drawer, title a11y, `?stage=5&users=30` deep link, `?stage=9` fallback, SERVED card at tick 0 | 14    | `/` and `/panel.html` (+`?stage=n`) | 158 getByTestId, 2 getByRole, 10 CSS/id locator (`'.orrery-ring'`, `'#db-rows-list .you-pill'`)                      |
| e2e/fault-console.spec.js (417)        | rail fault console: webserver down/refused + trace, crowd refused→200 recovery, stage-1 mission; LB backend skip + narrative + stage-2 mission; cache bypass + HIT-after-rejoin + stage-3 mission                                      | 9     | `/panel.html?stage=1/2/3`           | 121 getByTestId, 6 hasText, 12 CSS locator (5× `'...[data-testid="node-down-chip"]'`, `'.rail-tab.rail-tab-active'`) |
| e2e/panel-stage6.spec.js (304)         | Stage 6: DNS 10.60 resolve + TTL ledger, DNS ask/answer hops, GET /about keeps stage-5 story, NX card without emitting GET, `?stage=6` deep link, rail console record drop → NX → mission                                              | 8     | `/panel.html?stage=6`               | 87 getByTestId, 2 hasText, 11 CSS/id locator                                                                         |
| e2e/cdn-edge.spec.js (163)             | Stage 6 CDN: cd.example.com edge HIT (6 hops), origin MISS pull through Router (9 hops), TTL expiry staleness after origin edit, POST passthrough not filling edge                                                                     | 4     | `/panel.html?stage=6`               | 47 getByTestId, 0 CSS locator                                                                                        |
| e2e/missions.spec.js (156)             | mission auto-verify from real sim state (404), no complete on 405, edge-HIT ≠ origin-cache-HIT, URL prefill without auto-send, clear on stage switch                                                                                   | 5     | `/panel.html?stage=n`               | 41 getByTestId, 1 hasText, 2 CSS locator                                                                             |
| e2e/fault-console-stage5.spec.js (160) | worker crash → async jobs wait → re-delivery; narrative without faked commit; stage-5 mission after crash+restore                                                                                                                      | 3     | `/panel.html?stage=5`               | 32 getByTestId, 0 others                                                                                             |
| e2e/fs-editor.spec.js (128)            | inline fs route edit + new bytes served, cached-stale on Stage 3 until TTL, Escape cancel + empty-draft commit disabled                                                                                                                | 3     | `/panel.html` (&`?stage=3`)         | 15 getByTestId, 14 CSS locator (`'.fs-commit'`, `'.fs-input'`, `'.route-item[data-file=...]'`)                       |
| e2e/fault-console-stage4.spec.js (134) | DB primary down → writes fail (real 503, no faked WRITE frame) while reads serve; stage-4 mission                                                                                                                                      | 3     | `/panel.html?stage=4`               | 25 getByTestId, 1 hasText                                                                                            |
| e2e/compare.spec.js (125)              | compare tray last two runs hop-by-hop, em-dash rows for short run (9 vs 6), no crowd-tick runs in tray, clear on stage switch                                                                                                          | 4     | `/panel.html`                       | 37 getByTestId, 8 CSS locator (`'.compare-row'`)                                                                     |
| e2e/orrery-plane.spec.js (105)         | pan/zoom/Fit-to-view of concentric plane; Ring 3 compact browser expand → return to 10.2                                                                                                                                               | 2     | `/panel.html`                       | 21 getByTestId, 12 CSS locator (23× `.orrery-ring` occurrences)                                                      |
| e2e/control-room-rail.spec.js (102)    | teaching/missions/legend docked in right rail, tab persist across stages, collapse at responsive breakpoint                                                                                                                            | 3     | `/panel.html`                       | 31 getByTestId, 5 CSS locator (`.rail-tab.rail-tab-active`)                                                          |
| e2e/camera-drawer.spec.js (76)         | wheel scrolls docked panel not camera zoom, drawer drag leaves camera untouched, wheel zoom on plane keeps working                                                                                                                     | 3     | `/panel.html`                       | 11 getByTestId, 0 others                                                                                             |
| e2e/shell.spec.js (16)                 | landing page click-through reaches diagram panel                                                                                                                                                                                       | 1     | `/`                                 | 3 getByTestId, 3 getByRole, 1 CSS locator                                                                            |
| e2e/webserver-fs.spec.js (25)          | WebServer filesystem rows styled like Network mini-IP table                                                                                                                                                                            | 1     | `/panel.html`                       | 1 getByTestId                                                                                                        |
| e2e/teaching.spec.js (73)              | teaching drawer opens, persists stage switches, stage-1 content only on stage 1, primer link per active stage                                                                                                                          | 2     | `/panel.html`                       | 9 getByTestId                                                                                                        |

Totals: 62 tests, 15 spec files, 1 helper file. No `test.describe` block anywhere (flat `test()` calls).

## helpers / network facts

- `playwright.config.js`: testDir `./e2e`, fullyParallel, retries 0, chromium-only project; baseURL `http://127.0.0.1:4173` (PORT const, line 3); webServer `node scripts/static-server.mjs --port 4173` (line 17), reuseExistingServer off in CI; `trace: 'retain-on-failure'`.
- static-server carries CSP: `script-src 'self'` / `style-src 'self'` (scripts/static-server.mjs lines 29–30).
- Gate invocation is `npm run verify` (format:check → lint → unit → guard → e2e), not re-implemented in specs.
- `e2e/fault-console-helpers.js` (29 LOC) is the only shared helper file: exports `faultsTab`, `journeyHop`, `cacheEntryRows`, `missionChip`, `runHops`, `traceWith` — all thin `page.getByTestId`/`.locator` wrappers plus the `btn-next-hop` hop loop. No tests live in it. Imported by exactly 3 specs: fault-console, fault-console-stage4, fault-console-stage5 (grep -l). All other specs are self-contained; `@playwright/test` imported directly in every spec.
- Navigation: all 62 goto calls target `/panel.html` (47 plain) with `?stage=n` variants (`stage=3/4/5/6/9`, `?stage=5&users=30`) and `/` (2 calls: shell.spec, panel.spec click-through).

## CSS architecture facts

| file                          | responsibility (file's own header comment)                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| css/shell/base.css (202)      | shell styles; `:root` custom-properties mirror DESIGN.md front-matter tokens — defining a color outside tokens requires a DESIGN.md amendment first |
| css/panel/panel.css (209)     | page-level panel layout (header/stage ladder/control strip/stats); comments cross-reference inspector.css                                           |
| css/panel/canvas.css (299)    | orrery plane viewport + world plane: nodes, wire columns, tables positioned in world coordinates by viewport.js                                     |
| css/panel/nodes.css (198)     | node internals: mini-IP interface table, FIFO queue pills, filesystem route list (split out of canvas.css by responsibility)                        |
| css/panel/inspector.css (170) | mini-browser in browser node + bottom Component Code & State inspector + journey-log entries                                                        |
| css/panel/teaching.css (127)  | teaching drawer docked by teaching-drawer.js: per-stage narrative (teaches/try/watch-for, trade-off, one primer link), tokens-only palette          |
| css/panel/rail.css (124)      | control-room rail (2026-10-26-style2 brief): page-level two-zone grid — clipped plane left, docked rail right + rail tab chrome                     |
| css/panel/faults.css (106)    | B-6 fault console: per-stage fault switch row in rail host + DOWN chip on affected `.node-card` (DESIGN.md Fault Console)                           |

- **Totals:** 8 CSS files (brief input listed 7 panel files — panel.css is the 8th), ~1,455 LOC, ~178 top-level selectors (canvas 37, panel 27, nodes 25, base 26, inspector 22, rail 15, teaching 14, faults 12 — regex `^\s*[.#a-zA-Z\[][^;]*{`).
- **Which HTML loads what:** index.html → `css/shell/base.css` only. panel.html → all 8 files (base + panel + canvas + nodes + inspector + teaching + rail + faults; panel.html lines 7–14). No `@import` chaining checked beyond file headers.
- **Tokens:** base.css defines `:root` vars `--bg/--surface/--border/--text/--text-muted/--accent/--on-accent/--accent-soft/--good/--good-soft/--warn/--warn-soft/--danger/--danger-soft/--mono` (lines 4–19); panel/*.css consume via `var(--…)` (e.g. panel.css lines 19–31), each file header states "All colors come from the shell tokens."
- **Prefixing conventions:** no numeric stage prefixes in CSS (no `.s1-`/`.stage1-` selectors); stage-x styling is driven by `.active-stage`/`.stage-pill`/`.stage-ladder` state classes and data-bearing JS. Iconic state classes: `.is-panning`, `.is-live`, `.rail-tab-active`, `.lane-active`, `hidden` attribute toggles.

## HTML structure facts

**panel.html (548 lines) — one root structure, no DOM fragments:** a single `<main>` page; dynamic rail/teaching/missions/fault surfaces are NOT in this file (no `rail-tab-faults`, `mission-item`, `teaching-drawer`, camera/teaching drawer ids in HTML — grep finds them only under `js/panel/`, e.g. rail.js, teaching-drawer.js, missions-view.js, panel.js, stage6-registry.js; they mount at runtime).

- 1–8: head + 8 stylesheet/script tags (7 CSS links + 1 module script).
- 17–47: `header.site-header` — nav + `div.stage-ladder` (`stage-pill` buttons 1–6; pill 1 carries `active-stage`).
- 49–97: `section.control-strip` — trace controls (method select, url-input, `#hop-status`), crowd controls (`#user-dots`, users slider), load controls.
- 102–~175: `#orrery-viewport` (tabindex=0) with `.camera-hud` inside it (zoom in/out/fit buttons, `#zoom-status`, ring-gap + zoom-speed range sliders, legend toggle with aria-controls); `aside#legend-panel.camera-drawer` (`hidden`, lines 157–175) with two `.legend-row` paragraphs.
- 176–~512: `section#orrery-world.orrery-canvas` — `svg#orrery-svg` (viewBox `-4800 -4800 9600 9600`, aria-hidden), `#browser-ring-nodes`, then 7 static `article.node-card`s with wire columns interleaved: `#node-browser` (193–243, contains mini-browser: `#req-method` select, `#url-input`, viewport + `#browser-rendered-body`), `#wire-col-left` 239, `#node-network` (246–283, `table.mini-table` mini-IP interfaces with per-interface `td` ids), `#wire-col-right` 279, `#node-lb` (286–322), `#wire-lb-backends`/`#wire-servers-cache` (312/317, `hidden`), `#node-webserver` (325–349, `#server-queue-list` + `#queue-bar`), `#node-webserver-2` (352–379), `#wire-cache-db` 406, `#node-cache` (382–~405, `#cache-entries-list` host), `#node-db` (413–~435), `#wire-cache-queue` 437, `#node-queue` (444–~507, worker state). A stats `dl` (queue depth / avg latency / served served-rate) follows at ~500–512.
- 497–512: stats strip (`#queue-depth`, `#latency`, `#served`, `#served-rate`).
- 514–543: `section.bottom-panels` — `.inspector-card` (`#inspector-title`, `.comp-tabs` role=tablist with `data-select` buttons browser…workerqueue, `#inspector-code` + `#inspector-state` `<pre tabindex=0>`) and `.log-card` (`#exchange-inspector`, `<ol id="journey-log">`).
- 546: `script type="module" src="js/panel/panel.js"`.
- 70 `data-testid` attrs total in static HTML.

**index.html (141 lines) — pure static landing shell:** no `<script>` tag at all (only `<a href="panel.html">` nav + `data-testid="hero-cta"` CTA at line 28). Sections: header 10–15, hero 17–35, feature grid 38–64, scaling-ladder cards 67–138 (stages 1–6, each with `.stage-badge is-live`).

**Every script/style/link tag, verbatim:**

- index.html:7 `<link rel="stylesheet" href="css/shell/base.css" />` (sole tag; zero `<script>`, zero `<style>`)
- panel.html:7–14 `<link rel="stylesheet" href="css/shell/base.css" />`, `css/panel/panel.css`, `css/panel/canvas.css`, `css/panel/nodes.css`, `css/panel/inspector.css`, `css/panel/teaching.css`, `css/panel/rail.css`, `css/panel/faults.css`
- panel.html:546 `<script type="module" src="js/panel/panel.js"></script>`

**Inline style/style-attribute count:** `grep -c "style=" panel.html` = 0; `index.html` = 0 → zero inline `style=""` attributes in either HTML file (and none anywhere in e2e/ or css per repo-wide grep).

## Size-gate facts

Gate (AGENTS.md / scripts/guard-file-size.mjs): fails _over_ — production `js/**`/`css/**` > 300, tests `test/**`+`e2e/**` > 450, `*.html` > 550.

| file                                                                       | lines               | gate | state                                      |
| -------------------------------------------------------------------------- | ------------------- | ---- | ------------------------------------------ |
| e2e/panel.spec.js                                                          | 450                 | 450  | **exactly at cap — one added line fails**  |
| e2e/fault-console.spec.js                                                  | 417                 | 450  | headroom 33                                |
| e2e/panel-stage6.spec.js                                                   | 304                 | 450  | headroom 146                               |
| panel.html                                                                 | 548                 | 550  | headroom 2                                 |
| css/panel/canvas.css                                                       | 299                 | 300  | headroom 1                                 |
| css/shell/base.css                                                         | 202                 | 300  | —                                          |
| css/panel/panel.css                                                        | 209                 | 300  | — (not in chunk-7 listing; exists on disk) |
| css/panel/nodes.css / inspector.css / teaching.css / rail.css / faults.css | 198/170/127/124/106 | 300  | all under                                  |
| index.html                                                                 | 141                 | 550  | —                                          |
| remaining e2e specs                                                        | 16–163              | 450  | all under                                  |

## Inline violation scan

Repo-wide greps over `index.html`, `panel.html`, `e2e/**`, `css/**`:

- `style(?:=|s=)` → **0 hits** (also `grep -c "style=" panel.html index.html` → 0/0).
- `on[a-z]+\s*=` (onclick/onload/…) → **0 hits**.
- `<style>` element in any `*.html` → **0 hits** (only style-sheen is the `style=` probe above; no `<style>` tag exists in either HTML file).
- `<script>` without `src` → **0 hits**: the only `<script` occurrence in either HTML file is panel.html:546 `<script type="module" src="js/panel/panel.js"></script>` with a src. index.html contains no script tag.

Zero inline CSP violations found in this chunk.
