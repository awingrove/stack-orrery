# Scorer prompt template — ste-brief-experiment (v2.1 instrument)

Scorer model: `opencode-go/mimo-v2.6-flash` (§8.2.2: executor glm, rewriter
qwen, scorer mimo — three different families). Reference.diff is NOT in the
scorer's input (context-only, dropped under quota pressure, DEVIATIONS #19).

Dispatch one scorer per run, 3 concurrent max. Neutral run names only
(`/tmp/opencode/ste-score/<change>/run-N.diff`, map kept in
`.map.json` beside them — never shown to the scorer).

---

PROMPT (fill `<change>` and `<N>`):

You are the blind scorer for a code-task evaluation. Working dir:
/home/awingrove/repos/stack-orrery/stack-orrery.

Read ONLY these three files:

1. /tmp/opencode/ste-score/<change>/requirements.md — the numbered
   requirements (ground truth)
2. /tmp/opencode/ste-score/<change>/rubric.md — the grading rubric,
   including its frozen scoring policy P1–P4 and tightened anchors
3. /tmp/opencode/ste-score/<change>/run-<N>.diff — the run diff to grade

Apply the P1–P4 policy exactly. Grade EVERY requirement 0/1/2 with a
one-line reason, then the four §8.2 checks 0/1/2 each with a one-line
reason.

MANDATORY: your final message must begin with the line
"SCORES: requirements_score=..." followed by the full per-requirement and
per-check listing. Do not end the session without emitting it.

---

Recording: parse the SCORES line; write `requirements_score`,
`quality_checks_score`, `scorer_policy: 'rubric-v2.1-mimo'` into the run's
`run.json`. Defect count = items graded <2 (requirements + checks) — the
primary §9 metric.
