# AI Agent Instructions (AGENTS.md)

Factory app repo: the process contract lives in
[factory-kit](https://github.com/awingrove/factory-kit) — this file holds
the stack rules and directives specific to this repo. If this file and the
kit disagree, that is a defect: report it, don't pick a side.

**Response style:** smart caveman — cut filler, keep technical substance.
Fragments fine. Technical terms stay exact; code blocks unchanged.

## Stack rules (static JS)

- **Zero runtime dependencies.** Browser code is vanilla ESM
  (`<script type="module">`); devDeps only (eslint, prettier, vitest,
  @playwright/test, yaml). No framework, no bundler, no build step.
- **No inline handlers, inline scripts, or inline styles.** The static
  server sends `script-src 'self'; style-src 'self'` — an inline-script
  temptation is a defect to report, not a CSP to relax. Wire behavior with
  `addEventListener` in external JS.
- **External JS lives under `js/` only**, one directory per slice
  (`js/sim/**`, `js/panel/**`); CSS under `css/` per slice. Pages reference
  them with relative paths.
- **Serving:** `node scripts/static-server.mjs --port <port>` (Playwright's
  `webServer` runs it for e2e). A manual peek may use any static server;
  the gate is always the node script — it carries the CSP headers.
- **File size:** production modules (`js/**`, `css/**`) over **300 lines**,
  test suites (`test/**`, `e2e/**`) over **450 lines**, or static HTML pages
  (`*.html`) over **550 lines** fail `scripts/guard-file-size.mjs`. Split by
  responsibility — in JS that means new modules, not partials.
- **Determinism:** `js/sim/**` never calls `Math.random()` or `Date.now()`.
  Seeded RNG only (`js/sim/rng.js`); time advances by explicit tick. This
  is what makes overload teachable and e2e assertions stable.

## Modeling rules (executable conceptual model)

- **Executable conceptual model, not a statistical simulator.** Each stack
  component (`Browser`, `Network`, `WebServer`, and later `DNS`,
  `LoadBalancer`, `Cache`, `Database`, `WorkerQueue`, `Router`/`Bridge`)
  must be a small, directly readable JS implementation of its real
  responsibility, exchanging recognisable messages through the tick loop.
  Never fake a component's mechanism with probabilities (e.g. a cache hit
  must be an actual `Map` lookup on the request path with tick-based TTL,
  never `rng() < hitRate`). Trace and UI narratives are part of that
  contract: hop text and frames must consume the components' actual
  messages (the served record, queue state), not a hardcoded story
  (DL-1, DL-3, DL-4).
- **Slimmed-down protocols.** Every token on the wire must earn its
  teaching place. HTTP requests are `"GET /path"` (no `HTTP/1.1` or `\r\n`
  header boilerplate unless a stage specifically teaches headers);
  responses are `"<status> <body>"` (e.g. `"200 Welcome to the home page"`,
  `"404 Page not found"`).
- **Two-number mini-IP addresses (`<net>.<host>`).** Network addresses use
  two numbers — network and interface (e.g. `10.1`, `10.2`, `20.1`) —
  instead of 4-octet dotted quads. Stage 1 starts IP-only (`Browser` sends
  to `10.1` over `Network`); `DNS` (`example.com` → `10.x`) and cross-network
  routing/bridges (`10.x` ↔ `20.x`) enter only in the stages where they
  earn their teaching place.

## AI workflow directives

1. **Understand context** before modifying a file: pages → `js/panel` →
   `js/sim`; a change ripples outward, not downward.
