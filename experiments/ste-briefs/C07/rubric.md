# C07 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 68.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — the delivered components behave as the requirements state (DNS ask/answer, NX, fail-loud, cross-subnet router, trace narratives).
- **no unrelated changes** — the diff touches only files the requirements call for.
- **follows project conventions** — vanilla ESM under `js/sim`/`js/panel`, external CSS/JS only, claim vocabulary, determinism.
- **test coverage** — the brief's pinned test titles exist and pin the negative cases.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
