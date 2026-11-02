# R6a — guard hygiene suite: determinism + modeling hygiene + no-inline-html + PR-NOTES body step

Tooling slice under recommendations.md Stage R6a, absorbing the guard-suite
audit pass (2026-11-02, qwen-3.7-plus adjudicated; all four candidates
ADOPT/ADOPT-WITH-TWEAK, zero harmful live hits on the current repo). Four
new deterministic checks + one workflow step; no repo production code
changes; no existing rule weakened.

## Repo rules (bound, hard)

- NEVER weaken a guardrail, test, threshold, or manifest rule. Zero runtime
  deps; no inline handlers/styles; `js/sim/**` deterministic. Strict
  CHECKS:/PINS:/DOCUMENTS: vocabulary — new script comments must obey it
  (guarantee words only inside CHECKS:/PINS: paragraphs).
- File size: `scripts/**` joins the guard-file-size scan set at a 400-line
  threshold (chunk-8/chunk-10 recommendation: tooling can be slightly
  larger; `extract-session-metrics.mjs` is 327 and passes). Prod/test/e2e
  thresholds unchanged.
- Prettier: every new `.mjs` file must be prettier-clean BEFORE commit (the
  pre-commit hook is a red gate; two prior slices lost commits to it).

## Boundary contracts (Step 2)

### 1. scripts/guard-determinism.mjs (new, ~40 LOC)

- Scan `js/sim/**/*.js` for these OFFENDING patterns (fail named per hit):
  `Math.random(`, `Date.now(`, `new Date(`, `setTimeout(`, `setInterval(`,
  `requestAnimationFrame(`, `performance.now(`.
- COMMENT-STRIP TWEAK (qwen finding): strip `//` line comments and
  `/* … */` block comments BEFORE scanning — `users.js:55` and `rng.js:2`
  mention Math.random in prose today and must not false-fail.
- Fail message names the file:line and the rules text ("js/sim is
  deterministic: seeded rng only, explicit tick advance; Date.now /
  Math.random / timers are forbidden").
- Exit 0 today (verified clean — live hits are only the two stripped
  comments).

### 2. scripts/guard-modeling-hygiene.mjs (new, ~25 LOC)

- Same scan shape over `js/sim/**/*.js`; fail on ANY of:
  `/^\s*\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/`-style dotted-quad IPs in any
  token position (use `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`, word-
  bounded — confirm zero live hits today);
  the literal `HTTP/1.1` anywhere;
  the literal `innerHTML` anywhere.
- Fail message names the AGENTS.md rules ("two-number mini-IPs, slim
  GET/status protocols, no innerHTML: simulations narrate real component
  records, not HTTP chrome"). Zero live hits today.

### 3. scripts/guard-no-inline-html.mjs (new, ~30 LOC)

- Scan `*.html` (repo root) for: any `on[a-z]+=` attribute (inline
  handlers), any `style=` attribute (inline styles), any `<script` tag
  WITHOUT `type="module"`.
- Zero live hits today (qwen-verified). Fail message cites AGENTS.md
  ("CSP temptation is a defect to report, not a CSP to relax") +
  scripts/static-server.mjs's `script-src 'self'; style-src 'self'`.
- Fail names file:line and the offending token.

### 4. scripts/check-pr-notes.mjs (new, ~25 LOC) + ci.yml step

- The script: reads `process.env.PR_BODY` (empty = fail), requires ALL of:
  `^### TL;DR` / `^### Review path` / `^### Decisions needed` /
  `^### Risk map` / `^### Verification` (multiline) at least once each,
  plus `<details` with `<summary` containing `Record` (case-insensitive)
  somewhere in the body. Fail message names the missing section(s) and
  cites factory-kit PR-NOTES.md ("decision half on top, record collapsed;
  a body that requires the glossary to have read anything is unreviewable").
- ci.yml: NEW job `pr-notes` gated `if: github.event_name == 'pull_request'`,
  runs the script with `PR_BODY: ${{ github.event.pull_request.body }}`.
  Existing build job untouched.
- PROBE: fetch PR #31's body via `gh pr view 31 --json body --jq .body`,
  set PR_BODY, run the script → exit 0; same with a truncated body
  (only the TL;DR) → exit 1 naming the missing sections. Restore env after.

### 5. Compose + record

- scripts/guard-all.mjs: append the three new guards to the GUARDS list in
  existing composition style.
- scripts/guard-file-size.mjs: add `scripts: 400` to the threshold map
  (pattern-matching the existing per-kind mapping) so scripts/**/*.mjs are
  counted and capped at 400.
- Each new guard script carries a 2–3 line header: DOCUMENTS: what it
  enforces + the AGENTS.md rule it protects.

## §Tests

- No target-code changes, no unit tests added: the guards' own bite is the
  probe (verify → fail→fix→pass for the temporary probe fixture,
  documented below). No storymap/slices change (the allowlist covers
  scripts/** and .github/**; nothing here is slice-owned).

## Probe (fail→fix→pass per new guard, then clean up)

1. Write a temp file `js/sim/_probe_determinism.js` with one
   `Math.random()` call → run the guard → observe the named file:line
   failure → delete the file (temp-file probe is removed before commit;
   guard-slices meta-1 rejects stray files anyway).
2. Repeat once per guard for a representative safe pattern (a dotted-quad
   string; an `<script>`-without-module HTML snippet; no <details> body)
   → each guard fails naming the line; clean up.
3. `npm run guard` → all green; `npm run verify` → green.

## Manifests

- None. (Allowlisted tooling only.) No new brief claims:
  the metric entry records the red-run and probe counts, not a
  manifest-touch story.

## Ticks

- [x] Step 1 (Lead session): human design sign-off (2026-11-02; suite
      scoped from the user's "adopt those 3" + qwen's bonus #4).
- [ ] Step 2 (Executor sub-agent): cold implementation from the contracts,
      `npm run verify` + probe round per guard, green; tick and commit.
- [ ] Step 3 (Lead session): `npm run metrics:extract -- <sessionID>`,
      append entry `R6A-GUARD-HYGIENE-SUITE` to docs/factory/slice-metrics.yaml,
      tick, commit.
