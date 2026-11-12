# Stage 6a DNS and Cross-Subnet Router — Executor Brief

Execute Step 2 of the committed factory brief `docs/plans/2026-10-24-stage6a-dns-crossnet.md` on branch `feat/stage6a-dns-crossnet` (current working directory: stack-orrery). The brief is your contract and source of truth — implement cold from it.

## Reading order

Read these before coding, in this order:

1. `AGENTS.md` — repo rules covering the static JS stack, CSP, determinism, gates, claim vocabulary, manifests same-change, and the requirement that trace/UI narratives consume actual component messages (DL-1, DL-3, DL-4).
2. `FACTORY.md` and `DESIGN.md` — note the new Stage 6 8-ring registry and the DNS/Router component sections.
3. The committed brief itself (`docs/plans/2026-10-24-stage6a-dns-crossnet.md`), especially its five negative-case contracts.
4. The existing components you will extend without breaking them:
   - `js/sim/network.js` (subnet-blind today; fails loud on unregistered hosts)
   - `js/sim/engine.js` (stage validation 1–5, additive topology)
   - `js/sim/cache.js` (tick-TTL ledger pattern that DNS mirrors)
   - `js/panel/model.js` (trace narrative builders, `TOTAL_HOPS`)
   - `js/panel/layout.js` (`STAGE_RINGS`)
   - `js/sim/trace.js`
   - `js/panel/teaching.js` (`STAGE_TEACHING`, stage 6 pending placeholder)
   - `panel.html` and `index.html`

## Deliverables

Per brief §1–§5, deliver all of the following on the branch:

- `js/sim/dns.js` — new component.
- `js/sim/router.js` — new component.
- Cross-subnet routing support in `network.js` and `engine.js`.
- Trace/model narrative branch covering hosted versus host-less paths.
- Stage 6 8-ring registry plus `#node-dns` and `#node-router` inspector cards, with a live `stage-pill-6` indicator.
- Stage-6 index card badge flip.
- Real `STAGE_TEACHING[6]` entry replacing the pending placeholder.
- Unit and e2e tests carrying the brief's pinned titles.
- `slices.yaml` and `storymap.yaml` updated in the same change (manifests same-change rule).

## Negative-case contracts (non-negotiable)

These five pins are contractually binding:

1. `GET /about` on stage 6 keeps the stage-5 hop story byte-identical — no DNS hop.
2. A DNS cache hit inside `ttlTicks` increments `cachedHits` with no authoritative consult; an expired entry never answers from the ledger.
3. `nope.example/about` never emits a GET — DNS ask plus `NX no record` only.
4. `20.9` throws (fail-loud behavior).
5. The `?stage=` live set extends to 6, with unknowns still falling back to 1.

## Hard rules

These constraints apply throughout:

- Zero runtime dependencies.
- No inline handlers or inline styles.
- Respect file caps; if a file exceeds its limit, split by responsibility and update the manifest references.
- Determinism in `js/sim/**` — no `Math.random()`, no `Date.now()`.
- Strict `CHECKS:`/`PINS:`/`DOCUMENTS:` claim vocabulary.
- Stages 1–5 tests and narratives remain unchanged; their existing unit and e2e pins must pass as-is.
- Never weaken a guardrail, test, or manifest rule.

## Gate and close

Run `npm run verify` to green (format → lint → unit → guard → e2e). If the gate is red, fix the named cause. If the same gate rejects a second time, stop and report.

Then:

- Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
- Commit everything as `feat(stage6a): dns 10.60 with tick-TTL ledger + cross-subnet router (stage6a Step 2)` on `feat/stage6a-dns-crossnet`.
- Do not push. Do not open a PR.

## Report back

Report the following: file list, test names added, exact verify result, commit hash, and anything in the brief that was ambiguous or under-pinned.
