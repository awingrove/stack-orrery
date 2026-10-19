# Pannable Orrery Plane & Concentric Ring Layout

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Every design decision below is signed off by the human. Execute mechanically and
keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, existing test assertion, threshold, or manifest
  rule to make a gate pass. All existing Stage 1 and Stage 2 unit and e2e tests
  must pass unchanged.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers, inline
  scripts, or inline `style=""` attributes in HTML (`scripts/static-server.mjs`
  sends `script-src 'self'; style-src 'self'`).
- **Determinism.** `js/sim/**` stays 100% untouched and camera-unaware.
- **Claim vocabulary.** Every guarantee-comment must start with `CHECKS:`,
  `PINS:`, or `DOCUMENTS:`. Do not write bare guarantee words (`guarantees`,
  `always`, `never`, `ensures`, `will` used as a promise) outside a claim
  keyword.
- **File size.** Production modules (`js/**`, `css/**`) ≤ 300 lines, tests
  (`test/**`, `e2e/**`) ≤ 450 lines, static HTML (`*.html`) ≤ 550 lines
  (`scripts/guard-file-size.mjs`).
- **Same-change manifests.** Update `slices.yaml` and `storymap.yaml` in the
  same commit as slice code (`scripts/guard-slices.mjs`).

## Pre-decided component & UI contracts

### 1. `js/panel/camera.js` (new pure camera math module, zero DOM)

Exports:

- `MIN_ZOOM = 0.35`, `MAX_ZOOM = 2.0`, `WORLD_BOUNDS = { minX: -1200, maxX: 600, minY: -650, maxY: 650 }`.
- `createCamera({ x = -360, y = 0, zoom = 0.78 } = {})`:
  - Validates `Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(zoom) && zoom > 0`
    (`CHECKS:`); throws `Error('camera: x, y, and zoom must be finite numbers with zoom > 0')`.
  - Clamps `zoom` to `[MIN_ZOOM, MAX_ZOOM]` and `(x, y)` to `WORLD_BOUNDS`.
- `panCamera(cam, dxScreen, dyScreen)`:
  - Shifts world center inversely to zoom (`x: cam.x - dxScreen / cam.zoom`,
    `y: cam.y - dyScreen / cam.zoom`) and returns a clamped camera via `createCamera`.
- `zoomCameraAt(cam, factor, cursorOffsetX = 0, cursorOffsetY = 0)`:
  - Computes `nextZoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM)`.
  - Keeps the world point under `(cursorOffsetX, cursorOffsetY)` (offset from
    viewport center in screen px) stationary:
    - `worldX = cam.x + cursorOffsetX / cam.zoom`
    - `worldY = cam.y + cursorOffsetY / cam.zoom`
    - `nextX = worldX - cursorOffsetX / nextZoom`
    - `nextY = worldY - cursorOffsetY / nextZoom`
  - Returns `createCamera({ x: nextX, y: nextY, zoom: nextZoom })`.
- `fitCameraToBounds(bounds, viewportWidth, viewportHeight, padding = 48)`:
  - Given `{ minX, maxX, minY, maxY }` in world coordinates and viewport pixel
    dimensions, returns `createCamera({ x, y, zoom })` centered on `bounds`
    and scaled to fit inside `(viewportWidth - 2 * padding, viewportHeight - 2 * padding)`.
- `formatWorldTransform(cam, viewportWidth, viewportHeight)`:
  - Returns the CSS transform string
    `translate(${Math.round(viewportWidth / 2 - cam.x * cam.zoom)}px, ${Math.round(viewportHeight / 2 - cam.y * cam.zoom)}px) scale(${Number(cam.zoom.toFixed(4))})`
    that maps world `(0, 0)` into the viewport.

### 2. `js/panel/layout.js` (new pure concentric-ring orrery geometry module, zero DOM)

Models the **Concentric Orrery Rings** with server/data resources at the center
and clients on the outer orbit:

- `DEFAULT_RING_GAP = 400`.
- `ORRERY_RINGS`:
  - `{ id: 'ring-compute', radius: 267, label: 'RING 1 · COMPUTE' }`
  - `{ id: 'ring-network', radius: 667, label: 'RING 2 · NETWORK' }`
  - `{ id: 'ring-clients', radius: 1067, label: 'RING 3 · CLIENTS' }`
- `buildOrreryRings(ringGap = DEFAULT_RING_GAP)`:
  - When `ringGap === DEFAULT_RING_GAP`, returns `ORRERY_RINGS` (`[267, 667, 1067]`).
  - Otherwise scales `r1 = Math.round((267 * ringGap) / DEFAULT_RING_GAP)`,
    `r2 = r1 + ringGap`, `r3 = r1 + 2 * ringGap` and returns the 3 ring descriptors.
- `polarToWorld(radius, angleDeg)`:
  - Converts polar `(radius, angleDeg)` to `{ x: Math.round(radius * Math.cos(rad)), y: Math.round(radius * Math.sin(rad)) }`.