2. **Resumable boundary briefs (≤ 120 lines) & sub-agent execution:** work
   beyond ~3 tasks gets a committed brief at `docs/plans/<feature>.md` with
   checkbox steps; a tick means the step's commit exists (kit PLAN-FORMAT).
   - **No ghost-coding in briefs:** keep briefs **≤ 120 lines** (enforced by
     `scripts/guard-plan-ticks.mjs`). The lead session reads only the files
     needed to frame the design gate and specifies **boundary contracts only**
     (module exports, option/snapshot shapes, ring/node IDs, DOM
     `data-testid`s, and test titles) — never line-by-line helper code.
   - **Negative-case contracts (DL-3/DL-4):** any boundary contract whose
     behavior conditions on input — trace narratives, component responses,
     lane geometry, routing — must state the mechanism's branch conditions
     with one named counter-example ("a GET trace keeps the Stage 4 story;
     no async 202"), and §Tests must pin it. A contract written only as the
     happy-path script is a Step-1 defect: the executor cannot read intent
     the brief does not encode.
   - **3-step brief lifecycle:**
     - **Step 1 (Lead session):** after human design sign-off, commit
       `DESIGN.md` + `docs/plans/<feature>.md` (with Step 1 ticked `- [x]`,
       Steps 2–3 unticked `- [ ]`).
     - **Step 2 (`executor` sub-agent):** dispatch `subagent` with
       `agent: "executor"` on the model pinned in `.opencode/agents/executor.md`
       (executing on any other model is a process deviation to record) to
       implement the code, tests, and `slices.yaml` / `storymap.yaml` updates
       cold from the brief, tick `- [x] Step 2`, and commit with
       `npm run verify` green.
     - **Step 3 (Lead session):** run
       `npm run metrics:extract -- <subagentSessionID>`, append the entry
       (including true in-session `guardrail_failures`) to
       `docs/factory/slice-metrics.yaml`, tick `- [x] Step 3` in the brief,
       and commit with `npm run verify` green. The lead review also checks
       brief-contract tests exist (brief §Tests, including the negative-case
       pins) and that storymap/slices test refs pin the story's own behavior —
       a story marked done whose refs name stale or unrelated tests is a
       defect (DL-3). **Acceptance probe:** before opening the PR, the lead
       demos the slice end to end from the brief's contracts — scripted e2e
       counts — walking each boundary contract including its named counter-
       example; the probe reopens Step 2 on failure. Human screenshot rounds
       found DL-1 and DL-3 because this probe did not exist (DL-2 rule: what
       you do not demo, the human discovers).
3. **Debug hygiene:** temporary probes are tracked as todos and removed
   before commit — never ride along in a feature diff.
4. **Post-mortem, human-intervention & metrics capture:** a fix — or an
   unprompted human intervention correcting a code or process miss outside
   scheduled human gates — whose root cause reveals a systemic gap updates
   `docs/factory/technical-debt.yaml` (`DL-\d+`) and the rule doc in the same
   change (kit DEBT-REGISTER). Every completed brief records its intervention
   counts and sub-agent session telemetry (`opencode session export <id>`) in
   `docs/factory/slice-metrics.yaml` (kit METRICS).
5. **Claim vocabulary:** guarantee-comments carry `CHECKS:` / `PINS:` /
   `DOCUMENTS:` — guarantee-language outside a claim is a review defect
   (kit CLAIM-LANGUAGE). A `PINS:` claim must name a real, resolvable pin
   (`test file::title` that exists) or be omitted — an aspirational pin is
   a defect (TD-6).
6. **Manifests same-change:** `slices.yaml` + `storymap.yaml` change in the
   same commit as the feature they describe; a stale map is a defect
   (kit SLICES).
7. **Design:** UI that introduces or alters a visual pattern raises the
   `DESIGN.md` amendment question with the human and updates `DESIGN.md` in
   the same change (kit DESIGN + DESIGN-REVIEW patterns).

## Gates

- `npm run verify` = format:check → lint → unit → guard → e2e. It is the
  **named** gate; never reimplement it ad hoc at the call site.
- **Red gate = stop**, fix the named cause. Second rejection of the same
  gate = stop and report to the human. Never weaken a guardrail, test, or
  manifest entry to pass (kit FACTORY gate-rejection rule).

## GitHub identity

Shells authenticate as `awingrove-opencode` via
`.opencode/plugins/agent-identity.js` (token file + isolated `GH_CONFIG_DIR`,
fail-closed sentinel). Runbook:
[factory-kit AGENT-IDENTITY.md](https://github.com/awingrove/factory-kit/blob/main/AGENT-IDENTITY.md).
Agents push feature branches and open PRs — never approve, merge, delete,
or force-push (server-side rulesets, human-only bypass). Closing the agent's
own PRs is permitted.

## PR handling (user-directed, 2026-10-26)

- **Reviewer assignment:** every PR the agent opens requests `awingrove` as
  a reviewer at creation time. The agent token has `repo` scope only, so
  `gh pr edit --add-reviewer` fails on GraphQL `read:org`; use the REST call
  instead (this is how PR #21's review was requested):
  `gh api repos/awingrove/stack-orrery/pulls/<n>/requested_reviewers -X POST -f 'reviewers[]=awingrove'`
- **Fixes ride open PRs:** while one of our PRs is still open, fixes to code
  in its scope land on its branch in a follow-up commit (full `npm run verify`
  green before the commit, same as any commit), not as a separate PR. A
  separate PR is warranted only when the fix is unrelated to the open PR's
  content.
