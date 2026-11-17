# C24 — results (9 runs, v2.1 scoring)

Status: **complete** — 9/9 runs dispatched, audited, measured, scored (2026-11-17).
Change: r2c pool-truth rename (`docs/plans/2026-11-02-r2c-pool-truth.md`,
PR #38). Executor: `opencode-go/mimo-v2.6-flash`, agent `general`, 57 turns /
32 min, frozen absolute-path frame, 3-concurrent waves. Scorer:
`opencode-go/qwen3.7-plus` — third family, preserving §8.2.2 because the
executor is mimo (DEVIATIONS #26). Blind v2.1 rubric, no reference.diff, 3
concurrent. Session IDs in `attempt-sessions.txt` / `scorer-sessions.txt`;
neutral workspace `/tmp/opencode/ste-score/C24/` with private `.map.json`.

All 9 final gates PASS; zero discarded sessions. C24 was authorized by the
proxy meter evaluation in DEVIATIONS #25 (the Go-window percentage itself is
not locally readable, DEVIATIONS #20).

## Per-arm means

| metric                          | A (n=3) | B (n=3) | C (n=3) |
| ------------------------------- | ------- | ------- | ------- |
| requirements score / 52         | 52.00   | 51.67   | 52.00   |
| quality checks / 8              | 8.00    | 7.67    | 8.00    |
| defects (items graded <2, mean) | 0.00    | 0.67    | 0.00    |
| turns (mean)                    | 36.0    | 37.3    | 35.7    |
| wall time, min (mean)           | 12.5    | 16.8    | 10.7    |
| guardrail failures (mean)       | 0.00    | 1.00    | 0.00    |
| first-attempt gate pass         | 3/3     | 2/3     | 3/3     |
| final gate pass                 | 3/3     | 3/3     | 3/3     |

Per-run scores (neutral run id → arm-run): run-1 C-2 = 52/52, 8/8; run-2 B-3
= 51/52, 7/8; run-3 A-1 = 52/52, 8/8; run-4 A-3 = 52/52, 8/8; run-5 C-1 =
52/52, 8/8; run-6 B-2 = 52/52, 8/8; run-7 C-3 = 52/52, 8/8; run-8 A-2 =
52/52, 8/8; run-9 B-1 = 52/52, 8/8.

Ceiling effect: 8 of 9 runs scored a perfect 52/52 + 8/8. The sole defect
bearer (B-3) lost one requirement point (re-pointed in-place tests plus an
extra `model.test.js` consumer) and one check point on "no unrelated changes"
for that same necessary fixture update. The brief's walk-scope ledger named
four code sites + two schema pins but omitted `test/panel/model.test.js`,
whose exact-shape `toEqual` breaks under the new `serverAddress` key; all 9
runs discovered and fixed it in place. The ledger omission and a test-title
mismatch (brief §Test 4 quotes the pre-rename `'queue'-'files'` title; the
dispatch quotes the post-rename `'primaryQueue' / 'primaryFiles'` title) were
reported by every run; both belong to the brief, not the executors.

## Harness incidents

- **C-2 and B-2 audit false positives** (DEVIATIONS #27): both flagged on a
  read-only `git config core.hooksPath` diagnostic; no `--no-verify`, no
  hooksPath assignment, commit hooks active. Both retained as data.
- **C-3 genuine pre-commit hook bypass** (DEVIATIONS #28): committed with
  `git -c core.hooksPath=/dev/null`. Retained under the human's ZERO-discards
  order, but flagged as a real executor fidelity defect. The harness
  independently re-ran the named gate at measure: C-3 gate PASS, so the
  bypass concealed no failure. Surfaced here per #28.
- **Stale model label** (DEVIATIONS #22 inherited): `run.json` / `results.csv`
  carry the harness-hardcoded `opencode/glm-5.3-flash-free`; the actual C24
  executor was `opencode-go/mimo-v2.6-flash` for all 9 runs.
- **Token footprint**: executors ~1.11M tokens, scorers ~0.05M, C24 total
  ~1.16M. Combined C19+C24 ~2.88M against the ~4.2M monthly remainder in
  STATE.md (~1.3M left). No usage-limit error in any of the 18 spawned
  sessions. No wave was left in flight across the 23:30Z curfew.
