# Stage 6a — DNS with tick-TTL ledger + cross-subnet Router (10.x ↔ 20.x)

**For agentic workers:** read `AGENTS.md`, `FACTORY.md`, and `DESIGN.md` first.
Execute mechanically from Step 2 and keep `npm run verify` green at every commit.

## Hard rules

- **NEVER** weaken a guardrail, test assertion, threshold, or manifest rule. Stage 1 remains default on `/panel.html` load.
- **Zero runtime dependencies.** Vanilla ESM only; no inline handlers/styles (CSP).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`.
- **Claim vocabulary.** Strict `CHECKS:`, `PINS:`, or `DOCUMENTS:` tags only.
- **File size.** Modules ≤ 300, tests ≤ 450, HTML ≤ 550 (`guard-file-size.mjs`; split by responsibility and update refs, never paste).
- **Same-change manifests.** `slices.yaml` + `storymap.yaml` in the same commit as the feature.
- **Stage-5 story stays byte-identical.** Every hop text, hop count, `202` route, and test pin for stages 1–5 passes unchanged.

## Negative-case contracts (DL-3/DL-4)

- **Trace branch on host syntax.** Stage 6 narrative branches on whether the
  browser path carries a host (`<host>/<path>`) or is host-less (`/<path>`).
  Named counter-example: `GET /about` on stage 6 keeps the stage-5 hop count
  and hop texts byte-identical — no DNS hop, no cross-subnet hop. §Tests pin it.
- **DNS TTL branch.** `lookup(name)` consults the authoritative table only on
  a cache miss or expired entry; a hit inside `ttlTicks` is an
  incrementing `cachedHits` with NO authoritative consult. Named counter-example:
  an expired entry must NOT be answered from the cache ledger. §Tests pin it.
- **Unknown-name branch.** `nope.example/about` must NOT emit a GET: the trace
  is DNS ask + `NX no record` answer, browser renders the NX card. §Tests pin it.
  Clarified at Step-3 review (open-state, before PR): there is NO addressing hop
  before the DNS ask in any hosted trace — the first wire message is the DNS ask;
  a listed hop must never present `GET <host>/...` toward a hostname as a wire
  frame (the browser's GET only becomes a wire token after resolution, inside
  the stage-5 chain at the resolved target).
- **Cross-subnet fail-loud.** A send into subnet 20 to an unregistered host
  (`20.9`) throws (DL-1 fail-loud, mirrors `network.js` today). §Tests pin it.
- **Deep-link live-stage set.** The live-stage list feeding `?stage=` extends
  to 6 in the same slice as `stage-pill-6`; unknown values still fall back to 1.

## Pre-decided boundary contracts

### 1. `js/sim/dns.js` (new component)

- Exports `createDns({ address = '10.60', ttlTicks = 300 } = {})`; validates
  mini-IP + integer `ttlTicks >= 1` (`CHECKS:`).
- Authoritative table in-component: `example.com -> 10.1` (Stage 6b adds a CDN name).
- `lookup(name, currentTick = 0)`: cache branch above; state `{ lookups,
cachedHits, authoritative, cache: [{ name, target, expiresAtTick }] }`.
- Unknown name: `{ status: 'NX' }` — never a throw at the DNS layer
  (the browser renders NX; the throw rule applies to cross-subnet addresses).

### 2. `js/sim/router.js` + cross-subnet routing in `js/sim/network.js`

- `createRouter({ leftAddress = '10.65', rightAddress = '20.1' } = {})`: joins
  the `10.x` and `20.x` network instances; any cross-subnet frame takes exactly
  one router hop, incrementing `routed` (trace shows the hop; `isYou` rides through).
- Same-subnet sends are unchanged from today's `send`/`deliverToQueue` contract.
- Nothing lives in subnet 20 in 6a besides the router's own presence:
  `20.9` fails loud, `20.1` (the router's 20-side) is the only reachable target —
  stage 6b occupies it with the CDN edge.

### 3. `js/sim/engine.js` + trace/model narrative

- `stage` validates `1..6` (`PINS:` the existing error-message shape updated);
  stage >= 6 instantiates DNS `10.60` + Router, exposes `snapshot.dns`,
  `snapshot.router`, and per-lookup traces drive `TOTAL_HOPS[6]`
  (hosted: stage-5's count + 2 DNS hops; host-less: unchanged).
- Hosted-path grammar: browser URL `example.com/about` splits host/path on the
  first `/`; host resolution goes Browser -> DNS (ask) then Browser emits the
  GET with the resolved target. Plain paths never touch DNS.

### 4. Orrery layout & UI (`js/panel/**`, `panel.html`, `index.html`)

- `layout.js`: Stage 6 registry = 8 rings (`RING 7 · DNS`, `RING 8 · BROWSERS`;
  DNS `10.60` on R7, Router card beside the `10.x` hub on R6 with an
  `ip-chip` reading `10.65 ⇄ 20.1`).
- `panel.html`: `#node-dns`, `#node-router` cards in the inspector registry;
  `stage-pill-6` becomes live. `index.html`: stage-6 card badge flips to Live
  with copy naming DNS + cross-subnet routing (CDN edge named as coming next).
- `js/panel/teaching.js`: `STAGE_TEACHING[6]` replaces the pending placeholder —
  headline + teaches/try/watchFor + tradeoff + primerLink (DNS section).

### 5. Tests & manifests

- `test/sim/dns.test.js`: TTL hit/miss branch (both counter-examples above), NX branch.
- `test/sim/router.test.js`: same-subnet passthrough unchanged; cross-subnet
  hop via router; `20.9` throws.
- `test/panel/model.test.js` (or split): narrative-branch pins — stage-6
  host-less = stage-5 story (counter-example); hosted adds exactly 2 DNS hops;
  NX path never emits a GET.
- `e2e/panel.spec.js`: `should switch to Stage 6, resolve example.com through DNS 10.60, and inspect DNS code + TTL ledger`;
  `should trace example.com/about with DNS ask + answer hops`;
  `should keep GET /about on Stage 6 at the Stage 5 hop story` (counter-example pin).
- `slices.yaml`: file ownership adds `js/sim/dns.js`, `js/sim/router.js`;
  `storymap.yaml`: Stage 6 activity `SIM-6` + `PANEL-6` rows with the same names as these test titles.

## Execution steps

- [x] Step 1 (Lead session): human design sign-off committed in `DESIGN.md` and this brief.
- [x] Step 2 (Executor sub-agent): cold implementation from brief contracts, unit & e2e tests, manifest updates, and green `npm run verify`; tick this box and commit.
- [x] Step 3 (Lead session): run `npm run metrics:extract -- <subagentSessionID>`, append entry to `docs/factory/slice-metrics.yaml`, tick Step 3, and commit.
