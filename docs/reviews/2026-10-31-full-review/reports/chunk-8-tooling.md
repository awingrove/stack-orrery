# Chunk 8 — Tooling Review Report

- **Date:** 2026-10-31
- **Reviewer:** Qwen3.7 Plus
- **Charter:** Guards are the repo's immune system; verify each guard bites (file-size, plan-tick, metrics, debt, slices, story refs, claims) and that CI = `npm run verify` gate contract is faithful; static-server CSP headers; measuring extraction scripts robustness; guard bypass/discipline risk.

---

## Findings

### 8-01. `scripts/*.mjs` not covered by `guard-file-size`

- **severity:** Low
- **category:** code-quality
- **files:** `scripts/guard-file-size.mjs:29-30`, `scripts/extract-session-metrics.mjs:1`
- **evidence:** `SOURCE_DIRS = ['js', 'css', 'e2e', 'test']` and `SOURCE_EXT = new Set(['.js', '.css', '.html'])` (guard-file-size.mjs:29-30). `extract-session-metrics.mjs` is 327 lines, `guard-slices.mjs` is 259 lines, `guard-claims.mjs` is 134 lines — all tooling scripts outside the guard's scan set.
- **impact:** AGENTS.md's file-size rule explicitly scopes to `js/**`, `css/**`, `test/**`, `e2e/**`, and `*.html`, so the guard correctly implements the contract. However, `extract-session-metrics.mjs` at 327 lines exceeds the production module threshold (300) and could benefit from splitting by responsibility (Antigravity parse vs OpenCode parse vs aggregation). This is a maintenance concern, not a contract violation.
- **recommendation:** Consider adding `scripts/` to `SOURCE_DIRS` with a 400-line threshold (tooling scripts can be slightly larger than production modules since they're not shipped). Alternatively, document that scripts are exempt and split `extract-session-metrics.mjs` into `extract-antigravity.mjs`, `extract-opencode.mjs`, and `aggregate-metrics.mjs` to reduce cognitive load.

---

### 8-02. `extract-session-metrics.mjs` lacks error handling for opencode export JSON.parse

- **severity:** Medium
- **category:** robustness
- **files:** `scripts/extract-session-metrics.mjs:222`
- **evidence:** Line 222: `return JSON.parse(readFileSync(tmpFile, 'utf8'));` — no try/catch around JSON.parse. If `opencode session export` produces invalid JSON (truncated file, binary corruption, or the binary exits non-zero but the temp file is partially written), this throws an uncaught exception with no user-friendly message. The `finally` block at lines 223-229 unlinks the temp file, but the JSON.parse error propagates to the caller.
- **impact:** The script is invoked manually via `npm run metrics:extract <sessionID>` during Step 3 of the brief lifecycle. If the opencode binary is not installed, or the export format changes, or the temp file is corrupted, the user gets a cryptic `SyntaxError: Unexpected token ...` instead of a diagnostic message. This damages the tool's usability and the factory process's resilience.
- **recommendation:** Wrap the JSON.parse in try/catch and emit a diagnostic message: `console.error(\`extract-session-metrics: failed to parse opencode export for session \${id} — \${err.message}\`);`. Also check the exit code of `execFileSync` (line 218) and fail gracefully if the binary is not found (`ENOENT`).

---

### 8-03. `extract-session-metrics.mjs` hardcodes `/tmp`

- **severity:** Low
- **category:** code-quality
- **files:** `scripts/extract-session-metrics.mjs:215`
- **evidence:** Line 215: `const tmpFile = join('/tmp', \`opencode-export-${process.pid}-${id}.json\`);`— hardcoded`/tmp`path. The repo's AGENTS.md mentions`/tmp/opencode`is "pre-created and approved for external access", suggesting the convention is to use`/tmp/opencode`rather than`/tmp` directly.
- **impact:** Works on Linux/macOS but not portable to Windows. The `/tmp` directory may have different permissions or cleanup policies than `/tmp/opencode`. Given this is a CI/dev tool and the repo uses Linux, this is acceptable but inconsistent with the harness's stated convention.
- **recommendation:** Use `join('/tmp/opencode', ...)` or `os.tmpdir()` for portability. The file is unlinked in `finally` (lines 224-228), so cleanup is correct.

---

### 8-04. `static-server.mjs` missing CSP headers on error responses

- **severity:** Low
- **category:** security
- **files:** `scripts/static-server.mjs:67-69,81-82`
- **evidence:** Lines 67-69 (404 response): `res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });` — no CSP header. Lines 81-82 (500 response): `res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });` — no CSP header. CSP is only set on 200 responses (line 75).
- **impact:** CSP is a defense-in-depth measure that prevents script execution even if an attacker can inject content into a response. The 404 and 500 responses are plain text (`404 Not Found` and `500 ${err.message}`), so the risk is low. However, if `err.message` reflects user input (e.g., a malformed URL path), CSP would prevent script execution. The static server's traversal guard (line 50) and path normalization (line 49) mitigate this, but CSP on all responses is a best practice.
- **recommendation:** Add CSP, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store` to 404 and 500 responses for consistency. Example: `res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });`.

---

### 8-05. `extract-session-metrics.mjs` declares `tokensReasoning` as const but never updates it

- **severity:** Low
- **category:** code-quality
- **files:** `scripts/extract-session-metrics.mjs:71`
- **evidence:** Line 71: `const tokensReasoning = 0;` — declared as const, never updated. Line 153 returns it as part of the result object. The OpenCode parser at line 273 extracts reasoning tokens from `info.tokens?.reasoning`, but the Antigravity parser intentionally doesn't (probably because they're not available in the transcript format).
- **impact:** Minor code quality issue. The const declaration is technically correct (it's never reassigned), but it's misleading to have it as a variable at all. A reader might wonder if it's a bug that it's never updated. The field could be hardcoded to 0 in the return object, or the variable could be removed.
- **recommendation:** Either remove the variable and hardcode `tokensReasoning: 0` in the return object (line 153), or add a comment explaining why Antigravity doesn't extract reasoning tokens.

---

### 8-06. `guard-metrics.mjs` coverage rule only activates after 3 entries

- **severity:** Low
- **category:** process
- **files:** `scripts/guard-metrics.mjs:91`
- **evidence:** Line 91: `if (entries.length >= 3 && existsSync(PLANS_DIR))` — the coverage rule (every committed plan must have a ledger entry) only runs when the ledger has ≥3 entries. This is a grace period for early development.
- **impact:** Now that there are 23 plan files and the ledger has many entries, this threshold has long been passed. The grace period is no longer relevant. However, if the ledger were ever reset (e.g., archiving old entries), the first 2 new entries could skip the coverage check. This is a theoretical concern, not a current risk.
- **recommendation:** No action needed. The grace period served its purpose during early development. If the ledger is ever reset, the threshold can be lowered or removed.

---

## Brief-vs-code verification

The brief's factual claims were verified against the actual scripts:

- ✅ `guard-plan-ticks` fence stripping, continuation lines, 5 LEGACY_LONG_BRIEFS — confirmed at lines 27-39, 73-78, 12-18
- ✅ `guard-debt` schema validation, ID regex, date validation, where-path checks — confirmed at lines 13-29, 34-43, 46-54
- ✅ `guard-metrics` required fields, counter validation, coverage rule threshold — confirmed at lines 16-27, 83-88, 91
- ✅ `guard-slices` glob matcher, meta-rule 7 git diff — confirmed at lines 45-49, 229-243
- ✅ `guard-story-refs` fragment matching via `includes()` — confirmed at lines 99, 118
- ✅ `guard-file-size` limits and scan set — confirmed at lines 10-14, 29-30
- ✅ `guard-claims` paragraph merge, string literal skipping — confirmed at lines 69-91, 40-48
- ✅ `static-server.mjs` CSP headers, traversal guard, path normalization — confirmed at lines 27-37, 48-50
- ✅ `extract-session-metrics.mjs` Antigravity parse, opencode export, red-gate counting — confirmed at lines 64-159, 214-230, 232-260
- ✅ `guard-all.mjs` passes `--base origin/$GITHUB_BASE_REF` when set — confirmed at lines 21-22
- ✅ CI workflow runs the same sequence as `npm run verify` — confirmed at `.github/workflows/ci.yml:24-40`
- ✅ Pre-commit hook runs format:check → lint → unit → guard (no e2e) — confirmed at `.githooks/pre-commit:5-8`

**One nuance:** The brief's risk hotspot states "the workflow itself never sets `GITHUB_BASE_REF`" (line 52). This is factually true (the YAML doesn't set it), but GitHub Actions automatically provides `GITHUB_BASE_REF` as a default environment variable for `pull_request` events. So meta-rule 7 **does** run in CI for PRs. The brief's framing is slightly misleading but not incorrect — it's clarifying that the YAML doesn't explicitly set it, and that outside of CI, the env must be exported manually. This is not a brief-vs-code mismatch, just an ambiguity in the risk description.

---

## Praise

### 8-P1. `guard-all.mjs` clean composition

- **files:** `scripts/guard-all.mjs:1-34`
- **evidence:** Lines 8-16 list guards in a clear order. Lines 21-23 conditionally pass `--base` for PR CI. Lines 24-27 spawn each guard with `stdio: 'inherit'` and collect results. Lines 29-34 print a summary and exit 1 if any failed.
- **impact:** The composition is simple, readable, and correct. Each guard runs to completion (no early exit), so the summary shows all failures. The `--base` passthrough is elegant.

### 8-P2. `guard-plan-ticks.mjs` fence stripping and continuation line handling

- **files:** `scripts/guard-plan-ticks.mjs:27-39,73-78`
- **evidence:** Lines 27-39 strip fenced code blocks (``` or ~~~) before scanning for ticks, so examples are never metadata. Lines 73-78 collect continuation lines (indented with 2+ spaces) as part of the ticked step's text.
- **impact:** This correctly implements the PLAN-FORMAT rule that examples are never metadata. The continuation line handling ensures multi-line step descriptions are fully validated.

