# B-6f — Fault console slice 6: record dropped — NXDOMAIN, no GET ever emitted (stage 6, ladder finish)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first —
"### Fault Console" carries ALL SIX fault bullets. Human pre-approved (2026-10-31
"let's finish"). Executor = `opencode-go/mimo-v2.6-flash` per user direction
(2026-10-31); paid tier restored, fallbacks stay fallback-only.

## Target shape

Stage 6 gains one console row — **DNS record dropped**. `dns.setDropped(bool)`
purges `example.com` from the authoritative table AND the resolver ledger (a
stale 300-tick window must not keep serving a deleted record). Everything
downstream is EXISTING machinery narrating honestly: `lookup` answers
`{ status: 'NX' }`, the browser renders its real NX card, no GET is emitted,
no exchange finishes. `cd.example.com` still resolves; host-less URLs are
untouched. Restore re-adds the record (ledger empty → next lookup is a fresh
authoritative answer). The console-lattice story closes: every other fault
happens AFTER the request leaves; this one stops it before the wire.

## Hard rules

- Zero deps; strict CSP (addEventListener + textContent only); existing chip
  styles only. Executable conceptual model: fault state on the component
  itself; `Math.random()`, `Date.now()`, weakened guardrails/manifests
  forbidden. Off-fault, every replay/stats pin stays byte-green.
- **File caps (REPORT every extract):** `dns.js` 103, `engine.js` 298,
  `trace-stage6.js` 256 — fund via the existing extracts (`engine-faults.js`,
  `trace-helpers.js`, `model-stage6.js`; wiring verbatim). Tests ≤ 450.

## Boundary contracts (Step 2)

- **js/sim/dns.js:** `setDropped(dropped)` validates a boolean (fail-loud);
  `isDropped()`. ON the true flip: delete `example.com` from `answers` AND
  purge every ledger entry for that name (cd.example.com's ledger entry too —
  the purge is by-name exact); while dropped, `lookup('example.com', …)`
  takes the EXISTING NX branch (`lastLookup.status 'NX'`, return
  `{ status: 'NX', name, source: 'authoritative' }`) with NO new narration
  tokens invented anywhere. ON the false flip: re-add `example.com -> 10.1`;
  the ledger stays empty for that name (next lookup = AUTH). NEW counters for
  the mission evidence: `droppedLookups` (NX lookups for the dropped name
  only) and `reResolveAfterDrop` (the first OK for the name following a
  drop, counting at most once per drop era — a pre-drop OK can never count;
  CHECKS comment in file style). `snapshot()` gains `dropped`, both counters.
- **js/sim/engine.js (extract to `engine-faults.js` if needed):** stage-6
  expose `setDnsDropped(bool)` — fail-loud below stage 6 (no dns); route to
  `dns.setDropped`. Snapshot: `dropped` + the counters ride the existing
  `dns` snapshot object (verify the panel's stage-6 HUD reads it unchanged
  off-fault).
- **js/sim/trace-stage6.js:** the DNS ask/answer prelude and the NX branch
  are ALREADY narrated for unknown names — the ONLY changes allowed are: the
  prelude's answer hop may name the ledger's fresh AUTH vs HIT it already
  does, and the NX run keeps its byte shape (executors MUST NOT invent new
  frame tokens). NAMED COUNTER-EXAMPLES (DL): (1) an NX-drop run and an
  unknown-host NX run are byte-identical in every narrated line (the fault
  generates no new story — it starves an existing one); (2) host-less URLs
  (still 8 hops) are byte-identical with the fault on; (3) `cd.example.com`
  hosted runs (DNS ask/answer included) stay byte-identical with the fault
  on; (4) restored `example.com` runs narrate a fresh AUTH answer then the
  normal 200 served story (no NX residue).
