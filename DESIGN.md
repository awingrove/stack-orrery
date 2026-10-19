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

## Layout & Zones

Every stage diagram panel (`panel.html`) is organized into four vertical zones:

1. **Topbar & Stage Ladder (`.topbar` / `.stage-ladder`):** Shows the app brand
   and the scaling-ladder stage pills (`1 · Single Server` through `6 · Multi-Net / CDN`).
   Unlocked stages (`1 · Single Server`, `2 · LB / Dup Servers`) are clickable
   `<button class="stage-pill">` elements that toggle the active stage topology on
   the canvas (`aria-current="true"` and `.active-stage` on the selected stage).
2. **Control Strip (`.control-strip`):** Split into two groups:
   - **Single Request Trace:** `Send & Watch Hops`, `Step 1 Hop ->`, and the
     monospace `#hop-status` pill showing the current hop (`Hop 1/4` .. `Hop 4/4`
     in Stage 1; `Hop 1/5` .. `Hop 5/5` in Stage 2).
   - **Crowd Load:** Slider (`#users-slider`) for simulated browsers, `Start` /
     `Pause` (`#start-button`), and `Step 1 tick` (`#step-button`).
3. **Orrery Plane & Camera Viewport (`.orrery-viewport` / `.orrery-canvas`):**
   A pannable and zoomable 2D world plane (`.orrery-world`) inside a clipped
   viewport (`.orrery-viewport`) with concentric orbital rings etched in SVG
   (`#orrery-svg`, `r₀ = 0` Core, `r₁ = 210` Compute & Ingress ring, `r₂ = 520`
   Network ring, `r₃ = 840` Client orbit). Many client browsers orbit the outer
   perimeter (`Browser 10.2` + `10.3+` crowd satellites on `r₃`) sending traffic
   inward through `Network (10.x)` (`r₂`) toward the core server resources
   (`WebServer 10.1` at the `r₀` Core in Stage 1; `LoadBalancer 10.1` and
   duplicated `WebServer` nodes `10.11`, `10.12` on `r₁` in Stage 2).
   - **Camera HUD (`.camera-hud`):** Fixed screen-space overlay in the top-right
     of `.orrery-viewport` with `#btn-zoom-in` (`+`), `#btn-zoom-out` (`-`),
     `#btn-zoom-fit` (`Fit`), `#zoom-status` percentage badge, and live tuning
     sliders for **Ring spacing** (`#ring-gap-slider` + `#ring-gap-value`) and
     **Zoom speed** (`#zoom-speed-slider` + `#zoom-speed-value`). Supports
     pointer drag to pan, wheel/pinch zoom toward the cursor, and keyboard
     shortcuts (`Arrow` keys to pan, `+`/`-` to zoom, `0` to fit).
4. **Bottom Split (`.bottom-panels`):**
   - **Component Code & State Inspector (`.inspector-card`):** Side-by-side view
     of the selected component's executable JS source code (`#inspector-code`)
     and its live internal state JSON (`#inspector-state`).
   - **Wire Journey Log (`.log-card`):** Reverse-chronological hop and tick
     history (`#exchange-inspector` headline + `#journey-log` list).

## Components

### Component Nodes (`.node-card`)

- Every component on the canvas carries a header with its role name, a subtitle,
  its two-number mini-IP badge (`.ip-chip`, e.g. `10.2`, `10.x`, `10.1`), and a
  `</> Code` badge (`.code-chip`).
- Clicking any `.node-card` (outside interactive controls) selects that
  component in the bottom inspector (`.selected-node` border `var(--accent)`).
- During a hop-by-hop trace, the component executing the current hop carries
  `.active-hop` (`var(--good)` border glow).

### Interactive Mini-Browser (`.mini-browser`)

- Lives inside the Browser node (`10.2`).
- Provides an HTTP method selector (`#req-method`: `GET` / `POST`), target
  mini-IP prefix (`10.1`), editable path input (`#url-input`), `Go` button
  (`#btn-url-go`), and quick-path chips (`.path-chip` for `GET /`,
  `GET /about`, `GET /missing`, `POST /`).
- Renders the latest response in `.browser-viewport` with a status badge
  (`.status-200` green for `200`, `.status-err` red for `4xx`/`5xx`) and the
  response body text (`#browser-rendered-body`).

### Service Internals (Queues, Tables, Routes)

- **Visible FIFO Queues (`.queue-slots`):** Waiting requests inside a server or
  worker queue render as individual `.queue-pill` tokens (`10.4: GET /about`),
  never only an opaque progress bar. Requests originated by the learner's own
  interactive browser (`10.2`) carry `.you-pill` (`var(--warn)` amber highlight).
- **Filesystem & Interface Tables (`.route-list`, `.mini-table`):** Each
  `WebServer` displays the files on its local filesystem (`/` and `/about`),
  and the file served by the most recent `200` response carries
  `.matched-route` (`var(--good-soft)`). Intrinsic HTTP responses (`404`, `405`)
  live in the server's executable code rather than as configured rows.

## Do's and Don'ts

**Do**

- Keep every protocol string, mini-IP address, and queue item in `var(--mono)`
  with `tabular-nums` on counters so live updates do not jitter.
- Make every new stack component introduced in Stages 2–6 a clickable
  `.node-card` registered in the Component Code & State Inspector.
- Keep production `js/**` and `css/**` files ≤ 300 lines, `test/**` and `e2e/**`
  ≤ 450 lines, and static `*.html` ≤ 550 lines (`guard-file-size.mjs`).

**Don't**

- Don't hide component state behind aggregate numbers alone — show the actual
  messages on the wire, in the queue, and in the browser viewport.
- Don't use inline event handlers or inline styles (CSP violation).
- Don't add colors outside the front-matter palette without amending this file.
