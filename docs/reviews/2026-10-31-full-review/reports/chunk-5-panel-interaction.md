# Chunk 5 — Panel interaction — Review Report

- **Reviewer:** Qwen3.7 Plus (opencode-go/qwen3.7-plus)
- **Scope:** `js/panel/panel.js`, `teaching.js`, `teaching-drawer.js`, `missions.js`, `missions-view.js`, `fault-console.js`, `compare.js`, `fs-editor.js`, `inspector-source.js`, `inspector-source-stage6.js`, `journey-log.js`, `rail.js` (~2,100 lines)
- **Standards:** `docs/reviews/2026-10-31-full-review/map.md`
- **Cross-checked:** `AGENTS.md` (narrative source-of-truth / no-inline / slim-protocol / determinism), the researcher brief `briefs/chunk-5-panel-interaction.md`, and the actual sim code the panel points at.

## Brief vs code — verification notes

The researcher brief is accurate on the load-bearing facts: addEventListener-only (no inline handlers anywhere in the chunk), `render.js` drives per-snapshot calls to `renderFilesystems` / `updateMissions` / `updateFaultConsole`, missions detectors read real snapshot fields (`lastExchange.status`, `cache.hits/sets/evictions`, `database.staleReads/replicated/pendingReplication/rows.lagging`, `workerQueue.enqueued/completed/pendingJobs/activeJob/redelivered/redeliveredCommits`, `dns.lookups/droppedLookups/reResolveAfterDrop`, `router.routed`, `trace.edgeStatus`, `loadBalancer.perBackend/forwarded`, `bypassedCount`, `failedWrites`, `skippedCount`, `refusedCount`). FAULTS READERS/WRITERS dispatch per kind is faithfully described. `fs-editor` goes through `engine.setWebFile` — no HTTP path, confirmed (brief line 37).

One nuance the brief understates: the `inspector-source.js` workerqueue mirror is _substantially_ simplified vs real `js/sim/queue.js` — it omits the `crashed` flag, the redelivery queue, the `redeliveredCommits` tally, and `setCrashed`. That makes the inspector mirror a teaching narrative, not the "executable truth rendered for learners" the header claims (inspector-source.js:1-3). This is a distinct finding (5-02) rather than a brief mismatch.

---

## Findings

- id: 5-01
  title: inspector-source hand-copied mirrors drift from the executable sim they claim to mirror
  severity: High
  category: logic / documentation
  files: [js/panel/inspector-source.js:1-3, js/panel/inspector-source.js:242-269, js/panel/inspector-source-stage6.js:5]
  evidence: header claims "js/sim/* is the executable truth; this module renders the same logic for learners" (inspector-source.js:2-3); the workerqueue mirror (inspector-source.js:244-269) declares `let nextJobId++;` with no initializer, no `crashed` flag, no `redeliveredCommitTally`, no `setCrashed`, no re-delivery requeue at head — while real `js/sim/queue.js` lines 38-177 carry all of that machinery; real `queue.js:76` `if (crashed && activeJob)` + `:124-129` redelivered-bookkeeping are entirely absent. Similar (smaller) drift surface for cache/database/webserver mirrors (real `cache.js` is 142 lines; mirror is 44 lines; real `database.js` is 191 lines; mirror is 47 lines).
  impact: teaching contract — the learner reading the inspector tab for the Worker Queue sees a FIFO that is not what the sim actually runs during the B-6e fault/console/mission flow. No test in this chunk compares mirror text to sim source (the brief confirms render.test.js is 56 lines and does not pin mirrors); divergence is detectable only by eye review. DL-1 class (narrative not sourced from real messages — here, real _code_).
  recommendation: either (a) add a same-change guard script that diff-checks each mirror against the real file on `npm run verify` (cheap: strip comments + whitespace, compare a canonical subset), or (b) drop the "same logic" header claim and re-label the inspector code panel as "simplified teaching excerpt" per component, or (c) switch to rendering the actual source via `fetch('/js/sim/queue.js')` from the static server — the CSP is `script-src 'self'`, so fetching text is fine and eliminates the drift vector entirely.
  deep_dive: no

