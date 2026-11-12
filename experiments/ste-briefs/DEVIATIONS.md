# ste-brief-experiment — deviations from protocol

Recorded per protocol §3.7.

## 2026-11-10 — Phase 0

1. **Grouping reopens into one change.** Protocol §2 defines a Change as one
   piece of past work from one brief; the logs contain reopens and fallback
   re-executions on the same brief. Decision: all sessions on one brief file
   form one change; the reference diff is the full accepted diff
   (start..merged). No protocol text contradicts this, but the counting
   convention ("one change has one start commit and one reference diff") is
   interpretive for multi-session changes — the start commit is the FIRST
   session's snapshot.
2. **Excluded non-changes.** Code-review RESEARCHER sessions (10), qwen
   "Review chunk" sessions (10), gemini "Deep-dive" sessions (8), one
   "Double-check" session have no accepted reference diff and are not
   executor work on a brief; excluded from candidates.
3. **Stage 5 (C30) marked incomplete, not excluded.** §4.4 says exclude
   changes missing log items. The Antigravity executor session logs are not
   in the OpenCode DB; brief-as-received is missing, so C30 is excluded from
   selection unless the human supplies the Antigravity logs. Row kept in
   candidates.md for visibility.
4. **Merged-commit resolution is heuristic** (slug/token/bigram matching
   with a 36h window and docs-mention exclusion). Start commits are exact
   (git-tree snapshot → commit). Merged-commit anchors were spot-checked
   against the PR merges named in `slice-metrics.yaml` notes (C19→#33,
   C16→#26, C21→#35, C29→#41, C30→#9 all correct); the anchor defines the
   reference diff only — replay uses the start commit, never the merged one.
5. **Size thresholds chosen** (300/900 aggregate changed lines) — protocol
   §4.6 says use diff size and files touched but defines no thresholds.

## 2026-11-10 — Phase 1 (arms)

6. **Rewriter model substitution.** The protocol doesn't pin a rewriter model,
   only "different from the executor" (§5.3.2). `opencode-go/
gemini-4-argon-contributor` was planned but is not dispatchable; used
   `opencode-go/qwen3.7-plus` for the glm-executor changes (C07 C08 C09 C10
   C19) and `opencode-go/glm-5.3-flash` for the mimo-executor changes
   (C24 C27).
7. **Same rewriter model across arms B and C per change** — not required by
   §5.3, chosen so the B-vs-C comparison isolates the rules difference from
   rewriter-skill variance. Fidelity checkers differ from rewriters:
   glm-5.3-flash checks qwen rewrites; mimo-v2.6-flash checks glm rewrites.
8. **Fidelity checked against `requirements.md`** (§5.3.4 says confirm the
   rewrite carries the requirements and adds none). All 14 checks returned
   PASS with every requirement MET. Checkers flagged "new" items that are
   factual glosses present in arm A itself (file line counts, API shapes,
   the `.comp-tabs` lesson, `stage6-registry.js` in the lazy-lookup
   precedent) which `requirements.md` compressed — accepted, no rewrite
   round needed.
9. **C24 arm B ordering nuance accepted:** the fidelity check graded R3
   ("first action: tick Step 1") PARTLY — the rewrite orders the pre-read
   before the tick. Behaviorally immaterial (both happen before Step 2
   work); recorded here rather than burning a rewrite round.
10. **Arm A briefs are dispatch wrappers.** §5.2 keeps every other
    instruction file identical across arms; the committed brief file each
    wrapper points at (`docs/plans/<feature>.md`) is such a file and is
    present in the start commit. So the arm treatment applies to the
    orchestrator's dispatch text only — faithful to the protocol and keeps
    the replay self-contained via `git archive` of the start commit.
11. **Push instructions inside arm A briefs.** Several original briefs say
    "commit and push HERE". In replay (§7.1) the run repo has no remote, so
    push is impossible in every arm. The arms carry the requirement equally;
    deviations logged per run in Phase 2.

## 2026-11-12 — freeze-commit gate conflict (human ratification)

12. **Human ratification (option B, 2026-11-12).** The §5.4 freeze commit was
    rejected twice by repo guards whose fixes require editing existing repo
    files, which §3.3 forbids the agent: `guard-slices` (62 orphans —
    `experiments/**` not in the root `slices.yaml` allowlist) and
    `guard-plan-ticks` (the 270-line protocol doc exceeds the 120-line brief
    cap; the exemption set lives inside `scripts/guard-plan-ticks.mjs`).
    Reported to the human per the kit gate rule. The human chose option B:
    the agent applies both edits as a human-directed deviation. Edits made:
    (a) `slices.yaml` allowlist gains `experiments/**`; (b)
    `scripts/guard-plan-ticks.mjs` `LEGACY_LONG_BRIEFS` gains
    `docs/plans/ste-brief-experiment.md`. No guard weakened — both are
    scope extensions for experiment artifacts, recorded here and in the
    freeze commit message.
