# C19 — results (9 runs, v2.1 scoring)

Status: **complete** — 9/9 runs dispatched, audited, measured, scored (2026-11-17).
Change: Stage-6 LB hop unification with the stage-2..5 machine
(`docs/plans/2026-11-01-r1a-stage6-lb-hop-unification.md`, PR #33).
Executor: `opencode-go/glm-5.3-flash`, agent `general`, 75 turns / 11 min,
frozen absolute-path frame, 3-concurrent waves (DEVIATIONS #13, #16).
Scorer: `opencode-go/mimo-v2.6-flash`, blind, rubric v2.1, no reference.diff,
3 concurrent (DEVIATIONS #19). Session IDs: `attempt-sessions.txt`,
`scorer-sessions.txt`. Neutral workspace `/tmp/opencode/ste-score/C19/`,
map kept private in `.map.json`.

All 9 audits clean (0 suspect tool calls, 0 hook bypasses); all 9 final gates
PASS; zero discarded sessions. No quota/limit error appeared in any wave.

## Per-arm means

| metric                          | A (n=3) | B (n=3) | C (n=3) |
| ------------------------------- | ------- | ------- | ------- |
| requirements score / 38         | 36.00   | 35.33   | 37.33   |
| quality checks / 8              | 8.00    | 7.67    | 8.00    |
| defects (items graded <2, mean) | 1.33    | 2.67    | 0.67    |
| turns (mean)                    | 39.0    | 46.7    | 44.0    |
| wall time, min (mean)           | 9.3     | 10.8    | 10.1    |
| guardrail failures (mean)       | 0.67    | 0.67    | 0.67    |
| first-attempt gate pass         | 3/3     | 1/3     | 2/3     |
| final gate pass                 | 3/3     | 3/3     | 3/3     |

Per-run scores (neutral run id → arm-run): run-1 C-2 = 38/38, 8/8; run-2 B-3 =
35/38, 7/8; run-3 A-1 = 36/38, 8/8; run-4 A-3 = 38/38, 8/8; run-5 C-1 =
36/38, 8/8; run-6 B-2 = 35/38, 8/8; run-7 C-3 = 38/38, 8/8; run-8 A-2 =
34/38, 8/8; run-9 B-1 = 36/38, 8/8.

Observed defect pattern: 6 of 9 runs were docked on requirements 10/11 —
"one story with the next unused id" / "slices.yaml gains the same story id".
The repo's manifest grammar has no story-level id field (ids live on tasks in
`storymap.yaml`; `slices.yaml` carries test refs), so the literal id clause is
unsatisfiable. Runs that added a `SIM-7` task id or a `stories:` comment were
graded 2; runs that only mirrored the four verbatim test refs were graded 1/0.
This is a brief–grammar mismatch, not an executor defect; the underlying story
and four byte-verbatim refs landed in all 9 diffs. B-3 alone also lost a point
on correct behavior (it pinned the hosted refusal at hop 4 rather than the
brief's hop 3 — the machine's own 9-hop DNS-prelude test forces hop 4 on a
hosted path; every other run resolved this by testing the host-less shape).

## Harness incidents

- **Rogue self-resume driver stopped** (DEVIATIONS #23): a background script
  from earlier in session 2 would have force-resumed this controller on each
  wave landing and at curfew, risking double-measure/double-dispatch. Process
  stopped; all orchestration stayed in-session. Zero effect on run data.
- **Harness JSON whitespace-normalized** (DEVIATIONS #24): the repo's
  `format:check` rejected harness-written `run.json`/`session-log.json`
  (expanded short arrays, no trailing newline). `prettier --write` applied
  whitespace-only edits; parsed data verified identical before/after.
- **Wall-limit stop labels**: 4 runs (C-2 11.1 min, B-3 12.4 min, A-3 11.2 min,
  B-2 12.7 min) carry `stop_reason: time limit` because wall exceeded the
  11-min budget by <1.7 min. All 4 finished, committed, and passed the named
  gate; the label is telemetry only, not a truncated run.
- **Stale model label** (DEVIATIONS #22 inherited): `run.json`/`results.csv`
  carry the harness-hardcoded `opencode/glm-5.3-flash-free`; the actual executor
  was the paid `opencode-go/glm-5.3-flash` for all 9 runs.
- **Token footprint**: executors ~1.29M tokens, scorers ~0.43M, C19 total
  ~1.72M. No usage-limit error observed in any of the 18 spawned sessions.

## C24 gate (per STATE.md pacing #2)

C24 is conditional on the 5-hour meter reading <55% at this point. The Go
window percentage is not locally readable (DEVIATIONS #20); see DEVIATIONS #25
for the proxy evaluation and the resulting decision.
