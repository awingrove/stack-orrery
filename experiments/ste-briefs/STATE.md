# ste-brief-experiment — orchestrator handoff state (2026-11-16)

You are the run-controller orchestrator for this experiment. Read this file,
`docs/plans/ste-brief-experiment.md` (the protocol), and
`experiments/ste-briefs/DEVIATIONS.md` (binding deviations #1–#19) before
acting. Work from THIS state file; do not re-derive history.

## Mission

Finish the remaining mechanical loop and produce per-change data:
setup → dispatch 9 runs → audit → measure → score → record. Then write each
change's summary into `experiments/ste-briefs/runs/<change>/RESULTS.md`.
The lead session (ses_e...) handles the final §9 report with the human —
you stop when all three changes are complete and measured+scored.

## Frozen configuration (do not change)

- Executor: `opencode-go/glm-5.3-flash`, agent `general`, isolated run dirs
  under `/tmp/opencode/ste-runs/<change>/`.
- Scorer: `opencode-go/mimo-v2.6-flash`, prompt per
  `experiments/ste-briefs/scorer-prompt-template.md` (no reference.diff).
- Rubric: v2.1 (per-change `rubric.md` files already carry the P1–P4 block).
- Concurrency: max 3 subagent sessions at once.
- Harness: `experiments/ste-briefs/pilot-harness.mjs` —
  `STE_CHANGE=<id> node pilot-harness.mjs setup` (exports tree, patches e2e
  port, npm ci); `measure <arm> <n> <sessionId>`; `csv`.
- Audit: `node experiments/ste-briefs/audit-session.mjs <sessionId>` —
  run after EVERY executor lands; exit 1 = suspect (discard run, reset dir,
  record in DEVIATIONS.md).
- Budgets (turns/wall): C09 449/71min · C19 75/11min · C24 57/32min
  (already in the harness BUDGETS table).
- Neutral scoring workspace: `/tmp/opencode/ste-score/<change>/` — copy
  requirements.md + rubric.md + run diffs AFTER all measurements are
  complete; keep `.map.json` private.

## Per-change procedure (repeat for C09, C19, C24 in this order)

1. `STE_CHANGE=<id> node pilot-harness.mjs setup` (needs
   `mkdir -p experiments/ste-briefs/runs/<id>` first).
2. Read the three arms from `experiments/ste-briefs/<id>/brief.{A,B,C}.md`.
3. Dispatch 3 runs at a time (order = the change's runs-order.json), each
   prompt = the frozen frame (absolute-path rule naming the run dir + budget
   line "complete the work within roughly <wall> minutes and <turns> tool
   turns") + the arm text verbatim. Record session ids in
   `runs/<id>/attempt-sessions.txt` (one line: `<arm>-<n> <sessionId>`).
4. On each completion: `audit-session.mjs` → if clean, `measure` (the
   harness runs the gate locally). If contaminated: discard, reset dir
   (`git reset --hard $(git rev-list --max-parents=0 HEAD)` +
   `git clean -fd -e node_modules`), re-dispatch, record in DEVIATIONS.md.
   KNOWN FALSE-POSITIVE: relative-path shell commands are fine — the shell
   cwd is the run dir (verified empirically); only live-repo paths in tool
   input are contamination.
5. After all 9: copy scoring workspace, dispatch scorers 3 at a time,
   record scores into run.json.
6. Write `runs/<id>/RESULTS.md`: per-arm means (requirements score, checks,
   defects, turns, wall, guardrail failures, first-attempt gate) + any
   harness incidents.

## Current state

- **C10**: complete (pilot; 9 runs scored v2.1; see runs/C10/PILOT-REPORT.md).
- **C07**: 9/9 attempt-2 runs complete, audited, MEASURED (run.json current).
  Scoring: run-1 (B-2) scored by mimo = 65/68, checks 6/8 — recorded in
  run.json? CHECK: if `scorer_policy` field missing, record it
  (`requirements_score: 65, quality_checks_score: 6, scorer_policy:
'rubric-v2.1-mimo'`). The other 8 runs are UNSCORED (three void gemini
  scores on stale diffs must not be reused). Score all 8 via the template.
  Neutral diffs already copied (non-empty, verified) with `.map.json`:
  run-1=B-2, run-2=B-1, run-3=C-1, run-4=C-3, run-5=A-1, run-6=A-2,
  run-7=C-2, run-8=A-3, run-9=B-3.
- **C08**: setup DONE (dirs + npm ci, ports 4400-4406) but C08 is DROPPED
  from the slate (human decision 2026-11-16: remaining = C09, C19, C24).
  Leave its dirs; do not run it.
- **Remaining slate**: C09, C19, C24 (3 changes × 9 runs).

## Pacing for tonight (wifi curfew 23:30 — a run crossing it dies and is

## discarded; the human has ordered ZERO discarded sessions)

1. FIRST: complete C07 scoring (8 remaining runs, 3 scorers at a time) —
   light (~2% window each), ~15 min total.
2. Then only dispatch runs whose full budget fits the remaining time with a
   15-minute margin: C19 (11-min budget) always OK; C24 (32-min budget) OK
   if ≥50 min remain; C09 (71-min budget) NOT tonight unless ≥90 min remain.
3. If the 5-hour Go window reads >70% at any point, stop dispatching and
   record in DEVIATIONS.md.
4. Do not leave a wave dispatched across the curfew. End cleanly: measure
   everything landed, commit, write a handoff note in the newest
   RESULTS.md or DEVIATIONS.md entry.

## Hard rules (protocol §3 + deviations)

- No pushing to any remote. No modifying main or existing branches.
- Only add files under `experiments/ste-briefs/`.
- Never let an executor see anything outside its run dir; the frame's
  absolute-path rule is mandatory in every dispatch.
- Quota errors ("usage limit reached") = STOP dispatching immediately,
  record in DEVIATIONS.md, leave a note in
  `experiments/ste-briefs/runs/<change>/RESULTS.md`, and end your turn —
  the human decides whether to resume.
- Record every deviation in DEVIATIONS.md (append numbered entries).

## When done

Write the three RESULTS.md files, commit everything under
`experiments/ste-briefs/` on branch `experiment/ste-brief-freeze` with a
clear message, and end with a short summary. Do NOT write the final §9
report — the lead session does that with the human.
