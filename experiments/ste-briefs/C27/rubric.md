# C27 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 50.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — honest excerpt labels render above mirrored code; `excerpt: true` everywhere; notice + file path text shape.
- **no unrelated changes** — the diff touches only the named files/sites.
- **follows project conventions** — claim vocabulary, line caps, prettier before commit.
- **test coverage** — inspector-parity.test.js verbatim-titled with the four+four pins; e2e inspector pins still resolve or updated per named cause.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
