# Stage R1 — Control-room remodel: two-zone page (Style 2, signed 2026-10-26)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first; execute Step 2 mechanically with `npm run verify` green at every commit. Human sign-off 2026-10-26 (choice among four styles; rationale: the only layout that needs no future in-canvas input fence, because nothing scrollable lives inside the camera viewport at all).

## Target shape

```
┌─ pills ─────────────────────────────────────────┐
├─ control strip ─────────────────────────────────┤
├─ viewport ──────────────────┬─ rail ────────────┤
│  orrery plane, camera HUD   │ [Teach][Mission]  │
│  only — nothing scrollable  │ [Legend] tabs     │
│  mounted on it              │ Inspector │       │
│                             │ Log/Compare       │
├─ HUD cards row ─────────────┴───────────────────┤
└─ bottom panels (browser/inspector/log) ─────────┘
```

- The teaching drawer, missions section, and legend drawer MOVE OUT of
  `#orrery-viewport` into a page-level right rail (`.rail`, ~20rem) whose
  three sources render as docked panels — one visible at a time (tabs:
  Teach / Mission / Legend), or stacked cards if tabs strain the height
  budget (decide in Step 2 and DEMO it in screenshots).
- The rail chrome and interactions must obey the standing patterns:
  `addEventListener` only, textContent only, strict CSP, DESIGN.md tokens.
- `DL-5`'s systemic gap closes here: no overlay/scroller remains inside the
  camera viewport, so viewport.js's wheel/pointer input can lose `.camera-drawer`
  ONLY IF nothing drawer-like is mounted on the plane any more (the e2e
  camera-drawer page pins get updated to pin the NEW invariant: wheel over the
  RAIL never feeds the camera, the plane wheel still zooms).

## Hard rules

- **NEVER** weaken a guardrail, test, threshold, or manifest rule. Zero deps; CSP; claims vocabulary; manifests same-change.
- **File caps:** js/css ≤ 300 (watch `viewport.js` 300, `panel.js` 299, `render.js` ~254, `canvas.css` 299 — split by responsibility, new modules OK), tests ≤ 450 (`e2e/panel.spec.js` 450 — touch it NOT), `panel.html` 546/550 (rail markup built in JS — NO template additions beyond ~2 lines; never delete a pinned testid).
- **Geometry is deterministic plane math** — the rail is page-level CSS; the plane's own geometry (layout.js, layout-stage6.js, camera.js) stays untouched. Auto-refit must still fit every stage's bounds in BOTH width regimes (viewport loses ~4rem width at desktop; the stage-6 9-ring fit must visibly hold and be screenshot-proven).
- **Responsive contract:** below ~1100px width the rail must fall back UNDER the viewport (single-column stacking) so the page never breaks; name the breakpoint and pin it with a resize e2e (or state why pixel asserts are flaky and probe manually instead — DEMO shots decide).

## Boundary contracts (Step 2)

- **State:** one `railTab` variable ('teach' | 'missions' | 'legend'), default 'teach'; `switchStage` keeps the current tab (the teaching drawer's open-state-persists precedent in teaching-drawer.js). Tab switch never touches the camera or the snapshot pipeline.
- **Move, don't rewrite:** the three surfaces move DOM-wise as their existing module mounts into rail nodes — teaching drawer content (teaching-drawer.js can mount its aside into the rail host), missions section (missions-view.js mounts into the rail, testids unchanged), legend panel (static in panel.html — move INSIDE the new rail section markup it builds, or relocate via a mountpoint; no pinned testid may change).
- **Kill the overlays:** `.teaching-panel`/`.legend-panel` lose their absolute positioning rules; the toggle buttons ( Teach/Legend in the camera HUD) stay as TAB toggles but move visual location into the rail header — OR keep both toggles' camera HUD slots as toggles-of-state with the panels visibly docked in the rail (choose; DEMO decides; testids for the toggles must stay so e2e keeps passing).
- **viewport.js fence:** keep `.camera-drawer` handling only if any scrollable
  surface remains in the viewport; with the remodel, USE THE CHECK: nothing
  drawer-like remains → the wheel/pointer guards can stay (defensive, no
  behavior) or go (cleaner, justified). Whichever — REPORT it and keep the
  plane's own zoom pins green.
- **Compare tray / inspector / log:** stay where they are (bottom panels) in
  this slice; the rail hosts ONLY teach/missions/legend. A follow-up slice may
  move inspector/log into the rail later (flag: separate design gate).

## Tests & manifests

- Updated e2e (`e2e/camera-drawer.spec.js`): the drawer-scroll pin becomes
  `wheel over the docked rail scrolls the docked panel without driving the
camera zoom` (same testids, new host), the drag pin and plane-wheel control
  pin keep their names/intents (titles may not need to change; keep byte-stable
  where content is identical to avoid manifest churn).
- NEW `e2e/control-room-rail.spec.js`: `should dock teaching, missions, and legend into the right rail with the plane unchanged` (stage switch: rail content follows, camera untouched); `should keep the rail tab state across stage switches`; `should collapse the rail under the viewport below the responsive breakpoint (or manual-probe fallback)`.
- Manifests: slices.yaml e2e adds the new spec; storymap: new story under the activity owning the camera/layout (ground rows; names identical).

## Execution steps

- [x] Step 1 (Lead session): human sign-off recorded (Style 2 chosen 2026-10-26 among four styles; bug-fence stopgap already landed on main in the same day's fix/camera-drawer-fence change) committed in this brief.
- [ ] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests, manifest updates, green `npm run verify`, tick and commit (screenshots in the report for the human visual gate).
- [ ] Step 3 (Lead session): strict probe (rail layout live, footer unchanged, responsive fallback, DL-5 gap closed by construction), metrics extraction, ledger entry, tick Step 3, commit.
