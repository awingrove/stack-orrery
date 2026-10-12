# stack-orrery Phase 1 — factory bootstrap

**For agentic workers:** the factory-kit specs bind every task below — read
them before their step: <https://github.com/awingrove/factory-kit/blob/main/>
(FACTORY, SLICES, PLAN-FORMAT, DEBT-REGISTER, CLAIM-LANGUAGE, TEST-RULES).

## Hard rules

- **Zero runtime dependencies.** Browser code is vanilla ESM; devDeps only
  (eslint, prettier, vitest, @playwright/test, yaml).
- **Determinism.** `js/sim/**` never calls `Math.random()` or `Date.now()`
  — seeded RNG only, ticks advance explicitly. This is what makes e2e
  assertions stable.
- **No inline handlers/scripts/styles.** CSP shape; external JS under `js/`
  only, wire behavior with `addEventListener`.
- **Manifests same-change.** `slices.yaml` + `storymap.yaml` change in the
  same commit as slice features; every shipped file is claimed by a slice
  role or the allowlist (kit SLICES meta-rules, `scripts/guard-slices.mjs`).
- **Guarantee-comments carry CHECKS/PINS/DOCUMENTS.** Never weaken a guard,
  test, or manifest entry to make a gate pass.

## Steps

- [ ] **Step 1: Bootstrap the brief** — this file committed at
  `docs/plans/2026-10-12-phase1-bootstrap.md`.
- [ ] **Step 2: Factory layer** — `AGENTS.md`, `FACTORY.md`, `README.md`,
  `slices.yaml`, `storymap.yaml`, `docs/factory/technical-debt.yaml`,
  `.gitignore`, `.opencode/` (identity plugin) committed.
  Verify: `git status` clean.
- [ ] **Step 3: Tooling scaffold** — `package.json` (+lock), `.prettierrc`,
  `.prettierignore`, `eslint.config.js`, `vitest.config.js`,
  `playwright.config.js`, `scripts/static-server.mjs` (CSP headers),
  `.github/workflows/ci.yml` (single job **`build`** — required check
  context: format:check → lint → unit → guard → e2e).
  Verify: `npx prettier --check . && npx eslint .` clean; server smoke
  serves `index.html` with CSP.
- [ ] **Step 4: Guardrail scripts** — `scripts/guard-plan-ticks.mjs`,
  `guard-debt.mjs`, `guard-slices.mjs`, `guard-story-refs.mjs`,
  `guard-file-size.mjs`, `guard-all.mjs` (kit-derived, own copies).
  Verify: `npm run guard` green once Step 5 lands; each guard observed red
  once on a mutated input (recorded below), reverted.
- [ ] **Step 5: Tracer bullet — first slice** — `index.html`, `panel.html`,
  `css/shell/**`, `css/panel/**`, `js/sim/**` (rng, webserver, users,
  engine — discrete tick loop), `js/panel/**` (model + render),
  `test/sim/**`, `test/panel/**`, `e2e/shell.spec.js`, `e2e/panel.spec.js`.
  Verify: `npm run unit && npm run test:e2e` green.
- [ ] **Step 6: Flip the map** — storymap story statuses to `done`, plan
  ticks recorded, `slices.yaml`/`storymap.yaml` consistent with what shipped.
  Verify: `npm run guard` green; `git status` clean.
- [ ] **Step 7: Full gate** — `npm run verify` green end-to-end
  (format:check → lint → unit → guard → e2e).
- [ ] **Step 8: Ship** — push `feature/phase1-bootstrap`, open PR.
  Verify: CI job `build` green on the PR; report ready for human merge.

## Negative-path proofs (guardrail discipline, kit TEST-RULES)

_Filled in at Step 4: each guard's observed-red mutation and revert._