- **js/panel/fault-console.js:** stage-6 row — testids `fault-toggle-dns`,
  `fault-state-dns` (chip `DROPPED`/`off`), label "DNS record dropped — the
  name no longer resolves"; wired to `engine.setDnsDropped`. Stages 1–5 rows
  byte-stable; the `node-dns` card carries the warn-tone chip (find the
  generalized-chip helper's kind convention; add a `dropped` kind reading
  `DROPPED`/`off` on `var(--warn)`/`var(--warn-soft)`, chip testid follows
  the same `node-<kind>-chip` pattern — node-bypass-chip precedent — REPORT
  the exact testid). Exactly one fault chip at a time.
- **js/panel/missions.js:** `MISSIONS[6]` gains `m6-nx` — goal "Drop the
  DNS record, read the NX card, restore it and resolve a real answer";
  detect `(s) => (s.dns?.droppedLookups ?? 0) > 0 && (s.dns?.reResolveAfterDrop ?? 0) >= 1`
  (`reResolveAfterDrop` can only move AFTER a drop era, so the two counters
  carry the ordering; helper in file style with CHECKS evidence semantics —
  ORDERING: the NX era must precede the OK era, pinned by its own test).
- **Missions-cap pin, decided HERE:** stage 6 carries 3 and gains a 4th —
  extend the cap title to the REAL counts (stages 1 and 3-6 carry four;
  stage 2 carries two to three), mirrored byte-stable in `slices.yaml` +
  `storymap.yaml` (NO `:` in fragments). e2e stage-6 mission counts to 4.
  REPORT every other pin touched with named cause; never weaken pins.
- **js/panel/teaching.js:** stage-6 narrative gains ONE sentence: a dropped
  DNS record is pre-transport failure — the browser shows NX and no GET is
  ever emitted; restore re-arms the name.

## Tests & manifests

- NEW `test/sim/dns-ledger-drop.test.js`: `setDropped` fail-loud validation;
  the true flip purges `example.com` and `cd.example.com` from BOTH tables
  (snapshot before/after); while dropped, `lookup('example.com')` returns
  NX with `droppedLookups` growing; `lookup('cd.example.com')` unaffected
  (`reResolveAfterDrop` does NOT count it — order pin); host-less stage-6
  traceHop runs byte-identical while dropped; restored flip re-adds the
  record → next lookup AUTH, `reResolveAfterDrop` counts exactly once;
  engine fail-loud on stage 5; the four DL counter-examples pinned;
  same-seed replay byte-green with the fault off.
- APPEND to `e2e/panel-stage6.spec.js` if room, else NEW
  `e2e/fault-console-stage6.spec.js` (respect 450; titles verbatim into
  storymap):
  - `should drop the DNS record from the rail console and watch the browser render NX with no GET emitted`
  - `should narrate the NX run exactly like an unknown-host run without inventing a frame`
  - `should verify the stage-6 NX mission only after drop and restored resolve`
- Manifests same change: `slices.yaml` SIM `unit_tests` gains the new test;
  `storymap.yaml` the dns-drop story under the sim-faults activity;
  unit/e2e titles byte-identical.

## Execution steps

- [x] Step 1 (Lead session): human "let's finish" 2026-10-31 after PR #27;
      DESIGN.md dns-drop bullet committed here; executor = paid MiMo
      `opencode-go/mimo-v2.6-flash` (user direction 2026-10-31).
- [x] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests,
      manifest updates, green `npm run verify`, tick and commit (DEMO shots).
- [x] Step 3 (Lead session): strict acceptance probe over every boundary
      contract (including the byte-identical-NX and cd.example.com-immune
      counter-examples), metrics extraction, ledger entry, tick Step 3,
      commit. NOTE (2026-10-31): probe green FIRST PASS. LEAD REVIEW: DL(1)
      byte-identity is impossible across differing host literals — the
      normalized-equality + zero-fault-token pins are the honest landing
      (ACCEPTED); the faults-tab empty-state line is dead UI through the
      ladder (rebuild() path unpinned — follow-up candidate); era payout
      opens on the flip (documented by its test). Guard green: 168 unit /
      65 e2e.
