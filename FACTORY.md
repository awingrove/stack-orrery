# stack-orrery — Factory

This repo is built by the factory. The process contract lives in
[factory-kit](https://github.com/awingrove/factory-kit) — this file only
names this app's instantiation: paths, gate command, stack rules. If the
two disagree, the kit wins and this file is fixed in the same change.

| Contract                            | Kit doc                                                                                   | This app's instance                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Process, DoD per slice, human gates | [FACTORY.md](https://github.com/awingrove/factory-kit/blob/main/FACTORY.md)               | this file                                              |
| Slice manifest grammar + meta-rules | [SLICES.md](https://github.com/awingrove/factory-kit/blob/main/SLICES.md)                 | `slices.yaml` (static-JS flavor, from the kit example) |
| Briefs, checkbox ticks, cold resume | [PLAN-FORMAT.md](https://github.com/awingrove/factory-kit/blob/main/PLAN-FORMAT.md)       | `docs/plans/`                                          |
| Debt register shapes                | [DEBT-REGISTER.md](https://github.com/awingrove/factory-kit/blob/main/DEBT-REGISTER.md)   | `docs/factory/technical-debt.yaml`                     |
| CHECKS / PINS / DOCUMENTS           | [CLAIM-LANGUAGE.md](https://github.com/awingrove/factory-kit/blob/main/CLAIM-LANGUAGE.md) | guarantee-comments in `js/**`, `test/**`, `e2e/**`     |
| The testing line                    | [TEST-RULES.md](https://github.com/awingrove/factory-kit/blob/main/TEST-RULES.md)         | `e2e/**` against the real static server                |
| Design contract format              | [DESIGN.md](https://github.com/awingrove/factory-kit/blob/main/DESIGN.md)                 | `DESIGN.md` (dark-canvas orrery tokens + rules)        |

## App specifics

- **Story map:** `storymap.yaml` — stages are activities, named after the
  system-design primer's scaling ladder (Stage 1 single server shipped;
  Stage 2+ = LB/duplicated servers → cache → DB/replication → queue →
  CDN/failures).
- **The named gate:** `npm run verify` — format:check → lint → unit →
  guard → e2e. CI job `build` runs the same five steps; the ruleset
  `build-must-pass` requires the `build` check (strict/up-to-date).
- **Guardrails** (own scripts, kit-derived examples):
  `scripts/guard-plan-ticks.mjs` (ticks evidence files),
  `guard-debt.mjs` (register schema), `guard-slices.mjs` (manifest
  meta-rules + file claims), `guard-story-refs.mjs` (test refs resolve),
  `guard-file-size.mjs` (300-line split trigger), `guard-claims.mjs`
  (strict `CHECKS` / `PINS` / `DOCUMENTS` claim vocabulary) — run together
  by `npm run guard`.
- **Human gates & rulesets:** per kit — design-before-code, PR approve +
  merge, plan-mandated findings. Server-side: `human-gates-main`
  (PR + approval, no force-push/delete on main), `agent-cannot-touch-anything`
  (no delete/force-push anywhere), `build-must-pass` — bypass = human only.
