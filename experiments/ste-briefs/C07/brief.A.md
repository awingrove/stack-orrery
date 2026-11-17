You are a subagent spawned by another session.
Execute Step 2 of the committed factory brief `docs/plans/2026-10-24-stage6a-dns-crossnet.md` on branch `feat/stage6a-dns-crossnet` (current working directory, stack-orrery). The brief is your contract source of truth — implement cold from it.

Before coding, read in this order:

1. `AGENTS.md` (repo rules: static JS stack, CSP, determinism, gates, claim vocabulary, manifests same-change, trace/UI narratives must consume actual component messages — DL-1/DL-3/DL-4)
2. `FACTORY.md`, `DESIGN.md` (note the new Stage 6 8-ring registry and DNS/Router component sections)
3. The brief itself (`docs/plans/2026-10-24-stage6a-dns-crossnet.md`) — especially its five negative-case contracts
4. Existing components you extend without breaking: `js/sim/network.js` (subnet-blind today; fail-loud unregistered hosts), `js/sim/engine.js` (stage validation 1–5, additive topology), `js/sim/cache.js` (the tick-TTL ledger pattern DNS mirrors), `js/panel/model.js` (trace narrative builders, `TOTAL_HOPS`), `js/panel/layout.js` (`STAGE_RINGS`), `js/sim/trace.js`, `js/panel/teaching.js` (`STAGE_TEACHING`, stage 6 pending placeholder), `panel.html`, `index.html`.

Deliverables (all branch, per brief §1–§5): `js/sim/dns.js`, `js/sim/router.js`, cross-subnet routing support in `network.js`/`engine.js`, trace/model narrative branch (hosted vs host-less paths), Stage 6 8-ring registry + `#node-dns`/`#node-router` inspector cards + live `stage-pill-6`, stage-6 index card badge flip, `STAGE_TEACHING[6]` real entry, unit + e2e tests with the brief's pinned titles, `slices.yaml`/`storymap.yaml` same-change.

The five negative-case pins are non-negotiable (§Negative-case contracts): (1) `GET /about` on stage 6 keeps the stage-5 hop story byte-identical — no DNS hop; (2) DNS cache hit inside ttlTicks increments cachedHits with NO authoritative consult, an expired entry never answers from the ledger; (3) `nope.example/about` never emits a GET — DNS ask + `NX no record` only; (4) `20.9` throws (fail-loud); (5) `?stage=` live set extends to 6 with unknowns still falling back to 1.

Hard rules: zero runtime deps, no inline handlers/styles, file caps (split by responsibility if needed and update manifest refs), determinism in `js/sim/**`, strict CHECKS:/PINS:/DOCUMENTS: claim vocabulary, stages 1–5 tests and narratives unchanged (their unit/e2e pins pass as-is), never weaken a guardrail.

Gate + close: `npm run verify` green (format → lint → unit → guard → e2e). Red gate = fix named cause; same-gate second rejection = stop and report. Then tick `- [x] Step 2 (Executor sub-agent): …` in the brief and commit everything as `feat(stage6a): dns 10.60 with tick-TTL ledger + cross-subnet router (stage6a Step 2)` on `feat/stage6a-dns-crossnet`. Do NOT push, do NOT open a PR.

Report back: file list, test names added, exact verify result, commit hash, and anything in the brief that was ambiguous or under-pinned.
