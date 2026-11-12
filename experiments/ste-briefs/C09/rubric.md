# C09 — scorer rubric

Grade each requirement in `requirements.md`: 0 = not met, 1 = partly met,
2 = fully met. One-line reason per grade. Total out of 66.

Plus these §8.2 checks (0/1/2 each, one-line reason):

- **correct behavior** — cdn.js lookup/fill/snapshot semantics (TTL eviction, HIT/MISS, POST never fills), real router crossings, real origin pull, no fabricated bytes, hop-count shapes (6/9/pass-through), 6a shapes byte-identical.
- **no unrelated changes** — the diff touches only files the requirements call for.
- **follows project conventions** — vanilla ESM, no inline handlers/styles, claim vocabulary, determinism, 300-line caps, manifest glob rule.
- **test coverage** — the brief §5 test titles exist verbatim; negative cases pinned.

Blind-scorer rules (§8.2.3): the scorer receives only this rubric,
`requirements.md`, the run diff and the reference diff — no arm name, no
brief text, no run log.
