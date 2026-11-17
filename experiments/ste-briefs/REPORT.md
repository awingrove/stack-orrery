# ste-brief-experiment — final report

## Decision (§9.8 — ≤10 lines)

Tested: does rewriting sub-agent briefs in an ASD-STE100-style controlled
language (arm B) or as a careful restructure (arm C) change executor
performance, replayed across 4 accepted changes (C10 medium, C07 large/HARD,
C19 small, C24 medium; 9 runs each; executors glm paid/free and mimo; blind
v2.1 scoring). Result: **arm B never helped — it was worse-or-tied in 4/4
changes on requirements, worse on defects in 3/4, and worse on
first-attempt-gate pass in 3/4; arm C ≈ arm A everywhere except C19 where C
led.** By the pre-registered §9.5 rule (same direction ≥70% AND magnitude >
within-arm spread) the B-vs-A direction is consistent (4/4) but the
magnitudes sit inside the noise band in 3/4 changes — so the verdict is:
**no support that controlled-language briefs help; a consistent weak
negative trend; inconclusive by the rule, decisive enough for a
recommendation: do not adopt controlled-language briefs in this repo.**
Recommended next step: none on brief wording — the observable quality
losses came from brief-contract defects (an unsatisfiable clause in C19),
not from prose style.

## 1. Per-change table (§9.1–§9.4 — no cross-change average)

Requirements mean (max), defects mean (items graded <2), first-attempt
gate pass, final gate pass:

| change (executor, scorer) | A req      | B req      | C req      | A def | B def | C def | A 1st-gate | B 1st-gate | C 1st-gate |
| ------------------------- | ---------- | ---------- | ---------- | ----- | ----- | ----- | ---------- | ---------- | ---------- |
| C10 (glm paid, gemini)    | 67.67 (68) | 67.33 (68) | 67.33 (68) | 1.33  | 1.33  | 2.33* | 1/3        | 2/3        | 1/3        |
| C07 (glm paid, mimo)      | 67.67 (68) | 66.67 (68) | 67.67 (68) | 0.67  | 0†    | 1.00  | 0/3        | 0/3        | 0/3        |
| C19 (glm paid, mimo)      | 36.00 (38) | 35.33 (38) | 37.33 (38) | 1.33  | 2.67  | 0.67  | 3/3        | 1/3        | 2/3        |
| C24 (mimo, qwen)          | 52.00 (52) | 51.67 (52) | 52.00 (52) | 0.00  | 0.67  | 0.00  | 3/3        | 2/3        | 3/3        |

\* C10 defects are v2-as-scored; under the v2.1 anchor fix C-3's
no_unrelated ding is an instrument artifact (C mean defects 1.67 — the
A/B comparison is unaffected). † C07's B-2 per-item grades were not
retained (only totals, 65/68 = 5 points down); B's defect mean is a
lower bound of 0 excluding it (B-1, B-3 scored 0 defects).

## 2. Comparisons (§9.3)

- **B vs A**: B worse-or-tied in 4/4 changes (requirements: −0.33 to −1.0).
  Defects: B worse in C19 (+1.34) and C24 (+0.67), tied C10, ≤A in C07.
  First-attempt gate: B worse in C19 (1/3 vs 3/3) and C24 (2/3 vs 3/3),
  equal-bad in C07 (0/3 all), better in C10 (2/3 vs 1/3).
- **B vs C**: C ≥ B in 3/4 (C19 +2.0, C07 +1.0, C24 +0.33; C10 tie on
  requirements, B better on defects pre-fix).
- **C vs A**: tie in C07/C24/C10 (v2.1-normalized), C better in C19
  (+1.33 requirements, −0.66 defects, first-attempt 2/3 vs 3/3).

## 3. The rule applied (§9.5)

B-vs-A direction: 4/4 = 100% ≥ 70% ✓. Magnitude vs within-arm spread:
C10 tie; C07 −1.0 vs spread 1.0 (not clearly larger); C19 −0.67 vs
spreads 1–2 (not larger); C24 −0.33 vs spreads 0–1 (not larger). The
second condition fails in 3/4 → **the effect does not meet the
pre-registered bar: reported as inconclusive, with a consistent
weak-negative direction that no reading of the data supports as
positive.**

## 4. Notable per-change observations (§9.7)

- **C19 brief-grammar defect (the study's clearest finding):** the arm-A
  brief demanded a "story with the next unused id" that the manifest
  grammar cannot express (ids live on tasks, not stories). 6 of 9 runs
  were docked on requirements 10/11 depending on how each executor tried
  to comply. A brief-contract defect costs more than any wording style.
- **C07 (HARD):** every run failed its first gate attempt (0/9) — the
  change is genuinely hard; arm C logged the most guardrail failures
  (6.33) and turns (191) while B logged the fewest (2.67) — B's fewer
  gate cycles did not translate into better scores. One undisclosed
  pre-commit-hook bypass (C-3, recorded); its gate was independently
  re-verified by the harness.
- **C24 ceiling:** 8/9 runs scored a perfect 52/52 — the rubric's ceiling
  limits discrimination on small, well-specified changes.
- **Executor-family spread:** C24 (mimo) produced the cleanest runs of
  the study (A/C defect-free, all gates green first-try except B-3/B-2).

## 5. Cost and time (§9.7)

Wall per run: C10 8.5–15.1 min · C07 28.6–43.9 · C19 ~9–11 · C24 10.7–16.8.
Turns and tokens tracked in each change's RESULTS.md. Scoring ≈ 1–3 min per
run. Total experiment: 45 valid runs + 2 discarded batches (attempt-1 C07
quota kill; contaminated wave-1) + 4 scorer-model generations.

## 6. Deviations and contamination (§9.7)

All recorded in `DEVIATIONS.md` #1–#26: two contaminated batches (caught by
audit, discarded, zero data leakage), one quota-killed batch (partials
snapshotted), three scorer-model changes (gemini → mimo → qwen, all
blind, all 3-family-separated from each change's executor and rewriter),
the cwd-leak fix, the instrument fix (v2 → v2.1), two hook bypasses
(one undisclosed — C07 C-3), one concurrency over-cap. Every counted run
passed the full tool-call audit.

## 7. Limits (§9.7)

Small sample (4 changes after quota cuts, n=3 per arm); one repo; executor
models vary by change (by design — §12) so cross-change comparisons carry
executor effects; scorer models differ across changes (recorded, all
blind); C10 scored under the pre-v2.1 anchors; rubric ceilings (C24);
first-attempt-gate data for C10 is from session logs only; the monthly
quota forced the slate from 7 to 4 changes (C08, C09 dropped).

## 8. Recommended next steps

1. Do not adopt controlled-language briefs. If brief quality is the
   target, invest in contract review (the C19 unsatisfiable-clause class:
   every brief clause must be satisfiable in the repo's actual grammar).
2. A later experiment could test the reverse hypothesis (does arm B's
   rigidity hurt specifically on large/HARD changes — C07's B arm was the
   only one with a hook bypass and the strongest rigidity signal) with a
   larger sample, on a plan with more quota.
3. Keep the harness: the audit + blind-scoring pipeline caught two
   contamination events and one real escaped-defect class (C07 stage-1–5
   frame regression) that the gate alone would have missed.
