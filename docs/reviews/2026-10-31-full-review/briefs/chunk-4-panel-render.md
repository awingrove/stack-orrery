# Chunk 4 — Panel render — Context Brief

## Layer map

- Import graph (`→` = imports):
  `panel.js` → `{ render, renderInspector, $, els }` (render.js) + `{ renderStageTopology,
onStageRendered }` (render-stage.js) + `initViewport` (viewport.js) (panel.js:9-16).
- `render.js` → `render-stage.js` (renderHopHighlights/renderDots/renderRingBrowsers) at
  render.js:11; `render-stage.js` → `hop-targets.js` (activeHopTarget) at render-stage.js:7.
- `viewport.js` → `layout.js` (computeStageLayout) viewport.js:5, `camera.js` (camera math)
  viewport.js:6-12, `orrery-svg.js` (drawOrrery) viewport.js:13.
- `layout.js` → `layout-geo.js` (polarToWorld/computeSatellites/makeWire) layout.js:1 and
  `layout-stage6.js` (STAGE6_RINGS/buildStage6Extras) layout.js:2; re-exports `polarToWorld`
  for camera-pillar consumers (layout.js:4-5).
- Embedded-vs-external stage6 convention: stages 1–5 geometry is inline in `layout.js`
  (STAGE_RINGS table lines 9-46, stage branches in computeStageLayout); stage 6 lives
  externally in `layout-stage6.js` (STAGE6_RINGS + buildStage6Extras) and is merged at
  layout.js:45 (`6: STAGE6_RINGS`) and layout.js:264-272. Same split pattern for render:
  stage-6 HUD is `renderStage6Hud` inside render.js (render.js:107-125) while stage-6 DOM
  cards are JS-injected by `stage6-registry.js` (render-stage.js:11-13 documents lazy lane
  lookups for that reason).
- Consumers: camera.js ← viewport.js only, plus unit suite test/panel/camera.test.js;
  layout-geo.js ← layout.js + layout-stage6.js "so the per-stage registries share them"
  (layout-geo.js:1-4); orrery-svg.js ← viewport.js only.

## Per-file inventory

- `render.js` (262): exports `$`, `els`, `renderInspector`, `render` — snapshot→DOM
  translation (tick/queue/status badges, LB/cache/db/worker/DNS/CDN/router HUDs, filesystem
  rows, inspector, missions+fault console hooks, then hop/dot/ring-browser calls). Consumer:
  panel.js.
- `render-stage.js` (141): exports `onStageRendered`, `renderStageTopology`,
  `renderHopHighlights`, `renderDots`, `renderRingBrowsers` — per-stage card/wire-column
  visibility, `.active-hop`/`.lane-active`/`.selected-node` DOM writes, crowd dots, compact
  outer-ring browser buttons. Consumers: render.js, panel.js; viewport.js registers
  `onStageRendered` via panel.js.
- `layout.js` (287): exports `DEFAULT_RING_GAP`, `ORRERY_RINGS`, `buildOrreryRings`,
  `computeStageLayout`, re-exported `polarToWorld` — per-stage ring ladder, node polar
  seats, wire list, browser slots, bounds. Consumers: viewport.js, camera.test.js,
  layout-stage6.test.js.
- `layout-stage6.js` (72): exports `STAGE6_RINGS`, `buildStage6Extras` — stage-6 ring
  ladder (9 rings) + DNS/Router/CDN node seats, their 3 wires, `boundY`. Consumer: layout.js.
- `layout-geo.js` (40): exports `polarToWorld`, `computeSatellites`, `makeWire` — pure
  plane math. Consumers: layout.js, layout-stage6.js.
- `orrery-svg.js` (42): exports `svgEl`, `drawOrrery` — turns a layout into the
  `#orrery-svg` picture (core circle, one ring per layer, one spoke per wire, one
  satellite dot per browser slot). Consumer: viewport.js.
- `hop-targets.js` (197): exports `activeHopTarget` — snapshot+hop → `{cardId, laneId}`
  highlight mapping per stage. Consumer: render-stage.js.
- `camera.js` (101): exports `MIN_ZOOM`, `MAX_ZOOM`, `WORLD_BOUNDS`, `createCamera`,
  `panCamera`, `zoomCameraAt`, `fitCameraToBounds`, `worldExceedsViewport`,
  `createAutoRefit`, `formatWorldTransform` — pure DOM-free camera math + auto-refit
  armed/cancelled machine. Consumer: viewport.js (+ camera.test.js).
