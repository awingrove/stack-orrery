# C10 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 68.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — align/slot phases, verbatim passthrough, tray injection + hidden/incomplete-state rule, stage-switch clear, no minted hop frames.
- **no unrelated changes** — the diff touches only files the requirements call for.
- **follows project conventions** — vanilla ESM, no inline handlers/styles, claim vocabulary, line caps (300 js/css, 450 tests), engine-free DOM module boundary.
- **test coverage** — the four e2e titles + unit alignment pins exist verbatim; counter-examples pinned.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
