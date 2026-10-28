# B-6 — Fault console: real component fault state, refusal on the wire (slice 1: WebServer down)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first. Human design
sign-off 2026-10-27 (answering a three-option gate): **fault console on existing stages**,
**one fault one stage for slice 1**, console placed as a **fourth rail tab**, plus **one
stage-1 recovery mission**. DESIGN.md gained the "Fault Console" pattern section in this
commit.

## Target shape

A `Faults` tab joins Teach / Missions / Legend in the control-room rail. Stage 1 shows one
switch — **WebServer down** — that sets a real fault flag on the webserver component. With
the fault active, sends to `10.1` are **refused by the transport before reaching the
server**: crowd sends do not enqueue, the learner's trace aborts at the queue hop with a
`connection refused` frame, and the browser page does not render. Toggling back restores
service with nothing else changed. No new topology, no new stage — the ladder's "one
failure mode per stage" becomes explicit switches.

## Hard rules

- Zero deps; strict CSP (addEventListener only, textContent only, no innerHTML); token-only
  palette (`var(--danger)` / `var(--danger-soft)` for DOWN states — no new colors).
- **Executable conceptual model, never narrative:** refusal is component state consumed by
  the real code paths. Trace/UI frames narrate the actual refusal record — a refusal is
  **never** rendered as a `"<status> <body>"` HTTP string, never fakes a served record, and
  never emits async-202 frames (DL-1/DL-3/DL-4 vocabulary).
- Determinism: faults are explicit state toggles — no `Math.random()`, no `Date.now()`.
  With the fault off, every existing replay pin must stay byte-green.
- **File caps:** `rail.js` 123/300 (console lives in a NEW `js/panel/fault-console.js`,
  not in rail.js); `panel.html` 547/550 gains exactly ONE line (the `css/panel/faults.css`
  link); new `css/panel/faults.css` hosts the console + DOWN-chip styles; `missions.js`
  175 labels/registry only; `webserver.js` 291 and `network.js` 66 — new
  `css`/`js` files over 300 lines are forbidden, tests over 450.

## Boundary contracts (Step 2)

- **sim/webserver.js:** `setDown(down)` validates a boolean (fail-loud) and `isDown()` is
  exported. The down flag does NOT change `handleRequest`/`enqueue` behavior — the server
  is simply not consulted while down (the transport refuses first; a "down HTTP server"
  answers nothing on the wire).
- **sim/network.js — single refusal choke point:** `send()` AND `deliverToQueue()` both
  call `isDown?.()` on the resolved host BEFORE dispatching and return a refusal record
  `{ from, to, request, response: null, refused: true }` instead of a served record.
  Registered-but-down is refused, not thrown (unregistered addresses still fail loud).
- **sim/engine.js:** crowd sends that come back refused are counted, never enqueued —
  queue depth does not grow from refused sends. The engine snapshot gains
  `refusedCount` (refusals funnel through the one choke point, crowd and trace alike).
- **sim/trace.js (stage-1 branch):** the deliver hop's refusal ABORTS the trace story:
  refusal frame, no queue entry, no served record, and the learner's browser shows its
  refusal/error state, not a rendered page. **Named counter-example (DL-3): a refusal
  trace is NOT a clone of the 4-hop 200 story — it never renders a `200`/`404` body
  sentence on the refusal path, and the sim's `lastStatus` for the request stays null so
  NO existing mission detector (404/405) can be satisfied by a refusal.** Paths in other
  stages keep their stories (their hosts are never down in slice 1).
- **panel/fault-console.js (new):** `initFaultConsole()` mounts the console into the rail
  host `faults` (compare-tray injection precedent). Testids: `faults-section`,
  `fault-toggle-webserver` (the switch), `fault-state-webserver` (chip, text `DOWN` /
  `off`). Unknown stages show the console's empty-state line ("No faults for this stage
  yet."), never blank space or a crash.
- **panel/rail.js:** `TABS` gains `'faults'` (label `Faults`, testid `rail-tab-faults`);
  empty-state line for the faults host; `refreshRail` contract unchanged.
- **panel/render():** while down, the `10.1` node card carries the `DOWN` chip
  (`var(--danger)` on `var(--danger-soft)`) and stays in place — still addressable,
  simply refusing.
- **panel/missions.js:** `MISSIONS[1]` gains `m1-refuse-recover` — goal
  "Take the webserver down, watch the refusal, restore it and read a 200"; detect reads
  `(s) => (s.refusedCount ?? 0) > 0 && lastStatus(s) === 200` (a served 200 AFTER a refusal).
- **panel/teaching.js:** stage-1 narrative gains one sentence naming connection refused
  and pointing at the Faults tab.

## Tests & manifests

- NEW `test/sim/webserver-fault.test.js`: down-flag validation (fail-loud), down host's
  `handleRequest` unchanged for a direct caller, network send/deliverToQueue refusal shape
  on both entry points, refusals never enqueue, `refusedCount` on the snapshot, the
  refusal-then-restore sequence ends with a served 200, DL-3 counter-example pinned
  (`lastStatus` stays null across a refusal), and the same-seed replay pin still holds
  with the fault off.
- NEW `e2e/fault-console.spec.js`, titles verbatim in storymap:
  - `should toggle the webserver fault from the rail console and read connection refused in the trace`
  - `should keep crowd sends refused while down and restore a 200 after toggle-back`
  - `should verify the stage-1 recovery mission only after refusal and recovery`
- Manifests same change: `slices.yaml` — SIM `unit_tests` gains the new test, PANEL e2e
  gains the new spec (ground rows; REPORT the rows chosen); `storymap.yaml` — new story
  under the activity owning sim faults + the console with the three e2e titles + unit
  titles, names identical.

## Execution steps

- [x] Step 1 (Lead session): human design sign-off recorded (fault console / one fault one
      stage / fourth rail tab / recovery mission, answered 2026-10-27) committed with this
      brief and the DESIGN.md Fault Console amendment.
- [x] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests, manifest updates,
      green `npm run verify`, tick and commit (DEMO screenshots for the human visual gate).
- [ ] Step 3 (Lead session): strict acceptance probe over every boundary contract
      (including the DL-3 counter-example), metrics extraction, ledger entry, tick Step 3, commit.