- `viewport.js` (300): exports `initViewport` — camera state ownership, all world-space
  `(left, top)` writes (`positionParts`, viewport.js:120-147, per DESIGN.md DL-1 rule),
  SVG draw call, every camera interaction listener (buttons, drag, wheel, keyboard),
  ring-gap/zoom-speed sliders, `syncLayout`/auto-refit. Consumer: panel.js.

## Geometry sourcing facts

- Geometry is programmatic polar math from layout parameters, not coordinate tables:
  `polarToWorld` is `x: Math.round(radius * Math.cos(rad)), y: Math.round(radius *
Math.sin(rad))` (layout-geo.js:6-9). `STAGE_RINGS` (layout.js:9-46) is a table of ring
  _ids/labels only_; radii are derived `r_k = (k + 1) * gap` (layout.js:61). Per-stage
  node seats are computed via `pos(id, ring, radius, angleDeg)` built on `polarToWorld`
  (layout.js:78-84) with explicit per-stage angles (e.g. stage 1 webserver 180°
  layout.js:122; stage ≥3 backends 200°/160° vs stage-2's 210°/150° — layout.js:149-150).
  The only hand-pinned world numbers left are `LANES_BETWEEN.capDx: -175` "15.5rem card
  half + chip half + margin, in world px" (viewport.js:77) and bounds margins
  `minX: -(outerRadius + 180), maxX: 120` (layout.js:281-282).
- How stage6 extensions extend layout: `STAGE6_RINGS` replaces the stage-6 ladder
  (layout.js:45); `buildStage6Extras(gap, { network, browser })` extrapolates radii as
  `6/7/8 * gap` (layout-stage6.js:36-38), seats node-router on ring-network 150°,
  node-dns at 205°, node-cdn at 155° with `polarToWorld` (layout-stage6.js:44-59), pushes
  three spoke wires (layout-stage6.js:62-66), and returns `boundY = max |y| reach + 180`
  (layout-stage6.js:67-71) which computeStageLayout folds into its returned bounds
  (layout.js:263-272, 283-285).
- Browser slots: slot 0 (10.2) pinned at 180° on the outer ring (layout.js:96), slots
  1..N-1 placed by `computeSatellites`, which splits counts left (`place(leftCount, 135)`)
  and right (`place(rightCount, 188)`) with even arc spacing `(j+1)/(arcCount+1) * 37` over
  the start angle (layout-geo.js:11-26). The expanded `#node-browser` card takes the
  active slot's coordinates (layout.js:106-116).
- `renderRingBrowsers` sets compact-button `style.left/top` from `slot.x/slot.y`
  (render-stage.js:128-130); `positionParts` repositions them from `layout.browserSlots`
  (viewport.js:140-145) — both source the same layout object; the nodes/coords are not
  duplicated in two places. All card positioning is delegated to `positionParts` per the
  DESIGN.md DL-1 rule (DESIGN.md:489-491).
- `ORRERY_RINGS = buildOrreryRings(DEFAULT_RING_GAP, 1)` is a stage-1 default snapshot
  exported for consumers/tests (layout.js:48); render-built rings/spokes/sats all come
  from the layout passed to `drawOrrery` (orrery-svg.js:14-41). `drawOrrery` fully
  `replaceChildren`s the SVG each call (orrery-svg.js:41).

## Trace narrative sourcing facts

- The renderer does not mint frame text. `render()` sets `els.lastFrame.textContent =
labels.networkLastFrame` and `els.exchange.textContent = labels.exchangeSummary`
  (render.js:200, 197), where `describeSnapshot` passes through sim records:
  `networkLastFrame: snapshot.lastFrame ?? 'No frames routed yet'` (model.js:247) and
  `exchangeSummary: last ? \`${last.from} -> ${last.to} ${last.request} => ${last.response}\`
  : 'No requests served yet'`(model.js:236-238).`snapshot.lastFrame`originates in the
sim: engine sets`lastFrame = "${lastExchange.from} -> ${lastExchange.to} |
  ${lastExchange.request} => ${lastExchange.response}"` (js/sim/engine.js:190) or the
trace machine's returned frame (`js/sim/engine.js:214-215`calls`traceMachine.step`, which returns "the hop's lastFrame string" — js/sim/trace.js:91).
Helper frames are minted from real records in js/sim/trace-helpers.js (`lbEnqueuedFrame`line 55,`lbRefusedFrame`61,`workerTailFrame`74,`dbHopFrame` 92).
- Journey-log entries are the sim frame verbatim with a generated label:
  `addToJourney(\`hop ${snapshot.trace.hop}/${totalHops}\`, snapshot.lastFrame, ...)`
  (panel.js:174); tick entries likewise (panel.js:90-93, 129-130). The compare tray pins
  "Frame texts pass through byte-verbatim … never mints, rewrites, or summarizes hop
  frames (DL-1/DL-3)" (model.js:134-140).
- The hop→highlight mapping (`activeHopTarget`) keys off snapshot.state, not strings:
  branches read `snapshot.trace?.targetServer === '10.12'`, `dbOp === 'WRITE'`,
  `asyncJob`, `edgeStatus === 'HIT'`, `snapshot.trace?.host`, `snapshot.trace?.cdn`,
  `hop <= 2` (hop-targets.js:16-21, 107-120). Hop index tables are stage-shape constants
  — a per-stage card/lane matrix, not prose; DEFAULT_HOPS fallback table for stages 1-4
  is `TOTAL_HOPS` in model.js (`totalHops: TOTAL_HOPS[stage] ?? 4`, model.js:185).
- HUD counters are label math over live snapshot fields (model.js:198-235: LB next/pool
  from `snapshot.loadBalancer.nextBackend`/`perBackend`, cache/db/queue stats from
  `snapshot.cache`/`database`/`workerQueue`, DNS/CDN/Router from `snapshot.dns/cdn/router`),
  rendered into rows by `renderRowsInto` one row per entry (render.js:92-101) — map-on-
  screen pattern per DESIGN.md (`#cache-entries-list`, `#dns-entries-list`, `#db-rows-list`,
  `#queue-jobs-list`, DESIGN.md:439-474).

## Camera/viewport math facts

- Camera is pure math: createCamera validates finite inputs, zoom > 0, clamps to
  `WORLD_BOUNDS {minX:-3100, maxX:600, minY:-900, maxY:900}` and `MIN_ZOOM 0.25 /
MAX_ZOOM 2.0` (camera.js:5-26). Transform chain: `formatWorldTransform` computes
  `tx = w/2 - cam.x*zoom, ty = h/2 - cam.y*zoom` → `translate(tx,ty) scale(z)`
  (camera.js:97-101); `apply()` writes it to `worldEl.style.transform` (viewport.js:113-117).
  Pan: world delta `- dxScreen/zoom` (camera.js:29-35); zoom-at-cursor keeps the world
  point under the cursor fixed (camera.js:39-48); fit: center-of-bounds + zoom
  `min((w-2p)/spanX, (h-2p)/spanY)` (camera.js:51-59).
- Auto-refit is an armed/cancelled machine (camera.js:76-93): manual actions (zoom buttons,
  drag `pointerdown`, wheel, keyboard) call `autoRefit.cancel()` (viewport.js:181, 201,
  224, 244); only a stage or user-count change re-arms (`if (lastStage !== layout.stage ||
prevUsers !== lastUsers) autoRefit.rearm()`, viewport.js:165); stage switch / init
  reframe unconditionally plus `shouldRefit` overflow check (viewport.js:167-172).
- viewport.js responsibilities near the size gate: module-level tables `LANE_WIRES`
  per stage (lane→wire anchor id, optional fraction `t`; stage-5+ pins
  `['wire-cache-db', 0.3]`, viewport.js:37-63) and `LANES_BETWEEN` (lb-backends midpoint
  across parallel wires; servers-cache `capTo: 'node-cache', capDx: -175`,
  viewport.js:66-79); `positionParts` writes node card `left/top`, lane anchors via
  `at(a,b,t)` interpolation, compact browser slots, then `drawOrrery` (viewport.js:120-147);
  `syncLayout` re-derives layout from `getStage()/getUsers()/ringGapSlider` and
  conditionally refits (viewport.js:150-175); interaction listeners for HUD buttons
  (`btn-zoom-in/out/fit`), pointer drag with `INTERACTIVE_TARGETS` closest() bail-out,
  wheel (passive:false), keyboard `KEY_PANS`/`+`/`-`/`0` (viewport.js:25-30, 197-260);
  sliders `ring-gap-slider` (live reposition, camera NOT reset, viewport.js:262-272) and
  `zoom-speed-slider` (viewport.js:275-278); returns API `{syncLayout, getCamera,
getLayout, panBy, zoomBy, fitToView}` (viewport.js:282-299).

## Contract touchpoints

- `test/panel/render.test.js`: pins the pure journey-log ordering contract the renderer
  consumes (`orderJourneyEntries`/`journeyEntryIsBefore` from model.js, lines 2-7) —
  render.js itself is "DOM-bound (document-dependent at module load)" so the suite pins
  the pure helpers, including the counter-example "hop 2/4 must not appear above hop 1/4"
  (lines 16-30).
- `test/panel/camera.test.js`: unit-pins camera math + layout geometry
  (`computeStageLayout`, `polarToWorld`, `buildOrreryRings` imported from layout.js,
  lines 2-20) — the layout-geo.js:4 claim "unit-pinned in test/panel/camera.test.js".
- `test/panel/layout-stage6.test.js`: "Stage-boundary extraction from camera.test.js
  (guard-file-size)" — pins the 9-ring ladder (radii 400..3600 = k*400), ring labels, the
  DNS/Router/CDN node seats (`layout.nodes['node-dns']` toEqual shape, line 41), and DNS
  wire endpoints (`y2: -1183`, line 116).
- data-testid usage in this chunk: render-stage.js sets `button.dataset.testid =
\`browser-node-${slot.address}\``(render-stage.js:127) — pinned by e2e
(orrery-plane.spec.js:70-102 clicks`browser-node-10.3`/`10.2`); hop highlighting is
exercised via id/class in e2e (`#node-dns.active-hop`, `#packet-req-dns.lane-active`,
e2e/panel-stage6.spec.js:83-90) and fault chips via `[data-testid="node-down-chip"]`/`node-dropped-chip`/`node-bypass-chip` (fault-console*.spec.js, panel-stage6.spec.js).
- DESIGN.md sections this layer implements: "Orrery Plane & Camera Viewport"
  (DESIGN.md:150-196 — rings r_k = k*ringGap, stage 1-6 ring/node maps, camera HUD
  `#ring-gap-slider` default 400px 180–560 step 5, zoom speed slider); "Wire Lanes"
  (DESIGN.md:222-231 — LANE_WIRES + the pinned `wire-cache-db` t=0.3 exception);
  DL-1 world-position rule (DESIGN.md:489-491); queue-full-surface inspector cards
  (DESIGN.md:415-474; rows rendered from live Maps); camera HUD (`#zoom-status`,
  viewport.js:116); rail input contract ("the camera's wheel/pointer handlers were
  therefore unguarded... a gesture on the plane is camera input", DESIGN.md:245-259,
  implemented by viewport.js:18-23 INTERACTIVE_TARGETS note).

## Risk hotspots

- `viewport.js` is 300 lines — exactly the `guard-file-size.mjs` production gate (300);
  any addition (a new lane anchor table row is fine, a new feature is not) busts the cap.
- `hop-targets.js` at 197 lines for one job (per-hop table lookup): five near-identical
  per-stage owner/lane matrix literals (stage-3 vs stage-2 differ only by cache rows;
  stage-4 duplicate inside the stage-6 nons-hosted replay via `hop - 2` re-use). Its
  header states "unit-pinned shapes in test/panel/render.test.js and model-stage6.test.js"
  (hop-targets.js:5-6) but grep finds no import of `activeHopTarget` or `hop-targets` in
  test/** — the mapping is exercised only indirectly through e2e (`#*.active-hop` /
  `#*.lane-active`, e2e/panel-stage6.spec.js:83-90,110-118 CDN chain).
- Layout stage duplication: stages 2–5 share one `else` branch in `computeStageLayout`
  with per-stage conditionals (layout.js:139-259), and stage 6 lives in
  `layout-stage6.js`; two tables (`LANE_WIRES` in viewport.js vs `makeWire` calls in
  layout.js) must stay name-synced for all six stages (e.g. `wire-dns` →
  `wire-browser-dns`, viewport.js:59 → layout-stage6.js:64).
- `laneCache` in render-stage.js caches lane element lookups once and deletes missing ids
  (render-stage.js:14-44) — a lane appearing later than stage-6 DOM injection is
  documented as the reason for lazy re-read on first call only.
- Duplicated default-value strings: e.g. `'Send a request or step a hop to render a
response.'` appears at render.js:206 and model.js:246; `createCamera` defaults
  `x = -360, zoom = 0.78` (camera.js:17) while viewport's default ring gap 400 and zoom
  step 1.2 are redefined locally as `DEFAULT_RING_GAP` (viewport.js:16, layout.js:7).
- No TODO/FIXME/HACK markers in any listed file (grep clean). `render.js` rides three
  hook layering sites at its own 300-gate: `renderFilesystems` → `renderRoutes` ordering
  (render.js:214-217), `updateMissions`/`updateFaultConsole` "same existing hook" comment
  (render.js:248-254), and the inspector headline re-write at the tail (render.js:258-261).
