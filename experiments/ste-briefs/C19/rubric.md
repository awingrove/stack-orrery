# C19 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 38.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — shared helper unifies the stage-5/stage-6 LB hop; refusal ends at hop 3 with restart; `refused: false` parity.
- **no unrelated changes** — the diff touches only files the requirements call for.
- **follows project conventions** — vanilla ESM, claim vocabulary, line caps, clean scoped commits.
- **test coverage** — the four named test titles exist verbatim in `test/sim/engine.test.js`.

## Frozen scoring policy (v2.1, 2026-11-14, human-approved interview)

- **P1 — process requirements.** Requirements a diff cannot show (reads,
  gate runs, commit message, push/report instructions): grade 2 when the
  diff is consistent with them. The harness verifies them mechanically
  outside the scorer (gate output, commit, session telemetry).
- **P2 — sanctioned adaptation.** When a file cap forces an extraction
  into a new sibling module, grade the affected requirement 2, provided
  the moved logic keeps its pure/DOM boundary and the move is signed in
  code or comments.
- **P3 — fidelity.** A stored or derived value must keep every field of
  the source descriptor it claims to render (label prefixes such as the
  method, text shapes). A dropped or altered field = 1 on that requirement.
- **P4 — noise.** Comment rewrites or reformatting beyond what the change
  needs = 1 on the no_unrelated_changes check.

## Anchors (tightened v2.1)

- **correct behavior:** check derived values against their source shape
  (e.g. a headline label against the stored run descriptor), not merely
  their presence.
- **no unrelated changes:** churn beyond the change's need = 1; moves of
  contracted logic across the stated pure/DOM boundary = 1. Sanctioned
  cap-driven extractions (P2) are NOT unrelated changes and are penalized
  nowhere.
- **test coverage:** grade the named counter-examples specifically; a
  missing named counter-example = 1 even if adjacent tests pass.

(§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
