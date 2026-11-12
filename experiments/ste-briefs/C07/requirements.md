# C07 — requirements extracted from arm A

Source: `brief.A.md` (the orchestrator dispatch text exactly as the executor
received it). The committed brief `docs/plans/2026-10-24-stage6a-dns-crossnet.md`
is an arm-independent instruction file present in the start commit; its
detailed requirements are referenced, not restated, here.

A requirement = one thing the executor must do, must not do, or must produce.

1. Treat the committed brief (`docs/plans/2026-10-24-stage6a-dns-crossnet.md`) as the contract source of truth; implement cold from it.
2. Execute Step 2 of that brief on branch `feat/stage6a-dns-crossnet` in the current working directory (stack-orrery).
3. Before coding, read `AGENTS.md` (repo rules: static JS stack, CSP, determinism, gates, claim vocabulary, manifests same-change, trace/UI narratives must consume actual component messages).
4. Before coding, read `FACTORY.md` and `DESIGN.md`, noting the Stage 6 8-ring registry and DNS/Router component sections.
5. Before coding, read the committed brief itself, especially its five negative-case contracts.
6. Before coding, read the listed existing components: `js/sim/network.js`, `js/sim/engine.js`, `js/sim/cache.js`, `js/panel/model.js`, `js/panel/layout.js`, `js/sim/trace.js`, `js/panel/teaching.js`, `panel.html`, `index.html`.
7. Extend those components without breaking them.
8. Deliver `js/sim/dns.js` per brief §1–§5.
9. Deliver `js/sim/router.js` per brief §1–§5.
10. Add cross-subnet routing support in `network.js`/`engine.js` per brief.
11. Add the trace/model narrative branch for hosted vs host-less paths per brief.
12. Add the Stage 6 8-ring registry and `#node-dns`/`#node-router` inspector cards plus live `stage-pill-6`.
13. Flip the stage-6 index card badge.
14. Add the real `STAGE_TEACHING[6]` entry (replacing the pending placeholder).
15. Add unit + e2e tests carrying the brief's pinned titles.
16. Update `slices.yaml`/`storymap.yaml` in the same change (manifests same-change).
17. Keep negative-case pin 1: `GET /about` on stage 6 keeps the stage-5 hop story byte-identical — no DNS hop.
18. Keep negative-case pin 2: a DNS cache hit inside ttlTicks increments cachedHits with NO authoritative consult; an expired entry never answers from the ledger.
19. Keep negative-case pin 3: `nope.example/about` never emits a GET — DNS ask + `NX no record` only.
20. Keep negative-case pin 4: `20.9` throws (fail-loud).
21. Keep negative-case pin 5: the `?stage=` live set extends to 6; unknowns still fall back to 1.
22. Zero runtime dependencies.
23. No inline handlers and no inline styles.
24. Respect file caps; split by responsibility if needed and update manifest refs.
25. Keep determinism in `js/sim/**` (no `Math.random()`, no `Date.now()`).
26. Use strict `CHECKS:`/`PINS:`/`DOCUMENTS:` claim vocabulary.
27. Keep stages 1–5 tests and narratives unchanged — their existing unit/e2e pins must pass as-is.
28. Never weaken a guardrail, test, or manifest rule.
29. Run `npm run verify` (format → lint → unit → guard → e2e) to green.
30. On a red gate, fix the named cause; on a second rejection of the same gate, stop and report.
31. Tick `- [x] Step 2 (Executor sub-agent): …` in the brief.
32. Commit everything as `feat(stage6a): dns 10.60 with tick-TTL ledger + cross-subnet router (stage6a Step 2)` on `feat/stage6a-dns-crossnet`.
33. Do not push; do not open a PR.
34. Report back: file list, test names added, exact verify result, commit hash, and anything in the brief that was ambiguous or under-pinned.
