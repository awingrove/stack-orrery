# C08 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 76.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — writeFile/setWebFile fail-loud semantics, no cache invalidation, editor commit/cancel flow, render-from-snapshot.
- **no unrelated changes** — the diff touches only files the requirements call for.
- **follows project conventions** — vanilla ESM, no inline handlers/styles, claim vocabulary, determinism, file caps.
- **test coverage** — the brief §4 test titles exist; negative cases pinned.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
