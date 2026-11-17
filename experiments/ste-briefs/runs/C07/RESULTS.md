# C07 — results (attempt-2 runs, v2.1 scoring)

Status: **complete** — 9/9 runs dispatched, audited, measured, scored (2026-11-16).
Change: Stage 6a DNS / cross-subnet router (`docs/plans/2026-10-24-stage6a-dns-crossnet.md`).
Executor: `opencode-go/glm-5.3-flash` (paid tier, whole change — DEVIATIONS #13).
Scorer: `opencode-go/mimo-v2.6-flash`, blind, rubric v2.1, no reference.diff
(DEVIATIONS #19). Scoring concurrency cap 3 (one over-cap episode: #21).

## Per-arm means

| metric                          | A (n=3)    | B (n=3)     | C (n=3)    |
| ------------------------------- | ---------- | ----------- | ---------- |
| requirements score / 68         | 67.67      | 66.67       | 67.67      |
| quality checks / 8              | 7.67       | 7.33        | 7.33       |
| defects (items graded <2, mean) | 0.67 (n=3) | 0.50 (n=2*) | 1.00 (n=3) |
| turns (mean)                    | 164.3      | 158.3       | 191.3      |
| wall time, min (mean)           | 34.7       | 33.8        | 36.7       |
| guardrail failures (mean)       | 4.33       | 2.67        | 6.33       |
| first-attempt gate pass         | 0/3        | 0/3         | 0/3        |
| final gate pass                 | 3/3        | 3/3         | 3/3        |

\* B-2's per-item grades were not retained by the earlier scoring session; only
totals (65/68, 6/8) survive. Point deficit = 5, so its defect count is in the
range 3–5 and is excluded from the B arm defect mean. Requirements/check means
include all three B runs.

Per-run scores (neutral run id → arm): run-1 B-2 = 65/68, 6/8 (pre-recorded);
run-2 B-1 = 68/68, 8/8; run-3 C-1 = 68/68, 8/8; run-4 C-3 = 68/68, 7/8;
run-5 A-1 = 67/68, 7/8; run-6 A-2 = 68/68, 8/8; run-7 C-2 = 67/68, 7/8;
run-8 A-3 = 68/68, 8/8; run-9 B-3 = 67/68, 8/8.

Observed defects: A-1 (NX hop-1 narrates a GET that the same run says was never
emitted) + P4-style behavior check; C-2 (existing tests edited rather than
passing "as-is", plus header-comment/template churn); C-3 and B-3 (existing
tests edited for the stage-6 boundary, C-3 also one blank-line deletion); B-2
(point deficit only). All 9 runs passed the final named gate; none passed it on
the first attempt. No run hit a turn or time limit.

## Harness incidents

- **Attempt 1 discarded**: all 9 concurrent runs killed by the shared Go 5-hour
  window (DEVIATIONS #18). Attempt 2 used 3-concurrent pacing; no run was lost.
- **Scoring instrument switch**: gemini-4-argon scorers burned ~33% of the Go
  window; three 0/68 grades on stale diffs were voided. Mimo + cap 3 adopted
  (DEVIATIONS #19). The stale gemini scores were not reused here.
- **Concurrency over-cap**: briefly 4 concurrent mimo scorers during this handoff
  (DEVIATIONS #21). No quota error; grades are from independent blind sessions.
- **Meter unreadable**: the >70% Go-window stop rule could not be evaluated
  locally (DEVIATIONS #20); wall-clock pacing was used instead.
- **Stale model label**: `run.json` and `results.csv` carry
  `executor_model = opencode/glm-5.3-flash-free` from a hardcoded harness field
  (`pilot-harness.mjs` `measure()`); the actual executor was the paid go tier
  per DEVIATIONS #13. Recorded, not rewritten, to keep measured artifacts intact.

## Handoff note (2026-11-16, 23:11Z)

C07 is complete and committed. Remaining slate: **C09, C19, C24** — all
**not dispatched tonight**. At handoff ~19 min remained before the 23:30Z
curfew; C19 needs its 11-min run budget plus a 15-min margin (~26 min) _and_
`setup` (npm ci ×9, not yet done for C19), so it does not fit without risking a
discarded session. C24 (32 min) and C09 (71 min) are far outside the remaining
window. Per the curfew rules, no wave was left in flight; the human resumes the
slate in a fresh window. C08 remains dropped (human decision 2026-11-16).
