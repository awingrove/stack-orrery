# ste-brief-experiment — learnings seed (for the factory-kit / stack-orrery

# brainstorm)

Everything from the experiment that is NOT already distilled in REPORT.md or
DEVIATIONS.md. The brainstorm should read: this file, REPORT.md,
DEVIATIONS.md, and the factory-kit rule docs verbatim.

## 1. The instrument was the product

- The contamination-audit + blind-scoring pipeline caught two contamination
  events (zero data leakage) and one escaped-defect class that `npm run
verify` passed in every arm (C07's stage-1–5 frame regression — empty
  wire-target field, no test pinned the exact frame shape). The gate
  verifies what tests pin; nothing verifies what tests fail to pin. A
  cheap periodic "diff-blind rubric audit" of landed slices could catch
  that class in normal factory operation.
- The blind-scoring interview (5 multiple-choice questions to the human)
  did more to fix the instrument than any model choice: it exposed that
  grader disagreement was a POLICY variable (diff-invisible process
  items), not a perception variable. Any future scoring system needs its
  unstated policies made explicit BEFORE scoring.
- Rubric ceilings matter more than rubric length: C24 scored 8/9 runs at
  52/52. If most items are gate-enforceable, the gate already banked them
  and the score carries no signal. Score the tail (defect counts), not
  the mean.

## 2. Brief-contract defects beat prose style (the headline transfer)

- C19's arm-A brief contained an unsatisfiable clause ("story with the
  next unused id" — the manifest grammar has no story-level ids). 6 of 9
  runs were docked, each failing differently by how it tried to comply.
- Transfer: a pre-flight "every clause satisfiable in the repo's actual
  grammar" check on briefs (mechanically checkable: every named manifest
  field/id must exist in the repo's manifest schema). Candidate kit rule
  or guard extension. This is the highest-value concrete carry-over.
- The DL-3/DL-4 negative-case contract rules were this experiment's
  origin; the C19 finding shows the same discipline applies to manifest
  grammar references, not just behavior branches.

## 3. Controlled language: no gain, weak consistent negative

- Arm B was worse-or-tied in 4/4 changes; the only arm with a gate-hook
  bypass among C07 runs was B's (rigidity → workarounds?). Arm C
  (restructure-only) ≈ arm A — disciplined rewriting per se is neutral.
- Transfer: do not codify STE rules into factory-kit brief format. If
  anything, the finding supports the kit's current ≤120-line
  boundary-contract style: short contracts with named counter-examples
  outperform both long prose (arm A at 478+ words) and controlled
  imperative lists (arm B).

## 4. Operations learnings (quota, sessions, controllers)

- The OpenCode Go meters are effectively token-denominated; 5h-window ≈
  7-8M glm-equivalent tokens; concurrency multiplies burn (9 parallel
  sessions ≈ 33% of a window in minutes even when killed immediately —
  cancellation does not refund read context).
- The orchestrator's own context is a first-class consumer: a long lead
  session re-sends ~55k+ tokens per turn. Long mechanical loops belong in
  a fresh `opencode run` session driven by a committed STATE.md handoff +
  a shell wave-driver; the lead session only reads RESULTS.
- Pattern that worked end-to-end (STATE.md handoff → controller session →
  per-wave driver resume → local measurement runner): reusable for any
  long unattended batch job.
- Zero-discarded-sessions pacing rule (never dispatch a run whose budget
  crosses a known stop time) worked; it needs the run budget computed
  BEFORE dispatch (largest original session × 1.5).

## 5. Scoring economics

- Scorer model choice moved cost ~10× (gemini 4-argon vs mimo/qwen) with
  no visible quality loss at v2.1 once policies were frozen. Blind
  neutral-name workspaces + a private map file kept arm labels out of
  scorer context — cheap and airtight; keep for any future rubric work.
- Score-aggregation lesson: record per-item grades, not just totals — one
  run's per-item grades were lost and its defect count became a range.

## 6. Meta-observations for the retro

- Every serious failure in the experiment was a HARNESS failure (cwd leak,
  dispatch-before-reset, stale diff copies, hardcoded limits), never an
  executor failure. The containment was always: audit → discard → reset →
  re-run. Codify the audit as a kit tool (it is committed:
  experiments/ste-briefs/audit-session.mjs).
- The 5-question human interview instrument (calibrating a scorer against
  the human's own judgment) is reusable beyond this experiment — e.g. for
  tuning lead-review checklists.
- Protocol-vs-repo conflicts (freeze commit vs guards) were resolved by
  human ratification + scope-extension edits, never by weakening a
  guard — the right pattern, worth a line in the kit's gate-rejection
  rule (a ratification path for scope extensions).
