---
version: alpha
name: stack-orrery
description: >-
  Design contract for stack-orrery: a dark-canvas executable architecture
  orrery where learners trace slim-protocol requests hop-by-hop across
  mini-IP nodes, inspect live queues and route tables, and click any
  component to view its working JS code and internal state.
colors:
  background: '#0b101b'
  on-background: '#e8eef9'
  surface: '#131b2e'
  on-surface: '#e8eef9'
  surface-2: '#19233c'
  on-surface-2: '#e8eef9'
  border: '#273556'
  on-border: '#8fa0bf'
  muted: '#8fa0bf'
  on-muted: '#0b101b'
  accent: '#4da3ff'
  on-accent: '#061224'
  accent-soft: '#1a365d'
  on-accent-soft: '#e8eef9'
  good: '#3ddc84'
  on-good: '#052012'
  good-soft: '#13392a'
  on-good-soft: '#3ddc84'
  warn: '#f6b93b'
  on-warn: '#1f1404'
  warn-soft: '#3d2f14'
  on-warn-soft: '#f6b93b'
  danger: '#ff6b6b'
  on-danger: '#240609'
  danger-soft: '#3f1d24'
  on-danger-soft: '#ff6b6b'
typography:
  body:
    fontFamily: 'system-ui, -apple-system, sans-serif'
    fontSize: '1rem'
    fontWeight: '400'
    lineHeight: '1.45'
  heading-page:
    fontFamily: 'system-ui, -apple-system, sans-serif'
    fontSize: '1.15rem'
    fontWeight: '700'
    lineHeight: '1.25'
  heading-section:
    fontFamily: 'system-ui, -apple-system, sans-serif'
    fontSize: '0.98rem'
    fontWeight: '700'
    lineHeight: '1.3'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
    fontSize: '0.78rem'
    fontWeight: '400'
    lineHeight: '1.5'
rounded:
  sm: '0.3rem'
  md: '0.45rem'
  lg: '0.7rem'
  pill: '999px'
spacing:
  2xs: '0.25rem'
  xs: '0.4rem'
  sm: '0.65rem'
  md: '0.9rem'
  lg: '1.25rem'
components:
  topbar:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
  node-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.lg}'
    padding: '{spacing.md}'
  wire-lane:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.md}'
    padding: '{spacing.xs}'
  ip-chip:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
    rounded: '{rounded.sm}'
  queue-pill-you:
    backgroundColor: '{colors.warn-soft}'
    textColor: '{colors.warn}'
    rounded: '{rounded.sm}'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.on-accent}'
    rounded: '{rounded.sm}'
  button-secondary:
    backgroundColor: '{colors.surface-2}'
    textColor: '{colors.on-surface-2}'
    rounded: '{rounded.sm}'
  inspector-card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.on-surface}'
    rounded: '{rounded.lg}'
    padding: '{spacing.md}'
---

# stack-orrery Design System

## Overview