- `computeStageLayout(stage = 1, users = 5, { ringGap = DEFAULT_RING_GAP } = {})`:
  - Validates `stage === 1 || stage === 2` (`CHECKS:`).
  - Returns `{ stage, rings: ORRERY_RINGS, nodes, wires, satellites, bounds }`:
    - **Nodes** (map of card DOM id -> `{ id, ring, radius, angleDeg, x, y }`):
      - `node-browser`: `radius = 1067, angleDeg = 180` -> `(-1067, 0)` (Ring 3 · Clients).
      - `node-network`: `radius = 667, angleDeg = 180` -> `(-667, 0)` (Ring 2 · Network).
      - In **Stage 1**:
        - `node-webserver`: `radius = 0, angleDeg = 0` -> `(0, 0)` (Orrery Core).
      - In **Stage 2**:
        - `node-lb`: `radius = 267, angleDeg = 180` -> `(-267, 0)` (Ring 1 · Compute/Ingress).
        - `node-webserver`: `radius = 267, angleDeg = -48` -> `(179, -198)` (Ring 1 · Compute).
        - `node-webserver-2`: `radius = 267, angleDeg = 48` -> `(179, 198)` (Ring 1 · Compute).
    - **Wires** (array of `{ id, fromId, toId, x1, y1, x2, y2, midX, midY }`):
      - Connects `node-browser <-> node-network`, `node-network <-> node-webserver` (Stage 1)
        or `node-network <-> node-lb` and `node-lb <-> node-webserver` / `node-webserver-2` (Stage 2),
        plus midpoints for positioning `#wire-col-left`, `#wire-col-right`, and `#wire-lb-backends`.
    - **Satellites** (array of `{ index, x, y, angleDeg }`):
      - Reuses the `browserSlots` coordinates 1:1, so each
        `<circle class="orrery-satellite">` anchor dot sits exactly under its
        Ring-3 browser node on the outer orbit.
    - **Bounds**: `{ minX: -(r3 + 180), maxX: r1 + 130, minY: -(r1 + 130), maxY: r1 + 130 }`
      -> `{ minX: -1247, maxX: 397, minY: -397, maxY: 397 }` at the default gap.

### 3. `js/panel/viewport.js` (new viewport controller)

Exports `initViewport({ viewportEl, worldEl, svgEl, getStage, getUsers })`:

- Holds `camera` state, initializes by fitting or centering on the stage bounds,
  and applies:
  - `worldEl.style.transform = formatWorldTransform(camera, width, height)`
  - Positions each `.node-card` and `.wire-column` at its world `(x, y)` via
    `el.style.left = `${x}px`` and `el.style.top = `${y}px``.
  - Populates `#orrery-svg` (using `createElementNS('http://www.w3.org/2000/svg', ...)`):
    - Concentric `<circle class="orrery-ring">` tracks for `ORRERY_RINGS` + core marker.
    - `<line class="orrery-spoke">` spokes between active stage nodes.
    - `<circle class="orrery-satellite">` anchor dots at 1:1 `browserSlots`
  - Updates `#zoom-status` text (`${Math.round(camera.zoom * 100)}%`).
- Wires interactions (all via `addEventListener`, never inline):
  - `#btn-zoom-in`: `zoomCameraAt(camera, 1.2, 0, 0)`
  - `#btn-zoom-out`: `zoomCameraAt(camera, 1 / 1.2, 0, 0)`
  - `#btn-zoom-fit`: fits camera to active stage `bounds`
  - Pointer drag on `viewportEl` (ignoring interactive targets `button, input, select, a, .node-card`):
    pans the plane (`panCamera`) and sets `.is-panning` class while dragging.
  - `wheel` on `viewportEl`: prevents default page scroll and zooms toward cursor
    offset (`zoomCameraAt`).
  - `keydown` on `viewportEl`: `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` pan by `48px`,
    `+`/`=` zooms in, `-` zooms out, `0` fits to view.
- Returns `{ syncLayout(), getCamera(), panBy(dx, dy), zoomBy(factor), fitToView() }`.

### 4. `panel.html`, `css/panel/canvas.css`, `js/panel/render.js`, `js/panel/panel.js`

- `panel.html`:
  - Wrap `.orrery-canvas` inside `<div id="orrery-viewport" data-testid="orrery-viewport" class="orrery-viewport" tabindex="0" aria-label="Orrery plane viewport">`.
  - Add `<div class="camera-hud" aria-label="Camera controls">` with
    `#btn-zoom-in` (`data-testid="btn-zoom-in"`), `#btn-zoom-out` (`data-testid="btn-zoom-out"`),
    `#btn-zoom-fit` (`data-testid="btn-zoom-fit"`), and `#zoom-status` (`data-testid="zoom-status"`).
  - Inside `#orrery-world` (`data-testid="orrery-world"`, `.orrery-canvas.orrery-world`),
    place `<svg id="orrery-svg" data-testid="orrery-svg" class="orrery-svg" viewBox="-1100 -550 1600 1100" aria-hidden="true"></svg>`
    alongside the existing `.node-card` and `.wire-column` elements (`#wire-col-left`, `#wire-col-right`, `#wire-lb-backends`).
  - Keep every existing `id` and `data-testid` intact so all Stage 1 & Stage 2 tests pass unchanged.
