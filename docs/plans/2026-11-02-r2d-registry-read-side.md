# R2d — sim-owned registry read-side: the engine composes the interfaces table

Paydown for full-review finding 3-01 (recommendations.md Stage R2d; TD-9's
last sim-side surface dissolves). The panel's `network.interfaces` at
inspector-state.js:74-141 is a hand-rebuilt per-stage ternary — six stage
branches of literal mini-IP→role rows — while the rows themselves are
_composition knowledge_ the sim already has (each stage's component stack
is wired at engine construction). The finding's option (a) (`registry()`
off `network.registerServer`) fails the walk: DNS (10.60), the worker pair
(10.40/10.41), cache (10.20), the database pair, and the pool backends
beyond their LB routing are components the network never registered — a
read-side on the network would return a partial list and the truthfulness
drift the finding names would reenter through the missing rows. The
contracted mechanism is the honest middle: the ENGINE composes the
registry at construction from per-stage composition constants, the panel
consumes it plus its own browser/crowd rows.

## Walk-scope ledger (pre-contracted, R1a/R2a/R2b lesson)

- `registerServer` callers today (network.js:48 stores `{address, server}`
  only — no role): engine-pool.js:25 (LB seat), :31 (pool backends),
  :33; engine-stage6.js:47 (CDN into rightNetwork); router.js:41/51 (both
  legs); browser-seat.js:20 (an inert left-seat, stage-6b only).
- NOT registered anywhere: DNS, cache, database pair, worker pair — the
  per-stage interface rows for those are composition knowledge, not
  network-registered knowledge.
- Byte-pinned consumers: model-stage34.test.js:101/229-230,
  model-stage5.test.js:132-133, model-stage6.test.js:169 (+ instrument's
  render path via inspector-state's returned shape; the JSON shape key
  order must stay identical for the byte pins). e2e reads DOM only.
- inspector-state.js sits at 254 lines — the ternary delete nets it down
  ~40; the composition constants live in a NEW sim module, not in
  engine.js (which is at 298/300 — one call line + one import max).

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps.
- File sizes: engine.js ≤ 300 (298: one import + one call line net);
  inspector-state.js ≤ 300 (254 now, shrink target ~220); every new file
  ≤ 300. Deterministic sim; no `Math.random`/`Date.now` (guard bites).

## Boundary contracts (Step 2)

### 1. js/sim/registry.js (new, ~35 LOC)

- `buildRegistry(stage)` returns the ORDERED `[{address, role}]` list of
  the stage's sim components — the exact roles the panel narrates today:
  LoadBalancer 10.1; WebServer-1 10.11 / WebServer-2 10.12 (stage ≥ 2);
  Cache '10.20' (stage ≥ 3); Database (Primary) '10.30' / Database
  (Replica) '10.31' (stage ≥ 4); WorkerQueue '10.40' / Worker '10.41'
  (stage ≥ 5); DNS '10.60' / Router (left) '10.65' / Router (right)
  '20.254' / CDN edge '20.1' (stage 6). Ordered tables, not ternaries:
  rows accumulate by stage (each constant carries the rows it introduces
  plus the shared base rows — array concat, one row list per stage family,
  no multi-line string literals).
- CHECKS: names the finding (3-01 option-(a) rejected — network registration
  misses composition rows; option-(b) landed in the SIM layer so the panel
  reads sim truth) + the mini-IP quoting rule from inspector-state.js:86
  (keys quoted `'10.20'` etc.; never bare numeric literals).

### 2. engine.snapshot() exposes it

- engine.js imports `buildRegistry` from './registry.js' and adds
  `registry: buildRegistry(stage)` to the snapshot record (~2 lines net;
  ends ≤ 300). The registry is stage-stable (built once per snapshot from
  the stage; no per-tick recomputation cost worth avoiding — it is one
  `concat+filter`).
- Sim-side contract top: the registry is SIM truth — adding a Stage-7
  component means adding rows in registry.js, and the panel's shape
  refits itself without a stage-branch edit.

### 3. inspector-state.js consumes the read-side

- The six-branch ternary's `interfaces` blocks collapse: the shape's
  `interfaces` becomes `{ ...Object.fromEntries(snapshot.registry.map((
{ address, role }) => [address, role])), '10.2': 'Browser (You)',
Crowd: `${snapshot.users} simulated browsers` }` — plus PRESERVE the
  key order the byte pins expect (per R2a's relocation discipline: rows
  ordered exactly as in the constants; the browser/crowd rows stay
  panel-authored — the sim does not claim them).
- The two CHECKS comments at inspector-state.js:86 (mini-IP quoting) and
  the shape's stage-family ordering comment move with the consumer;
  the record's CLAN check for "sim reads the registry" rides object.id
  retrieval per the existing families' lead.
- The CHECKS naming: the regor panel's rows are the sim's composition
  truth; browser/crowd seats stay view-owned.

### 4. §Tests (titles verbatim — storymap refs)

1. NEW test/sim/registry.test.js: `buildRegistry composes the stage table — stage 1's webserver seat, stage 2..6 row accumulation in sim order, quoted mini-IP keys, and the stage-6 four-row tail (dns/router-left/router-right/cdn-edge)`.
2. test/panel/model-stage34.test.js:101/229-230 style pins unchanged
   (they ride the shape, which now derives from the sim registry — titles
   byte-unchanged; no manifest ordering risk).
3. test/panel/model-stage6.test.js:169's dns pin + a routing-leg pin if
   missing (grep first — the three interface aliases in each stage's
   tab list are the counter-examples).
4. No new unit tests beyond (1): the existing pins assert the shape; the
   only new surface is the registry module.

## Manifests same-change

- storymap.yaml: ONE story under the SIM slice titled verbatim per test 1.
- slices.yaml: same ref added under the SIM slice's tests list.

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-02; walk scope
      pre-contracted; reject list: option (a)'s network-registration registry
      vs the contracted engine-composed one — the finding's own text).
- [x] Step 2 (Executor sub-agent): cold implementation; `npm run verify`
      green; tick and commit.
- [ ] Step 3 (Lead session): `npm run metrics:extract -- <sessionID>`,
      append entry `R2D-REGISTRY-READ-SIDE`, tick, commit.