**This document is part of every UI change.** If a change introduces or alters a
pattern, interaction, or component that is not covered here, raise it with the
human and — on agreement — amend this document in the same change
([factory-kit DESIGN.md](https://github.com/awingrove/factory-kit/blob/main/DESIGN.md)).

- All interactivity obeys the repo's strict CSP (`script-src 'self'; style-src 'self'`):
  no inline scripts, no inline event handlers, no inline `style=""` attributes in HTML.
- CSS custom properties in `css/shell/base.css` mirror the front-matter tokens above.

## Landing Page (`index.html`)

- **Hero (`.hero`):** Dark surface card with a monospace eyebrow pill
  (`.hero-eyebrow`), `<h1>stack-orrery</h1>`, tagline + `.lede` explaining the
  concentric executable model, and a primary CTA button (`.hero-cta`,
  `button-primary` tokens) linking into `panel.html`.
- **Feature Pillars (`.feature-grid` / `.feature-card`):** Three cards
  describing single-request hop tracing, deterministic crowd load / queue
  dynamics, and the live Component Code & State Inspector.
- **Scaling Ladder Preview (`.ladder-grid` / `.ladder-card`):** Six stage cards
  matching the topbar scaling ladder, with unlocked stages (`1`–`5`) badged as
  `Live` (`var(--good-soft)` / `var(--good)`) and upcoming stage (`6`) as
  `Planned`.

## Layout & Zones

Every stage diagram panel (`panel.html`) is organized into four vertical zones:

1. **Topbar & Stage Ladder (`.topbar` / `.stage-ladder`):** Shows the app brand
   and the scaling-ladder stage pills (`1 · Single Server` through `6 · Multi-Net / CDN`).
   Unlocked stages (`1 · Single Server`, `2 · LB / Dup Servers`, `3 · Cache`,
   `4 · DB + Replication`, `5 · Worker Queue`) are clickable `<button class="stage-pill">`
   elements that toggle the active stage topology on the canvas (`aria-current="true"`
   and `.active-stage` on the selected stage).
2. **Control Strip (`.control-strip`):** Split into two groups:
   - **Single Request Trace:** `Send & Watch Hops`, `Step 1 Hop ->`, and the
     monospace `#hop-status` pill showing the current hop (`Hop 1/4` .. `Hop 4/4`
     in Stage 1; `Hop 1/5` .. `Hop 5/5` in Stage 2; `Hop 1/6` .. `Hop 6/6` in
     Stage 3; `Hop 1/7` .. `Hop 7/7` in Stage 4; `Hop 1/8` .. `Hop 8/8` in Stage 5).
   - **Client Browsers Load:** Slider (`#users-slider`) for the number of
     simulated browsers on the outer ring, `Start` / `Pause` (`#start-button`),
     and `Step 1 tick` (`#step-button`).
3. **Orrery Plane & Camera Viewport (`.orrery-viewport` / `.orrery-canvas`):**
   The clipped, pannable left zone of a two-zone page grid (the control-room
   rail owns the right zone). The plane is a pannable and zoomable 2D world
   plane (`.orrery-world`) inside a clipped
   viewport (`.orrery-viewport`) with concentric orbital rings etched in SVG
   (`#orrery-svg`). Each stage renders one concentric ring (`r_k = k * ringGap`,
   default `ringGap = 400px`) per architectural layer, and every component sits
   on its layer's ring:
   - **Stage 1 (3 rings):** Ring 1 (`WebServer 10.1`), Ring 2 (`Network 10.x`),
     Ring 3 (`Browsers 10.2+`).
   - **Stage 2 (4 rings):** Ring 1 (`WebServer-1 10.11` & `WebServer-2 10.12`),
     Ring 2 (`LoadBalancer 10.1`), Ring 3 (`Network 10.x`), Ring 4 (`Browsers 10.2+`).
   - **Stage 3 (5 rings):** Ring 1 (`Cache 10.20`), Ring 2 (`WebServer-1 10.11` &
     `WebServer-2 10.12`), Ring 3 (`LoadBalancer 10.1`), Ring 4 (`Network 10.x`),
     Ring 5 (`Browsers 10.2+`).
   - **Stage 4 (6 rings):** Ring 1 (`Database 10.30/10.31`), Ring 2 (`Cache 10.20`),
     Ring 3 (`WebServer-1 10.11` & `WebServer-2 10.12`), Ring 4 (`LoadBalancer 10.1`),
     Ring 5 (`Network 10.x`), Ring 6 (`Browsers 10.2+`).
   - **Stage 5 (7 rings):** Ring 1 (`Database 10.30/10.31`), Ring 2 (`WorkerQueue 10.40`
     & `Worker 10.41`), Ring 3 (`Cache 10.20`), Ring 4 (`WebServer-1 10.11` &
     `WebServer-2 10.12`), Ring 5 (`LoadBalancer 10.1`), Ring 6 (`Network 10.x`),
     Ring 7 (`Browsers 10.2+`).
   - **Stage 6 (9 rings):** Ring 1 (`Database 10.30/10.31`), Ring 2
     (`WorkerQueue 10.40` & `Worker 10.41`), Ring 3 (`Cache 10.20`), Ring 4
     (`WebServer-1 10.11` & `WebServer-2 10.12`), Ring 5 (`LoadBalancer 10.1`),
     Ring 6 (`Network 10.x`, Router side-card `10.65 ⇄ 20.254`), Ring 7
     (`DNS 10.60`), Ring 8 (`CDN edge 20.1`), Ring 9 (`Browsers 10.2+`). A
     hosted browser path (`example.com/about`) rides Browser -> DNS ask -> DNS
     answer -> the Stage 5 chain; host-less paths skip DNS entirely. A
     CDN-hosted path (`cd.example.com/about`, DNS -> `20.1`) rides the Router
     to the edge: a GET inside the edge's TTL serves from the edge ledger
     (6 hops); a miss pulls the origin through the Router into the real
     Stage 5 chain and fills the ledger (9 hops). Cross-subnet frames take
     exactly one Router hop per crossing (each direction counts).
     All `N` client browsers (`10.2` .. `10.(N+1)`) sit on the outermost ring: the
     currently selected browser renders as the full expanded `#node-browser` card,
     while the other `N - 1` browsers render as clickable compact `.browser-compact`
     nodes on the outer ring (clicking any compact browser expands it into the
     full browser card).
   - **Camera HUD (`.camera-hud`):** Fixed screen-space overlay in the top-right
     of `.orrery-viewport` with `#btn-zoom-in` (`+`), `#btn-zoom-out` (`-`),
     `#btn-zoom-fit` (`Fit`), `#zoom-status` percentage badge, and live tuning
     sliders for **Ring spacing** (`#ring-gap-slider`, default `400px`,
     `180–560px` step `5`, + `#ring-gap-value`) and **Zoom speed**
     (`#zoom-speed-slider`, `1.01x–1.50x` step `0.01`, + `#zoom-speed-value`). Supports
     pointer drag to pan, wheel/pinch zoom toward the cursor, and keyboard
     shortcuts (`Arrow` keys to pan, `+`/`-` to zoom, `0` to fit).
4. **Control-Room Rail (`.rail`, 2026-10-26 Stage R1):** In page-flow order,
   a ~20rem right column of the two-zone grid spanning the same rows as the
   plane: a tab row (Teach / Missions / Legend) plus per-tab docked
   surfaces (see Docked Rail Surfaces below for their contracts). Below the
   named 1100px breakpoint the grid stacks the rail under the plane
   (single-column fallback, page never breaks).
5. **Bottom Split (`.bottom-panels`):**
   - **Component Code & State Inspector (`.inspector-card`):** Side-by-side view
     of the selected component's executable JS source code (`#inspector-code`)
     and its live internal state JSON (`#inspector-state`). The component tab
     row (`.comp-tabs`) wraps (Stage 6b amendment: `browser`…`cdn` exceeds one
     line, and an unwrapped row spills under the adjacent journey-log card,
     which paints over its last tab).
   - **Wire Journey Log (`.log-card`):** Reverse-chronological hop and tick
     history (`#exchange-inspector` headline + `#journey-log` list).
   - **Compare Tray (`#compare-tray`, 2026-10-25):** Auto-pair diff inside the log-card: a JS-built list (no static markup) that always compares the
     **two most recent completed trace runs**, hop-aligned (`n · left frame ·
right frame`, em-dash where one run ended sooner) with a `9 vs 6 hops ·
<left path> vs <right path>` headline. Frames are verbatim journey-log
     entries (compare never mints hop text); crowd-tick runs never enter; a
     run joins at its final render hop with an entry snapshot (immune to the
     journey-log 20-entry cap); switching stages clears the tray.

## Components

### Wire Lanes (`.wire-column`)

- Each wire carries one wire column labeling its two directions (`request =>`,
  `<- response`, `write =>`, `enqueue =>`, …), positioned in world coordinates
  on the wire by `viewport.js` (`LANE_WIRES`): default on the wire's midpoint;
  parallel wires share a centered lane (`wire-lb-backends`, `wire-servers-cache`).
- One pinned exception (Stage 5): the `wire-cache-db` lane anchors at `t = 0.3`
  down the cache→db radial instead of the midpoint, because the queue→worker
  chord crosses that radial at its own midpoint and both chips would collide
  (DL-3 follow-up; human design sign-off 2026-10-22).

### Component Nodes (`.node-card`)

- Every component on the canvas carries a header with its role name, a subtitle,
  its two-number mini-IP badge (`.ip-chip`, e.g. `10.2`, `10.x`, `10.1`), and a
  `</> Code` badge (`.code-chip`).
- Clicking any `.node-card` (outside interactive controls) selects that
  component in the bottom inspector (`.selected-node` border `var(--accent)`).
- During a hop-by-hop trace, the component executing the current hop carries
  `.active-hop` (`var(--good)` border glow).

### Docked Rail Surfaces (control-room rail, `.rail` — `#teaching-panel` + `#legend-panel` + `#missions-section`, 2026-10-26 Stage R1)

- **Input contract (Stage R1 remodel, replaces the 2026-10-26 drawer fence):**
  the teaching drawer, the missions section, and the legend drawer dock into
  the page-level `.rail` beside the orrery plane — they are NOT descendants
  of `.orrery-viewport`, so nothing scrollable is mounted on the plane at
  all (the systemic gap the two-zone layout pays down by construction). The
  camera's wheel/pointer handlers were therefore unguarded: the old
  `.camera-drawer` fence (`closest()` bail-outs in `viewport.js`) is removed;
  a gesture on the plane is camera input, a gesture on the rail is rail
  scroll input (`.teaching-panel` keeps `overscroll-behavior: contain` so an
  at-end wheel never chains into the page). Pinned in
  `e2e/camera-drawer.spec.js` (wheel over the docked rail never drives the
  camera zoom; a drag inside a docked surface leaves the camera transform
  untouched; the plane's own wheel still zooms) and
  `e2e/control-room-rail.spec.js` (the surfaces dock inside `.rail`, the
  plane's node cards/rings/HUD stay mounted on the viewport).

- **Rail chrome (`js/panel/rail.js`, `css/panel/rail.css`):** the rail is a
  ~20rem column in a two-zone page grid (plane left, rail right; below the
  named 1100px breakpoint it stacks UNDER the plane in the page flow). Its
  tab row holds three buttons — Teach / Missions / Legend
  (`rail-tab-teach` / `rail-tab-missions` / `rail-tab-legend`) — and the
  `railTab` state (`'teach' | 'missions' | 'legend'`, default `'teach'`)
  shows one docked surface at a time and persists across stage switches;
  an active tab whose surface is closed renders the host's muted
  empty-state line. Tab switches never touch the camera or the snapshot
  pipeline. The camera HUD keeps `#teaching-toggle` and `#legend-toggle` in
  their HUD slots as the surface toggles: open docks that surface's rail
  tab (opening Teach or Legend hides the mission host while shown, and vice
  versa), close flips the panel's own `hidden` (the legend toggle stays a
  real toggle). A follow-up slice may dock inspector/log into the rail;
  separate design gate. The teaching/legend surfaces lose their absolute
  HUD-overlay positioning; the static `#legend-panel` aside is re-parented
  into the rail by `rail.js` with its testids intact.

- **Legend drawer:** `#legend-toggle` sits in `.camera-hud`; the drawer
  (`.legend-panel`, docked) explains the tick-to-ms mapping (`TICK_MS = 100` in
  `js/panel/model.js`), the cache stats trio (`Hits / Misses / TTL-remaining`),
  the `site` chips on Ring 3 browser nodes, and wire-lane direction labels
  (`request =>`, `<- response`, `enqueue =>`, `write =>`). All protocol strings
  in `var(--mono)`; surface tokens only.
- **Teaching drawer:** `#teaching-toggle` and the `.teaching-panel` aside
  (docked into the rail's teach host) render
  the per-stage narrative from `js/panel/teaching.js` (`STAGE_TEACHING`,
  `describeStageTeaching(stage)`): a `heading-section` headline, `teaches` /
  `try` / `watchFor` lists, a trade-off line, and one outbound
  system-design-primer link per stage (`.accent` link, new-tab anchor).
  Closed by default; state persists across stage switches within the page.
- **Missions section (`MISSIONS`, 2026-10-26):** a JS-built list of
  per-stage missions (2–3 each, registry in
  `js/panel/missions.js`), each `M-<n>` row carrying its goal and a live
  check chip (`○` pending with a progress readout, `✓ done · tick N`),
  docked into the rail's missions host (`rail-tab-missions`) with its own
  testids (`missions-section`, `mission-item`, `mission-status`).
  The sim is the referee: a mission completes only when its
  `detect(snapshot)` predicate reads the real engine state — never on a
  button click, and the teaching-drawer copy must be able to mislead
  without a mission firing (named counter-examples live in the registry
  tests: a 405 does not complete the 404 mission; an origin cache HIT does
  not complete the edge-HIT mission). Clicking a mission that carries a
  request pre-fills the mini-browser URL (input fill only, no auto-send);
  verified missions clear on stage switch and reload.

### Fault Console (fourth rail tab, 2026-10-27 B-6)

- **The rail gains a `Faults` tab** (`data-testid="rail-tab-faults"`, JS host
  like the other surfaces): per-stage fault switches, one fault per stage —
  the README ladder's "one failure mode per stage" made explicit. Slice 1
  ships only the stage-1 fault (**WebServer down**); later slices append a
  stage's fault the same way, so unknown tabs/stages render the console's
  empty-state line, never blank space.
- **Failure is real component state, not narration:** a fault toggle sets a
  flag the component owns (webserver `setDown`); the transport consults the
  flag and gives the sender a **connection refused** — no HTTP response
  exists on the wire. Traces, journey log, and node cards narrate the
  refusal from that same record (DL-3/DL-4 rule: UI text never invents a
  status the sim did not record; a refusal is never rendered as a
  `"<status> <body>"` HTTP string).
- **Down-state visual:** an affected `.node-card` with the fault active
  carries a `DOWN` chip in `var(--danger)` on `var(--danger-soft)` (wired
  chips keep `var(--good)`); the card stays in place — a down component is
  still addressable, it just refuses.
- **Recovery is part of the teaching:** toggling the fault back restores
  service with nothing else changed; the per-stage missions registry gains
  the recovery mission so the console and the B-2 detectors verify the same
  lived sequence (kill → refused crowd/trace → restore → served 200).
- **Fault #3 (cache bypassed, 2026-10-29):** a bypassed cache is a **miss
  storm**, not a down component — GET lookups short-circuit at the cache's
  own `isBypass()` consult (recorded `cacheStatus: 'BYPASSED'`, distinct
  from the method-bypass `'BYPASS'` token an async-less non-GET already
  uses), the origin serves every GET, and the cache's hit/miss counters
  freeze (nothing consults them). Tick-based TTL is orthocritical to the
  lesson: the engine keeps evicting expired entries on schedule, so a long
  bypass means a **cold rejoin** — after restore the first GETs land fresh
  misses and fill anew. The cache card's chip reads `BYPASS` on
  `var(--warn)` (not the DOWN `var(--danger)` — a bypassed cache is not
  down, it is out of the path); the console row and the per-stage recovery
  mission (bypass → misses climb → restore → a fresh HIT) follow the
  refuse-recover template. Exactly one fault chip shows at a time, as
  with the other faults.
- **Fault #2 (backend down, 2026-10-28):** a backend fault is NOT a refusal
  story — the load balancer is health-aware and **skips** the down backend
  (round-robin cursor advances past it; skips are counted on the snapshot),
  so the pool keeps serving: graceful degradation, visibly lopsided
  distribution. Traces narrate the skip where the LB chose and otherwise
  keep the full stage-2 served story — never a refusal frame, never an
  abort. Refusal returns only when NO backend is alive (all-down falls
  through to the slice-1 refusal semantics: counted, never enqueued,
  nothing served). The affected backend's node card carries the same
  `node-down-chip` (exactly one card carries it while any fault is on);
  the console row and the per-stage recovery mission follow the
  refuse-recover template with the skip count standing in for refusals.

### Interactive Mini-Browser (`.mini-browser` & `.browser-compact`)

- Every simulated browser (`10.2` .. `10.(N+1)`) on Ring 3 is an addressable
  `Browser` instance. One browser at a time (default `10.2`) is expanded into
  the full `#node-browser` card; the remaining `N - 1` browsers render on Ring 3
  as compact clickable `.browser-compact` nodes showing their mini-IP (`10.3`,
  `10.4`, …) and latest status. Clicking any `.browser-compact` node expands
  that browser into the full `#node-browser` card at its orbital position.
- The expanded `.mini-browser` provides an HTTP method selector (`#req-method`:
  `GET` / `POST`), editable path input (`#url-input`), `Go` button
  (`#btn-url-go`), and renders that browser's latest response in
  `.browser-viewport` with a status badge (`.status-200` green for `200`,
  `.status-err` red for `4xx`/`5xx`) and the response body text
  (`#browser-rendered-body`).

### Service Internals (Queues, Tables, Routes)

- **Visible FIFO Queues (`.queue-slots`):** Waiting requests inside a server or
  worker queue render as individual `.queue-pill` tokens (`10.4: GET /about`),
  never only an opaque progress bar. Requests originated by the learner's own
  interactive browser (`10.2`) carry `.you-pill` (`var(--warn)` amber highlight).
- **Filesystem & Interface Tables (`.route-list`, `.mini-table`):** Each
  `WebServer` displays the files on its local filesystem (`/` and `/about`),
  and the file served by the most recent `200` response carries
  `.matched-route` (`var(--good-soft)`). Filesystem rows (`.fs-list`) share
  the mini-IP table's two-part look: the file path (`.fs-path`) carries the
  same address-column treatment as a `.mini-table` mini-IP (`var(--accent)`),
  and the served body renders `var(--text)` like the table's name column.
  The rows are the sim's view, not static markup: each card renders its
  server's live `fs` Map as a two-column grid (path column sized to content;
  body single-line with ellipsis overflow and a `title` tooltip carrying the
  full text). Rows are editable: a hover/focus-revealed pencil button swaps
  the row into an inline `<input>` (Enter/✔ commits, Escape/✕ cancels, commit
  disabled while the draft is unchanged or empty), and a commit writes the
  server's `fs` Map via `engine.setWebFile`. An edit does NOT invalidate the
  Cache — on stage 3+ a GET inside the entry's TTL still serves the old body
  (observable cache staleness; the same rule the CDN edge obeys in stage 6b).
  Intrinsic HTTP responses (`404`, `405`) live in the server's executable
  code rather than as configured rows.
- **DNS Resolutions & Tick-TTL Ledger (`#node-dns`, `#dns-entries-list`):** In
  Stage 6, `DNS` (`10.60`) sits on Ring 7 and displays its lookup/hit counters
  (`#dns-stats`) and live resolver-cache rows with remaining TTL
  (`#dns-entries-list`). Unknown names resolve to `NX no record` — the browser
  card renders it, no GET is emitted.
- **Cross-Subnet Router (`#node-router`):** Stage 6 `Router` side-card on
  Ring 6 (interfaces `10.65 ⇄ 20.254`; the edge owns `20.1`) joins the `10.x`
  and `20.x` network instances; cross-subnet frames take exactly one router
  hop per crossing (`routed` counter counts each direction), and sends to
  unregistered `20.x` hosts fail loud.
- **CDN Edge (`#node-cdn`, `#cdn-entries-list`):** In Stage 6, the CDN edge
  (`20.1`) sits on Ring 8 — the outermost infrastructure layer, closest to the
  clients — and displays hit/miss/fill counters (`#cdn-stats`) and its fill
  ledger rows with remaining TTL. A GET whose DNS answer lives in subnet 20
  crosses the Router to the edge: inside the edge TTL it serves from its fill
  ledger (6-hop trace); a MISS pulls the origin through the Router into the
  real Stage 5 chain (the pull does a real `lb.enqueue` + backend drain) and
  fills the ledger. The edge is GET-only: any other method passes through to
  the origin untouched (its ledger never sees a POST). Editing an origin file
  does not evict the edge — stale-at-the-edge is observable until TTL expiry,
  the same staleness rule the origin Cache obeys.
- **Cache Entries & Tick TTL (`#node-cache`, `#cache-entries-list`):** In Stage 3,
  `Cache` (`10.20`) sits on Ring 1 (shared cache-aside tier behind `WebServer-1`
  and `WebServer-2`) and displays its hit/miss/TTL counters (`#cache-stats`) and
  live cached `Map` keys with remaining TTL in ticks (`#cache-entries-list`).
- **Database Primary/Replica & Replication Lag (`#node-db`, `#db-rows-list`):**
  In Stage 4, `Database` (`10.30` Primary / `10.31` Replica) sits on Ring 1
  behind `Cache` (`10.20`, Ring 2) and displays its read/write/lag counters
  (`#db-stats`) and live row versions (`#db-rows-list`, highlighting rows where
  `Replica` lags `Primary` with `.you-pill` / `var(--warn-soft)` until async
  replication completes).
- **Worker Queue & Async Workers (`#node-queue`, `#queue-jobs-list`, `#worker-state`):**
  In Stage 5, `WorkerQueue` (`10.40`) and `Worker` (`10.41`) sit on Ring 2
  between Database (Ring 1) and Cache (Ring 3). Clicking `#node-queue` or `#node-worker`
  shows live enqueued jobs (`#queue-jobs-list`), worker execution state (`#worker-state`),
  and job completion counters (`#queue-stats`).

## Do's and Don'ts

**Do**

- Give every trace, camera, and load control a non-empty `title` attribute
  (primary controls are sim/camera state changes; the learner should never have
  to guess `Start` vs `Step 1 tick`).
- Keep every protocol string, mini-IP address, and queue item in `var(--mono)`
  with `tabular-nums` on counters so live updates do not jitter.
- Make every new stack component introduced in Stages 2–6 a clickable
  `.node-card` registered in the Component Code & State Inspector.
- Keep production `js/**` and `css/**` files ≤ 300 lines, `test/**` and `e2e/**`
  ≤ 450 lines, and static `*.html` ≤ 550 lines (`guard-file-size.mjs`).
- Keep world-space `(left, top)` coordinate writes under `js/panel/viewport.js`
  (`positionParts`) so every element on an orbital ring moves in lockstep when
  layout geometry changes (`DL-1`).

**Don't**

- Don't hide component state behind aggregate numbers alone — show the actual
  messages on the wire, in the queue, and in the browser viewport.
- Don't use inline event handlers or inline styles (CSP violation).
- Don't add colors outside the front-matter palette without amending this file.