### 8-P3. `guard-debt.mjs` comprehensive schema validation

- **files:** `scripts/guard-debt.mjs:13-29,34-54`
- **evidence:** Lines 13-29 define a schema with required/forbidden/optional fields per section. Lines 34-43 validate ISO dates with calendar correctness (not just regex). Lines 46-54 validate backticked paths in `where` fields.
- **impact:** The schema validation is thorough and catches structural errors, duplicate IDs, invalid dates, and stale path references. The calendar date validation (line 40-41) catches invalid dates like `2026-02-30`.

### 8-P4. `guard-slices.mjs` meta-rule 7 same-change enforcement

- **files:** `scripts/guard-slices.mjs:225-249`
- **evidence:** Lines 229-236 use `git merge-base` and `git diff --name-only` to find changed files. Lines 237-243 check if slice-owned files changed without a manifest touch, failing with a clear message.
- **impact:** This enforces the "manifests same-change" rule from AGENTS.md, preventing stale manifests. The graceful skip when `--base` is not provided (line 248) is user-friendly for local runs.

### 8-P5. `guard-claims.mjs` comment extraction correctly skips string literals

- **files:** `scripts/guard-claims.mjs:30-93`
- **evidence:** Lines 40-48 skip `'`, `"`, and `` ` `` string literals while extracting comment paragraphs. Lines 49-53 handle `//` line comments. Lines 55-61 handle `/* */` block comments.
- **impact:** This prevents false positives from string literals that happen to contain claim keywords. The paragraph merge logic (lines 69-91) correctly groups adjacent `//` lines and treats block comments as separate paragraphs.