- id: 5-02
  title: teaching.js is a stage-keyed prose table with only coarse unit pins; sim-trace drift is unbounded
  severity: Medium
  category: logic / test-contract
  files: [js/panel/teaching.js:1-160, test/panel/teaching.test.js]
  evidence: teaching.js:14 claims `9 hops: MISS → pull → FILL` (stage-6 `try[0]`), teaching.js:95 names `"STALE (lag 3t)"` mid-trace, teaching.js:126 pins `"Hop 8/8 — Worker (10.41) processed job"`, teaching.js:150 claims `"Routed: 3 on a cd.example.com/about miss"`. The unit pin (brief line 24 / teaching.test.js) tests only stage-1 copy excluding cache/TTL vocabulary and including "fifo queue"/"10.1" — a string-shape pin, not a tie to sim trace output. No test asserts that the quoted hop labels match what `trace.js` / `trace-stage6.js` actually emit.
  impact: if a trace reword ever changes `"hop 5/7"` to `"hop 5 of 7"` or renames `"STALE"` to `"LAGGING"`, the teaching drawer keeps printing the old phrasing silently. The learner reads a narrative the sim no longer speaks — DL-1-adjacent (narrative not mechanically tied to real messages).
  recommendation: export a `TRACE_VOCAB` from `trace.js` / `trace-stage6.js` (the literal strings `"STALE"`, `"processed job"`, `"Routed:"`, the hop-format template), and have the teaching table reference those tokens (or a unit test assert that teaching.js's quoted fragments appear verbatim in a real `traceHop` output for a canned stage-N scenario). Either binds copy to source.
  deep_dive: no

- id: 5-03
  title: panel.js `traceFinalHop` re-derives trace-stage6's final-hop branch by hand
  severity: Medium
  category: DRY / logic
  files: [js/panel/panel.js:47-55, js/sim/trace-stage6.js:183-188]
  evidence: `traceFinalHop` at panel.js:47-55 re-implements `(snapshot.stage === 1 && refused) → 2`, `(nx) → 2`, `(cdn && edgeStatus === 'HIT') → 6`, `(cdn) → 9`, `(host) → 9 : 8`, falling through to `TOTAL_HOPS[stage]`. The branch conditions mirror `trace-stage6.js:183-188`'s final-hop computation. `TOTAL_HOPS = { 1:4, 2:5, 3:6, 4:7, 5:8, 6:9 }` at panel.js:36 is the same ladder the trace emitter walks.
  impact: a new stage-6 branch (e.g. a 7-hop path for a different CDN outcome) requires edits in both `trace-stage6.js` and `panel.js`. Today they agree; the agreement is un-pinned.
  recommendation: expose `finalHopFor(trace, stage)` from `trace.js` / `trace-stage6.js` (the engine already owns the rule); have `panel.js:47` delegate to it. Removes the duplicated branch and the `TOTAL_HOPS` constant.
  deep_dive: no

- id: 5-04
  title: module-level mount-once listeners are never torn down; real risk bounded but unnamed
  severity: Low
  category: code-quality / architecture
  files: [js/panel/rail.js:89,118, js/panel/fs-editor.js:177-208, js/panel/teaching-drawer.js:42, js/panel/fault-console.js:219, js/panel/missions-view.js:37]
  evidence: `rail.js:89` `button.addEventListener('click', () => setRailTab(tab))` — one listener per tab, bound once in `initRail`; `rail.js:118` `legendToggle?.addEventListener('click', ...)`; `fs-editor.js:177-208` three delegated listeners per card container, bound once in `initFilesystemEditor`; `teaching-drawer.js:42` `teachingToggle.addEventListener('click', ...)`; `fault-console.js:219` `switchEl.addEventListener('click', ...)` inside `buildRow` (rows rebuild per stage, but each switch gets one listener on its own fresh node — correct); `missions-view.js:37` per-row `item.addEventListener('click', ...)` rebuilt per stage (correct — old rows are `section.remove()`d with their listeners).
  impact: rail chrome, fs-editor card containers and the teaching toggle are singleton modules that live for the page lifetime — so the "never torn down" label is not a memory leak in practice. It does mean that if `initRail()` / `initFilesystemEditor()` were ever called twice the listeners would double-fire; `initRail` guards with `if (document.getElementById('rail')) return` (rail.js:107) but `initFilesystemEditor` / `initTeachingDrawer` do not. Minor defensive gap, not a live bug.
  recommendation: add the same idempotency guard to `initFilesystemEditor` (check a module-level `initialized` flag) and `initTeachingDrawer` (`if (teachingPanel) return`); document the mount-once contract in each module header. No teardown path needed — these are page-lifetime singletons.
  deep_dive: no

- id: 5-05
  title: fs-editor commits and closes against a stale `lastSnapshot` captured by the last render
  severity: Low
  category: logic
  files: [js/panel/fs-editor.js:39,156,163,173]
  evidence: `fs-editor.js:39` `let lastSnapshot = null`; `:142` `lastSnapshot = snapshot;` inside `renderFilesystems`; `:156` `startEdit` calls `renderFilesystems(lastSnapshot)`; `:163` `closeEdit` calls `rerender(lastSnapshot)` — if the learner opens the editor, waits through several crowd ticks (during which the sim advances and `renderFilesystems` updates `lastSnapshot` repeatedly), and hits Escape, `closeEdit` re-renders the _latest_ `lastSnapshot` — actually fine because `lastSnapshot` keeps refreshing. The real gap: `startEdit` re-renders from `lastSnapshot` (which is the _previous_ render's snapshot, not a freshly polled one); in practice indistinguishable because render.js:216 drives a fresh `renderFilesystems(snapshot)` every tick. The `commitEdit` path at `:173` re-polls via `getEngine().snapshot()` — correct.
  impact: no observable correctness bug in the current wiring because render.js:216 refreshes `lastSnapshot` every tick. The comment at fs-editor.js:162 ("Escape re-renders from the EXISTING snapshot — the fs was not touched") is slightly misleading: it's the last tick's snapshot, not a frozen one. Polish debt only.
  recommendation: rename `lastSnapshot` to `latestSnapshot` and update the comment; or drop the module-level cache entirely since `closeEdit` can simply call `rerender(getEngine().snapshot())` (requires threading `getEngine` into `closeEdit`). The latter is cleaner.
  deep_dive: no

- id: 5-06
  title: fault-console per-row `switchEl` listeners rebuild per stage; `cardChips` persist across stages
  severity: Low
  category: code-quality
  files: [js/panel/fault-console.js:110-111,204,228,275-277]
  evidence: `fault-console.js:110-111` `rows` and `cardChips` are both module-level `Map`s. `rebuild` at `:232` calls `rows.clear()` but never clears `cardChips`; `hideCardChips` at `:275-277` just hides them. `ensureCardChip` at `:196-206` does an `isConnected` check so a chip orphaned by a `cardId` reuse re-creates — but the chip for a stage-1 webserver (`node-webserver`) stays cached in the Map across a stage switch, hidden, and is resurrected if the learner returns to stage 1.
  impact: the chip node is a detached DOM node held indefinitely by the Map — not a leak (one node per fault, six faults total), but it is a subtle cross-stage state survivor. Behavior is correct (hidden + resurrected), the memory cost is trivial, but the asymmetry with `rows.clear()` makes the lifecycle harder to read.
  recommendation: document the asymmetry in a one-line comment beside `cardChips` ("chips persist across stage switches, hidden while inactive; `isConnected` re-creates if the host card is ever rebuilt"), or mirror the `rows` pattern and clear `cardChips` on `rebuild` since `ensureCardChip` re-creates them on demand anyway.
  deep_dive: no

- id: 5-07
  title: missions-view module-level `stage`/`verified`/`chips` make cross-instance testing brittle
  severity: Low
  category: SOLID / architecture
  files: [js/panel/missions-view.js:14-17, js/panel/fault-console.js:107-111]
  evidence: `missions-view.js:14-17` `let stage = null; const verified = new Map(); let section = null; const chips = new Map();` — all module-level. `fault-console.js:107-111` same shape. A second page or test harness that wanted two mission consoles side-by-side could not instantiate one — the state is singleton.
  impact: today there is exactly one missions section and one fault console — the singleton matches reality. If the product ever adds A/B comparison of two stages, both modules need a refactor to instance-scoped state. Not urgent; flag as architectural debt.
  recommendation: accept the singleton contract for now (matches the product) but wrap the module state in a closure (`createMissionsView()` returning `{ update, reset }`) so the refactor is one file when needed. Low priority.
  deep_dive: no

- id: 5-08
  title: compare.js headline formatting and tray lifecycle are clean and verbatim
  severity: Praise
  category: code-quality
  files: [js/panel/compare.js:45-99]
  evidence: `compare.js:45-52` builds the run label from the run's _own_ trace (`trace.host+path` or `trace.path` fallback) — the only descriptor that cannot be rewritten post-completion; `:58-62` (via `journey-log.js:58-62` `getRunEntries`) hands out _fresh copies_ of stored entries so later trims/relabells in the journey-log cannot rewrite the compare tray's rows; `:72-99` hidden/incomplete rule — zero or one stored run renders no tray at all, never a half-populated diff; `:80` headline is one exact string.
  impact: load-bearing work done right — the tray rides its own snapshot, immune to later journey-log mutations. A model for the rest of the chunk.
  deep_dive: no

- id: 5-09
  title: missions.js B-6*-series counter-example discipline — named counter-examples with real snapshot predicates
  severity: Praise
  category: test-contract / logic
  files: [js/panel/missions.js:79-86 (m1-404 refuse-recover), 105-111 (m2-failover B-6b), 133-144 (m3-bypass-cold B-6c), 169-182 (m4-write-fail B-6d), 208-220 (m5-redeliver B-6e), 244-256 (m6-nx B-6f)]
  evidence: every B-6 mission's `detect` is a two-leg predicate with a named counter-example in the header comment. B-6b at missions.js:105-111 reads `skippedCount > 0 && perBackend['10.12'] >= 1` — a skip alone or a 10.12 count alone cannot satisfy both. B-6d at missions.js:179-181 reads `failedWrites > 0 && lastStatus === 200 && servedDbOp === 'WRITE'` — pinning failure-BEFORE-restored ordering. B-6e at missions.js:218 reads `redelivered >= 1 && redeliveredCommitsIn >= 1` — pre-crash completed tally cannot latch it because `redeliveredCommitsIn` at missions.js:51 reads the queue's `redeliveredCommits` counter (only a re-delivered commit moves it). B-6f at missions.js:253 reads `droppedLookups > 0 && reResolveAfterDrop >= 1`. Every predicate reads a real engine snapshot field, not a narrative flag.
  impact: load-bearing work done right — the sim is the referee (per header claim at missions.js:13-15), and the counter-examples are pinned in test/panel/missions.test.js (per brief line 45). The discipline is exemplary and the right model for future stages.
  deep_dive: no

- id: 5-10
  title: fault-console READERS/WRITERS per-kind dispatch — no local UI memory, every visible state reads the snapshot
  severity: Praise
  category: logic / SOLID
  files: [js/panel/fault-console.js:119-167]
  evidence: `fault-console.js:139-144` `READERS = { bypass: bypassedIn, primary: primaryDownIn, worker: workerCrashedIn, dropped: dnsDroppedIn }` — each reads a real snapshot field (`snapshot.cache.bypassed`, `snapshot.database.primaryDown`, `snapshot.workerQueue.crashed`, `snapshot.dns.dropped`); `:153-158` `WRITERS` dispatches per kind to the matching `engine.set*` fail-loud setter; `:146-147` `faultStateIn` falls through to `downIn` for the default down kind; `:167` `CHIP_TEXT` and `:181-194` `FAULT_CHIP` keep per-kind token pair (DOWN/danger vs BYPASS|DROPPED/warn) — the warn kinds (bypass, dropped) are semantically different from genuinely down components (primary, worker, single-server) and the token pair reflects that.
  impact: the UI cannot desync from the sim — every refresh reads the snapshot, every write goes through the engine's validated setter. Adding a seventh stage's fault is a one-entry `FAULTS[7] = [...]` plus (if a new kind) one READER/WRITER entry. Clean extension point.
  deep_dive: no

- id: 5-11
  title: rail.js clean state-machine with bounded, readable transitions
  severity: Praise
  category: code-quality / logic
  files: [js/panel/rail.js:16-63]
  evidence: `rail.js:16` `const TABS = ['teach', 'missions', 'legend', 'faults']` — closed enum; `:24` `let railTab = 'teach'` — single source of truth; `:51-63` `setRailTab` guards with `if (!TABS.includes(tab)) return` (unknown tab is a no-op, not a crash); `:41-47` `refreshRail` toggles each host's `.rail-empty` line from the host's surface visibility; `:29-34` `surfaceOf` treats a closed panel as yielding to the empty line. The legend re-parent at `:112-113` is a one-time move, not a rewrite.
  impact: a small, readable state machine at the center of four docked surfaces. No leak surface (listeners are bound to the tab buttons it creates, which live for the page lifetime), no hidden state, no coupling to the engine. Model pattern for the chunk.
  deep_dive: no

- id: 5-12
  title: CSP discipline — no inline handlers or styles anywhere in the chunk
  severity: Praise
  category: process / code-quality
  files: [js/panel/panel.js, js/panel/teaching.js, js/panel/teaching-drawer.js, js/panel/missions.js, js/panel/missions-view.js, js/panel/fault-console.js, js/panel/compare.js, js/panel/fs-editor.js, js/panel/inspector-source.js, js/panel/inspector-source-stage6.js, js/panel/journey-log.js, js/panel/rail.js]
  evidence: every behavior path goes through `addEventListener` — panel.js:121,126,135,186,188,196,204,211,222,229; teaching-drawer.js:42; rail.js:89,118; missions-view.js:37; fault-console.js:219; fs-editor.js:177,190,199. DOM construction uses `document.createElement` + `textContent` / `setAttribute` exclusively — no `innerHTML`, no `style = '...'` assignments in any of the twelve files.
  impact: the static server's strict CSP (`script-src 'self'; style-src 'self'` per AGENTS.md) is not under threat from this chunk. The discipline is consistent across all modules.
  deep_dive: no

- id: 5-13
  title: file-size discipline — all twelve files sit within the 300-line guard, four near the rim
  severity: Low
  category: process
  files: [js/panel/fault-console.js (296), js/panel/panel.js (285), js/panel/missions.js (280), js/panel/inspector-source.js (270)]
  evidence: the four files named in the brief (line 51) are all under cap with the least headroom in `js/panel`. Any one of them gaining a single `FAULTS[7]` row, a new `MISSIONS[7]` mission, or a new `COMPONENT_SOURCE` entry sits at the rim.
  impact: the 300-line guard is intact today but the near-rim files are one feature from a split. Not a defect; a leading indicator.
  recommendation: if a seventh stage lands, plan the split preemptively (e.g. `fault-console-stage6.js` for the stage-6 row; `missions-stage6.js` for the stage-6 missions). Don't wait for the guard to bite.
  deep_dive: no

## Summary

No Critical findings. The two most consequential items are **5-01** (inspector-source hand-copied mirrors — especially the workerqueue mirror, which is materially incomplete vs the sim and un-pinned by any test) and **5-02** (teaching.js prose drift unbounded beyond coarse unit pins). Both are DL-1-adjacent: the narrative layer is not mechanically tied to the sim it describes. The rest of the chunk is in strong shape: missions.js's B-6*-series counter-example discipline (5-09), fault-console's READERS/WRITERS dispatch (5-10), compare.js snapshot immutability (5-08), and rail.js's bounded state machine (5-11) are all load-bearing work done right. CSP discipline (5-12) is clean across all twelve files. The smaller items (5-03 duplicated `traceFinalHop`, 5-04 idempotency guards, 5-05 stale-snapshot naming, 5-06 cardChips persistence, 5-07 singleton state) are polish/DRY debt a maintainer will pay for.

## Deep-dive requests (orchestrator dispatch)

None escalated. The reviewer had enough signal from the source; the two items a deeper model could usefully weigh (5-01 mirror drift scope, 5-02 teaching-vocabulary binding) are already concrete enough that the recommendation stands without further adjudication.
