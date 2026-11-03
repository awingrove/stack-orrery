# R3a — inspector mirrors: honest labels + structural parity pins (batch round 1 of 3)

Paydown for full-review finding 5-01 (recommendations.md Stage R3a), batch
mode: option (b) — honest re-label + structural parity pins. Option (c)
(render the real source via fetch) is deliberately OUT of this batch: it
makes the inspector async mid-batch; it is staged as its own follow-up
slice. Option (a) (a diff-guard) is rejected per the batch gate: a leash
on a dishonest surface is worse than an honest label.

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, or manifest rule. Zero runtime deps. No
  inline handlers/styles (the guards bite). Claim vocabulary strict.
- File sizes: inspector-source.js 270, inspector-source-stage6.js 122 —
  both stay ≤ 300; the new parity test file ≤ 450.

## Boundary contracts (Step 2)

### 1. The honest label, at the surface the learner reads

- inspector-source.js: the header's claim line ("js/sim/* is the
  executable truth; this module renders the same logic for learners") is
  REPLACED by the honest contract: "simplified teaching excerpts — NOT the
  executable truth; the real implementation lives at each entry's `file`
  path; read js/sim/<file> for the machine the sim actually runs".
- Export a new `EXCERPT_NOTE` constant (the one-line notice string) and a
  per-entry `excerpt: true` marker on every COMPONENT_SOURCE /
  STAGE6_SOURCE entry.
- The inspector's rendered code panel (the consumer that renders
  COMPONENT_SOURCE entries — grep the render site: render.js /
  inspector render path) gains the notice line under the component title:
  render EXCERPT_NOTE + the entry's `file` path — so the learner always
  sees "simplified excerpt — real source: js/sim/queue.js" above the
  mirrored code.
- CHECKS: names finding 5-01 (the workerqueue mirror omits crashed/
  redelivery machinery — the label is the honesty fix for THIS batch;
  the drift vector retires only in the follow-up fetch-render slice).

### 2. Structural parity pins (NEW test/panel/inspector-parity.test.js)

- Title verbatim: `the inspector mirrors carry honest labels and resolvable sources — every entry names a real js/sim file, every code string names its factory, and the excerpt notice rides every panel`.
- Pin 1: `Object.keys(COMPONENT_SOURCE)` deep-equals the 10 selectable
  components (browser, network, loadbalancer, webserver, cache, database,
  workerqueue, dns, router, cdn — the exact list formatComponentState /
  componentTitle support).
- Pin 2: every entry's `file` resolves on disk (`node:fs` existsSync —
  node builtins are not runtime deps).
- Pin 3: every `code` string is non-empty AND names its own `create*`
  factory symbol (the mirror's first meaningful token).
- Pin 4: `EXCERPT_NOTE` is non-empty and every entry carries
  `excerpt: true`.
- Stage-6 map (STAGE6_SOURCE): the same four pins over its entries.

## §Tests

- Only the new parity file (title above); no existing test changes; e2e
  untouched (the inspector panel's DOM gains one notice line — check e2e
  pins on the inspector's title/text do not assert an exact full-panel
  string; if one does, update that pin per named cause, noting it).

## Manifests same-change

- storymap.yaml: one story under the PANEL task titled verbatim per the
  parity pin; slices.yaml: same ref under PANEL's tests list.

## Ticks

- [ ] Step 1 (Lead session): human sign-off (batch mode; option (b) gated
      2026-11-02; option (c) staged as a follow-up).
- [ ] Step 2 (Executor sub-agent): cold implementation; `npm run verify`
      green; tick and commit.
- [ ] Step 3 (Lead session): probe + telemetry `R3A-MIRROR-LABELS` +
      tick, commit.