- `css/panel/canvas.css`:
  - Style `.orrery-viewport` (`position: relative; overflow: hidden; height: 28rem; border-radius: 0.7rem; border: 1px solid var(--border); background: var(--bg); cursor: grab;`),
    `.orrery-world` (`position: absolute; top: 0; left: 0; transform-origin: 0 0;`),
    `.orrery-svg` (`position: absolute; left: -1100px; top: -550px; width: 1600px; height: 1100px; pointer-events: none;`),
    concentric `.orrery-ring`, `.orrery-spoke`, `.orrery-satellite`, `.camera-hud`,
    and positioned `.node-card` (`position: absolute; width: 15.5rem; transform: translate(-50%, -50%);`).

### 5. Tests & manifests

- Add `test/panel/camera.test.js`:
  - `pans world coordinates inversely to zoom and clamps to world bounds`
  - `zooms toward the cursor while keeping the cursor world point fixed`
  - `computes concentric ring coordinates and stage bounding boxes for the orrery`
- Add to `e2e/panel.spec.js`:
  - `should pan and zoom the concentric orrery plane and reset with Fit to view`
- Update `slices.yaml` and `storymap.yaml` in the same commit.

## Steps

- [x] **Step 1: Update `scripts/guard-file-size.mjs`, `AGENTS.md`, `DESIGN.md`, and commit this brief** at `docs/plans/2026-10-18-orrery-plane-camera.md`.
- [x] **Step 2: Implement `js/panel/camera.js`, `js/panel/layout.js`, `js/panel/viewport.js`, update `panel.html`, `css/panel/canvas.css`, `js/panel/render.js`, `js/panel/panel.js`, add unit tests in `test/panel/camera.test.js`, e2e test in `e2e/panel.spec.js`, and update `slices.yaml` and `storymap.yaml`.**
      Verify: `npm run verify` green. (Done in commit d86e53c; note: the plan's
      polar formula gives x=141 at -48° but the node table pins x=140 — the
      pinned card coordinates are honored and documented in layout.js.)
- [x] **Step 3: Tick completed steps in `docs/plans/2026-10-18-orrery-plane-camera.md`** and re-run `npm run verify`.
- [x] **Step 4: Add live on-screen tuning controls in the camera HUD (`#ring-gap-slider` + `#ring-gap-value` for ring spacing and `#zoom-speed-slider` + `#zoom-speed-value` for zoom speed) wired through `js/panel/layout.js` and `js/panel/viewport.js`, with unit and e2e assertions in `test/panel/camera.test.js` and `e2e/panel.spec.js`, and tick this step.**
      Verify: `npm run verify` green.
- [x] **Step 5: Replace the anonymous Crowd concept and path-chip shortcuts with addressable Browser nodes on Ring 3 (mini-IPs 10.2 through 10.(N+1)) — compact clickable browser nodes for all non-selected browsers, expanding the clicked browser into the full browser card (node-browser) with GET/POST chooser, URL input, Go button, and response display — and tick this step.**
      Verify: `npm run verify` green.
- [x] **Step 6: Retune the default ring spacing to 400px — DEFAULT_RING_GAP and #ring-gap-slider (min 180 / max 560 / step 5, readout #ring-gap-value start 400px), with camera HUD interactions (#users-slider, stage pills, browser expansion) preserving the current gap — #zoom-speed-slider dials down to 1.01x (min 1.01 / step 0.01), the SVG satellite dots reuse the exact browserSlots coordinates, and positionParts() moves the compact Ring-3 browser nodes live while the slider is dragged. Step 2's (140, ±156) pin at r1 = 210 retires with the old default; the ±48° polar values at r1 = 267 — (179, ±198) — are authoritative.**
      Verify: `npm run verify` green.
- [x] **Step 7: Place every component on its own layer ring (`r_k = k * ringGap`), with as many rings as the stage has layers (Stage 1 = 3 rings: WebServer on Ring 1, Network on Ring 2, Browsers on Ring 3; Stage 2 = 4 rings: WebServers on Ring 1, LoadBalancer on Ring 2, Network on Ring 3, Browsers on Ring 4), update unit and e2e tests, and tick this step.**
      Verify: `npm run verify` green. (Done: `buildOrreryRings(ringGap, stage)`
      emits one ring per layer and `computeStageLayout` seats every node on its
      layer's ring — Stage 1 at 180°, Stage 2 backends at 210°/150°; `bounds`
      frames the outer ring and origin; `WORLD_BOUNDS` widened with
      `MIN_ZOOM = 0.25`; the SVG box covers full circles up to r = 2500.)
