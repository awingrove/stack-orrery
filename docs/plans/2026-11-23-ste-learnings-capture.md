# STE-experiment learnings → factory-kit + stack-orrery rule docs

Process-doc change only: three independent review passes (Qwen challenge of the
proposal list, K3.1 attempt, Mimo adjudication) plus an inline fact check settled
six carry-overs from `experiments/ste-briefs/`. No UI, no code, no tests: no
DESIGN.md amendment question. Two repos, two linked PRs — this change dogfoods
contract 3 below.

## Hard rules (bound, hard)

- Neither repo is weakened: no guard, test, threshold, or manifest edit. Both
  repos are clean on `main` at kickoff; work on one feature branch per repo.
- Cross-repo pairing: kit rule-doc changes and the stack-orrery register row
  land together with reciprocal citations; neither PR says "done" alone.
- No DL-7 / DL-8 rows, no FACTORY.md ratification sentence, no dispatch-
  containment or hook-bypass clauses, no guard extension for brief prose.
  These were killed with citations; do not reintroduce them.
- Batch-ops note scope: ONLY fresh state + STATE.md handoff. Quota numbers,
  concurrency caps, stop times/curfews, and budget multipliers are Opencode-Go
  environment specifics and are OUT of scope.
- PR bodies follow factory-kit PR-NOTES.md shape (decision half on top, record
  collapsed); any kit/AGENTS contract edit is named in _Decisions needed_.
  Request `awingrove` as reviewer via the REST call in AGENTS.md (not
  `gh pr edit --add-reviewer`).

## Boundary contracts (Step 2)

### 1. Brief satisfiability clause + paired DL-6

- `/home/awingrove/repos/factory-kit/factory-kit/PLAN-FORMAT.md`: in
  "Boundary contracts and counter-examples", add that every manifest field/id/
  test-ref named by a brief must be satisfiable in the repo's actual manifest
  grammar — an unsatisfiable clause (C19's "story with the next unused id";
  storymap has ids on tasks, not stories) is a Step-1 brief defect, handled as
  an authoring/review discipline. Do NOT propose a mechanical prose checker.
- `docs/factory/technical-debt.yaml`: add `DL-6` (defects section, all required
  folded fields). `injection_stage`: Step 1 brief authoring (the clause passed
  human sign-off). `detection_stage`: experiment blind scoring. `systemic_gap`:
  missing rule — grammar references in briefs had no satisfiability check.
  `closed_in`: names the factory-kit PR/commit once known. Reciprocal: the kit
  PLAN-FORMAT edit names `DL-6`.

### 2. Diff-blind audit instrument

- Kit `FULL-REVIEW.md`: add the committed audit + blind-scoring pipeline as an
  optional instrument (instruments are evidence named in the map, never a
  gate); keep the tool at `experiments/ste-briefs/audit-session.mjs`. No DL row
  (the C07 defect was already fixed by R1a/PR #33 with byte-exact pins), no
  FACTORY.md Demo-step edit (redundant with the acceptance probe).

### 3. Cross-repo capture rule — both docs, paired

- Kit `DEBT-REGISTER.md` post-mortem section AND stack-orrery `AGENTS.md` §4:
  same-repo capture stays "same commit or immediate follow-up"; cross-repo
  capture requires both changes with reciprocal citations — the register row's
  `systemic_gap`/`closed_in` names the kit PR/commit, the kit change names the
  `DL-\d+` id; neither counts done until both land. Mirror the same rule text in
  both docs (AGENTS.md:5-6 makes divergence a reportable defect). Precedent:
  DL-2's `closed_in` already names factory-kit#2.

### 4. Brief style pointer-note

- Kit `PLAN-FORMAT.md`: one line pointing to
  `experiments/ste-briefs/REPORT.md`, recommendation "do not adopt controlled-
  language briefs". No "measured-settled" (rule verdict: inconclusive), no
  "short contracts beat long prose" (arm A IS the current style).

### 5. Rubric-policy explicitness

- Kit `FULL-REVIEW.md`: future rubrics grading agent output state their policy
  on diff-invisible process items, fidelity, churn, and sanctioned extractions
  before scoring; the 5-question interview is one technique, not canonical.
  C24 ceiling: state honestly that the tail also tied (A=C=0.00 defects) — some
  changes are undiscriminable on any metric.

### 6. Batch-ops note (narrow scope — user-directed)

- New kit file `BATCH-OPS.md`: only the durable pattern — long mechanical loops
  run in a fresh `opencode run` session driven by a committed STATE.md handoff;
  lead context stays a consumer that reads RESULTS. Nothing about quota,
  concurrency, stop times, or budget multipliers.

## Verification & delivery

- Stack-orrery: `npm run verify` green (named gate, run directly, never piped).
  Kit repo: no package.json / no gate — docs-only; report that explicitly.
- Two feature branches + two PRs (one per repo), PR-NOTES shape, reciprocal PR
  links, `awingrove` requested on both via REST. Report commits, files, and any
  red gate runs.

## Ticks

- [x] Step 1 (Lead session): human design sign-off 2026-11-23 — proposal list
      approved with batch-note scope restricted to fresh state + STATE.md.
- [x] Step 2 (Executor sub-agent): implement contracts 1-6, `npm run verify`
      green in stack-orrery, both PRs opened; tick and commit.
- [ ] Step 3 (Lead session): `npm run metrics:extract -- <sessionID>`, append
      entry to docs/factory/slice-metrics.yaml (slice SIM), tick, commit.