### 8-P6. `static-server.mjs` comprehensive CSP headers

- **files:** `scripts/static-server.mjs:27-37,73-78`
- **evidence:** Lines 27-37 define a strict CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. Lines 73-78 apply CSP, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store` on all 200 responses.
- **impact:** This CSP enforces the repo's "no inline scripts/styles" rule at the HTTP level, making CSP violations a runtime error. The additional security headers prevent MIME sniffing and caching.

### 8-P7. CI workflow faithful replication of verify contract

- **files:** `.github/workflows/ci.yml:24-40`
- **evidence:** Lines 24-40 run the same sequence as `npm run verify`: Format (format:check), Lint (lint), Unit tests (unit), Guardrails (guard), Playwright browsers (install), E2E tests (test:e2e). The order matches the verify script.
- **impact:** CI faithfully replicates the local verify gate, ensuring that what passes locally also passes in CI. The explicit steps (instead of a single `npm run verify`) provide better visibility into which step failed.

### 8-P8. Pre-commit hook fast gate

- **files:** `.githooks/pre-commit:1-8`
- **evidence:** Lines 5-8 run format:check → lint → unit → guard, skipping e2e. The comment at line 2 says "Fast pre-commit gate (~1.2s)".
- **impact:** The pre-commit hook catches most issues before commit, providing fast feedback. Skipping e2e is correct (e2e is slow and requires browser setup).

---

## Summary

The tooling is solid. All guards bite on realistic violations, CI faithfully replicates the verify contract, and the static server enforces CSP. The main findings are:

- **Medium:** `extract-session-metrics.mjs` lacks error handling for JSON.parse of opencode export (8-02)
- **Low:** `scripts/*.mjs` not covered by guard-file-size (8-01), `/tmp` hardcoded (8-03), CSP missing on error responses (8-04), const tokensReasoning code quality (8-05), guard-metrics 3-entry threshold now moot (8-06)

No Critical or High findings. The guards are well-designed, correctly implemented, and faithfully enforced in CI.
