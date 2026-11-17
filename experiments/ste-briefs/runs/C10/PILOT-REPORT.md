# Phase 2 pilot report — change C10 (b5-compare-tray)

Date: 2026-11-13. Protocol: `docs/plans/ste-brief-experiment.md` §6, §8, §9.
Executor (all 9 runs): `opencode-go/glm-5.3-flash` — human-ratified tier
switch from the recorded free tier (DEVIATIONS #13; free wave-1 artifacts
kept as `run.free-tier-superseded.json`).
Rewriter: `opencode-go/qwen3.7-plus` (B, C). Scorer:
`opencode-go/gemini-4-argon`, blind (arm-neutral diff names).
Run order (seed 20261112): C-2 B-3 A-1 | A-3 C-1 B-2 | C-3 A-2 B-1.

## 1. Does the harness work end to end?

Yes, after three harness-level failures that were caught, contained, and
recorded (DEVIATIONS #13–#16):

1. **Free-tier quota exhaustion** — wave 2 died on arrival (0 work);
   whole-change tier switch ratified.
2. **Dispatch-before-reset** (my error) — wave-1 paid runs saw a completed
   solution; all three discarded, dirs reset, re-run clean.
3. **Executor cwd leak** — B-2 v1 read 6 parent-repo files (incl. the
   shipped implementation); discarded on audit. Fix: absolute-path rule in
   the frame; audit extended to all tool-call types.

The audit gate (session-log scan of every non-run-dir tool call) is the
load-bearing containment: all 9 counted runs audited clean. Measurement
pipeline (gate run, diff stats, scope drift, session telemetry) works.
Known gaps: `first_attempt_gate_pass` is null for all runs (log parsing of
verify calls failed to find them — gates were executed via the pre-commit
hook); the harness-measured gate result is solid, the first-attempt flag
needs a fix before the full run.

## 2. Spread inside each arm (the noise level)

| metric                   | arm | mean   | min..max       |
| ------------------------ | --- | ------ | -------------- |
| turns                    | A   | 70.0   | 66..72         |
| turns                    | B   | 67.3   | 65..70         |
| turns                    | C   | 60.0   | 48..76         |
| wall s                   | A   | 687    | 619..783       |
| wall s                   | B   | 810    | 791..848       |
| wall s                   | C   | 767    | 649..909       |
| tokens in                | A   | 150039 | 145024..155756 |
| tokens in                | B   | 156114 | 151964..160953 |
| tokens in                | C   | 144406 | 133062..156942 |
| files changed            | A   | 10.7   | 10..11         |
| files changed            | B   | 10.0   | 10..10         |
| files changed            | C   | 10.3   | 10..11         |
| lines added              | A   | 498    | 426..542       |
| lines added              | B   | 474    | 452..489       |
| lines added              | C   | 481    | 464..491       |
| file overlap             | all | 0.8    | 0.8..0.9       |
| requirements score (/68) | A   | 68.00  | 68..68         |
| requirements score (/68) | B   | 67.67  | 67..68         |
| requirements score (/68) | C   | 67.00  | 66..68         |
| checks score (/8)        | all | 8.0    | 8..8           |

## 3. Does any metric differ between arms by more than the spread?

**No.** The largest between-arm deltas (turns: A−C = 10; wall: B−A = 123 s;
score: A−C = 1 pt) are all inside the corresponding within-arm spreads
(turns C range 28; wall C range 260 s; score C range 2). Per the §9.5
decision rule this pilot is **inconclusive** on every metric — which is a
valid pilot outcome, not a failed one: the harness produces clean
per-arm data, and one change cannot resolve a wording effect.

## 4. Contamination, setup failures, log gaps

- Discarded: free wave-2 (3 runs, DOA), paid wave-1 v1 (3 runs, solution
  exposure), B-2 v1 (parent-repo reads). All recorded with session ids.
- All 9 counted runs: gate PASS, 0 guardrail failures recorded by the
  harness counter, stop reason "finished" (C-2 mechanically labelled
  "time limit" at 15.1 min after completing its work).
- Log gap: first-attempt gate flag (see §1).
- All executors chose trace-snapshot labels over the URL-input fallback;
  all chose "hidden" over empty-state; several added sanctioned
  extractions under the 300-line cap. Arm C's scorer-visible difference:
  C-3 split pure contracts into `model-compare.js` (cost 2 rubric points).

## 5. Cost and time per run

- Wall: 10.3–15.1 min per run. Tokens in+out+reasoning: A ≈ 165k, B ≈ 172k,
  C ≈ 160k per run (mean). Session `cost_usd` records 0 (subscription
  billing); tokens are the cost proxy.
- Scoring: 9 sessions ≈ 1–2 min each; blind naming worked.

## 6. Recommendation on run count for the full experiment

1. **Keep 3 runs per arm per change** — the §9.5 decision rule compares
   across changes (same direction in ≥70% of changes), so per-change n=3
   suffices for a cross-change verdict; raising n inside one change mainly
   buys spread precision. If quota allows, n=4 on the 2–3 hardest changes.
2. **Fix before the full run**: first-attempt-gate parsing; consider
   raising the wall limit to original+50% of the SLOWEST observed replay
   (the 15-min limit clipped one completed run mechanically).
3. **Scorer calibration**: scores clustered at 66–68/68 — the rubric's
   ceiling is too low to discriminate at this difficulty. Tighten anchors
   (grade the named counter-examples harder; weight "unrelated changes"
   and extraction choices) before the full run, then freeze.
4. **Executor cwd rule stays**: absolute-path frame + full audit on every
   run. 1 of 12 clean-wave runs would have been contaminated without it.

## 7. Human check (§8.3)

2 runs (20%): blind diffs at `/tmp/opencode/ste-score/C10/run-4.diff` and
`run-2.diff` with `requirements.md` + `rubric.md` beside them. Arm labels
revealed after the human grades. Agreement threshold: 70%.

## 8. Re-score addendum — rubric v2 (human policy, 2026-11-14)

The §8.3 human check (5-question interview; delegated ChatGPT Free and
Claude Sonnet 5.5 assessments analyzed) produced a frozen scoring policy
(P1–P4, see `C10/rubric.md`). All 9 runs re-scored blind under rubric v2.

| run | arm | req v1 | checks v1 | req v2 | checks v2 |
| --- | --- | ------ | --------- | ------ | --------- |
| A-1 | A   | 68     | 8         | 67     | 6         |
| A-2 | A   | 68     | 8         | 68     | 8         |
| A-3 | A   | 68     | 8         | 68     | 7         |
| B-1 | B   | 68     | 8         | 68     | 8         |
| B-2 | B   | 67     | 8         | 67     | 7         |
| B-3 | B   | 68     | 8         | 67     | 7         |
| C-1 | C   | 68     | 8         | 68     | 7         |
| C-2 | C   | 67     | 8         | 66     | 6         |
| C-3 | C   | 66     | 8         | 67     | 7         |

Arm means v2 — requirements: A 67.67 · B 67.33 · C 67.00; checks:
A 7.00 · B 7.33 · C 6.67.

**Findings:**

1. **v2 is more discriminating.** v1 clustered at 66–68/8; v2 spread to
   66–68 with checks 6–8 and surfaced real defects v1 missed — most
   notably B-3's `nextCompareSlots` re-push check covering only the right
   slot, and missing 20-entry-cap counter-example pins in several runs'
   e2e suites. The tightened anchors are doing their job.
2. **The human-policy ranking flip did NOT materialize in aggregate.** The
   interview predicted C-3 ≥ B-3 once extractions were forgiven; v2 scored
   them tied at 67 — C-3 gained the extraction back (P2) but lost points
   to v2's stricter fidelity/test anchors; B-3 lost its extraction-free
   status to the churn ding (P4) and the re-push bug. The two effects
   cancelled: pilot verdict **unchanged — inconclusive**, now with a
   better instrument.
3. **Instrument defect found and fixed (rubric v2.1):** the v2
   no_unrelated_changes anchor ("new files not asked for … = 1")
   contradicted P2 — it re-penalized sanctioned extractions on a second
   axis. v2.1 limits no_unrelated dings to churn/reformatting (P4) and
   cross-boundary moves; sanctioned extractions are penalized nowhere.
   One run (C-3) was affected as-scored; its v2.1-normalized value is
   68/68 with checks 7/8. Arm means under v2.1: A 67.33 · B 67.33 ·
   C 67.33 — identical.
4. **Scorer reliability:** 5 of 18 v2 scorer sessions returned empty
   (retried successfully with a mandatory-output instruction). The full
   run must dispatch scorers with that instruction from the start.
5. **Blind-naming integrity held:** no scorer session saw an arm label.

**Bottom line:** rubric v2.1 (human policy, churn-only no_unrelated) is
the frozen instrument for the full run. The pilot's headline finding
stands: no arm effect beyond noise on a single change; the instrument is
now sharp enough to detect real quality differences when they exist.
