# C19 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 38.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — shared helper unifies the stage-5/stage-6 LB hop; refusal ends at hop 3 with restart; `refused: false` parity.
- **no unrelated changes** — the diff touches only files the requirements call for.
- **follows project conventions** — vanilla ESM, claim vocabulary, line caps, clean scoped commits.
- **test coverage** — the four named test titles exist verbatim in `test/sim/engine.test.js`.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
