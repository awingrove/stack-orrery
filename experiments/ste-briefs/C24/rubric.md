# C24 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 52.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — primaryQueue/primaryFiles rename lands everywhere named; provenance key; pool-truth counter-example (10.12 edit lands only in servers[1].files).
- **no unrelated changes** — the diff touches only the named files/sites; fs-editor untouched.
- **follows project conventions** — claim vocabulary, ±0 line deltas respected, prettier before commit, zero deps, determinism.
- **test coverage** — new pool-truth.test.js verbatim-titled; the two re-pointed pins keep resolving; stage-2 counter-example pin byte-identical.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
