# B-6c — Fault console slice 3: cache bypassed — the miss storm and the cold rejoin (stage 3)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, `DESIGN.md` first — the
"### Fault Console (fourth rail tab)" section carries per-fault bullets (slice-1 refusals,
slice-2 health-skip, slice-3 cache bypass). Human pre-approved this slice by direction
("Continue", 2026-10-29): the console ladder moves to stage 3.

## Target shape

Stage 3 gains one console row — **Cache bypassed**. While on, GET lookups short-circuit
at the cache's own `isBypass()` consult: the origin serves every GET, the shared cache's
hits/misses counters freeze (nothing consults them), and — the teaching payoff — the
engine's tick loop keeps evicting expired entries on schedule, so a LONG bypass means a
**cold rejoin**: after restore, the first GET is a fresh MISS that fills anew. The cache
card shows a `BYPASS` chip in `var(--warn)` (out of the path, not down). Toggling off
rejoins the path.

## Hard rules

- Zero deps; strict CSP (addEventListener + textContent only); tokens only
  (`var(--warn)`/`var(--warn-soft)` for the BYPASS chip, `var(--danger)` stays DOWN-only).
- Executable conceptual model: the bypass is the cache component's own state short-
  circuiting its real lookup; narration reads the actual record. `Math.random()`,
  `Date.now()`, and weakened guardrails/manifests are forbidden. Off-fault, every
  existing replay/stats pin stays byte-green.
- **File caps (REPORT every extract):** `webserver.js` 300/300 and `engine.js` 300/300 —
  fund additions via the pure-helpers extract precedent (`trace-helpers.js`,
  `engine-stage6.js`; no behavior change, wiring identical). `cache.js` 104,
  `fault-console.js` 162, `faults.css` 81, `missions.js` ~201, `panel.html` 548/550,
  tests ≤ 450.

## Boundary contracts (Step 2)

- **js/sim/cache.js:** `setBypass(bypassed)` validates a boolean (fail-loud); `isBypass()`
  exported. While bypassed, `get()`/`has()` return without touching `entries` and
  WITHOUT moving hits/misses/sets/evictions (`get` hands back `null` with
  `lastLookup = { key, status: 'BYPASSED', atTick }`); `set()` semantics unchanged.
  TTL bookkeeping itself does NOT consult bypass — `evictExpired` runs whenever called.
- **js/sim/webserver.js (at cap — extract first):** move the pure helpers
  `parseRequest`/`matchRoute`/`routeIdFor` into NEW `js/sim/webserver-helpers.js`
  (trace-helpers precedent), then the bypass consult rides `resolveRequest`: when
  `cache?.isBypass?.()`, GETs take the origin path (route body, or the stage-4+ fill
  branch they would take on a MISS) and return `cacheStatus: 'BYPASSED'` — the cache
  `.get()`/`.set()` are NOT called (no fill while bypassed, so no zombie warm entries).
  Non-GET paths byte-unchanged ('BYPASS'/'ASYNC'/'INVALIDATE' tokens untouched).
- **js/sim/engine.js (at cap — extract if needed):** stage-3 expose ships
  `setCacheBypassed(bool)` (fail-loud when stage < 3: no cache exists there — route it
  to `cache.setBypass`); snapshot gains `bypassedCount:
serverSnapshots[0]?.bypassedCount?.() ?? 0` — the WEBSERVER counts routes it took the
  origin path on because of the fault (increment inside `resolveRequest`'s bypass
  branch; the tally lives on the webserver, not the unconsulated cache).
- **js/sim/trace.js / model.js:** the wire record already carries `cacheStatus`, so the
  bypassed GET's frames interpolate naturally — verify they read "cache BYPASSED" and
  the story walks all 6 hops. NAMED COUNTER-EXAMPLE (DL): a bypassed trace keeps the
  full stage-3 served story — origin-served 200 with the bypass named at the cache hop,
  NO refusal, NO abort, never a fake HIT/MISS status string; a NON-GET still renders its
  own byte-identical frame.
- **js/panel/fault-console.js:** stage-3 row — testids `fault-toggle-cache`,
  `fault-state-cache` (chip `BYPASS`/`off`), label "Cache bypassed — GETs go to origin";
  wired to `engine.setCacheBypassed`. Slice-1/slice-2 rows byte-stable; other stages
  keep the empty state.
- **js/panel/render (or the console's chip helper):** the `10.20` cache card carries a
  chip testid `node-bypass-chip`, text `BYPASS`, `var(--warn)` on `var(--warn-soft)`,
  while bypassed; cleared on rejoin. Exactly one fault chip on the page at a time (the
  DOWN chips keep `node-down-chip`); DOWN never reuses `var(--warn)`.
- **js/panel/missions.js:** `MISSIONS[3]` gains `m3-bypass-cold` — goal "Bypass the
  cache, watch GETs miss it, restore it and read a fresh HIT"; detect
  `(s) => (s.bypassedCount ?? 0) > 0 && lastExchange.cacheStatus === 'HIT'`
  (helper named in file style, e.g. alongside `lastStatus`/`perBackend`).
- **Missions-count pin, decided HERE (slice-1 and slice-2 lessons):** stage 3 currently
  carries 3 mission rows and gains a 4th — extend `test/panel/missions.test.js`'s cap to
  stages 1 and 3 carrying four, retitle in the same shape, and mirror byte-stable in
  `slices.yaml` + `storymap.yaml`. e2e stage-3 mission count assertions go to 4. REPORT
  every other pin you must touch, with its named cause (control-room-rail/missions
  pins may need stage-3-adjacent updates — do not weaken behavior pins).
- **js/panel/teaching.js:** stage-3 narrative gains one sentence on bypass: misses storm
  the origin until restore, and a long bypass rejoins cold because TTL kept expiring.

## Tests & manifests

- NEW `test/sim/cache-bypass.test.js`: `setBypass` fail-loud validation; bypassed
  `get`/`has` leave `entries` and counters untouched (assert via snapshot before/after);
  engine `setCacheBypassed` fail-loud on stage 1; a bypassed stage-3 GET returns origin
  body with `cacheStatus: 'BYPASSED'` and fills NOTHING; `bypassedCount` tallies;
  rejoin-cold is deterministic: entries expiring while bypassed produce fresh MISSes on
  rejoin which warm anew; the DL counter-example (bypassed story stays a full sourced
  200, no refusal/no fake status, non-GET frame unchanged); same-seed replay byte-green
  with the fault off.
- APPEND to `e2e/fault-console.spec.js`, titles verbatim into storymap:
  - `should bypass the cache from the rail console and watch the origin take every GET`
  - `should narrate the bypass in the stage-3 trace with a fresh HIT after rejoin`
  - `should verify the stage-3 cold mission only after bypass and rejoin`
- Manifests same change: `slices.yaml` — SIM `unit_tests` gains the new test; `storymap.yaml`
  — the cache-bypass story under the activity owning sim faults + the console; unit/e2e
  titles byte-identical; missions-cap retitle mirrored in both manifests.

## Execution steps

- [x] Step 1 (Lead session): human direction "Continue" recorded 2026-10-29 — slice 3
      pre-approved on the console pattern (cache bypass; miss storm; cold rejoin); DESIGN.md
      cache-bypass bullet committed with this brief.
- [ ] Step 2 (Executor sub-agent): cold implementation, unit & e2e tests, manifest updates,
      green `npm run verify`, tick and commit (DEMO screenshots for the human visual gate).
- [ ] Step 3 (Lead session): strict acceptance probe over every boundary contract
      (including the cold-rejoin and non-GET counter-examples), metrics extraction, ledger
      entry, tick Step 3, commit.
