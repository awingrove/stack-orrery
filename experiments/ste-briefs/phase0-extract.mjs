// Phase 0 extraction harness — ste-brief-experiment
// Reads OpenCode session DB + repo git history, emits candidates.md + candidates.json
// Run: node experiments/ste-briefs/phase0-extract.mjs
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

/* global process, console */

const HOME = process.env.HOME;
const DB_PATH = HOME + '/.local/share/opencode/opencode.db';
const REPO = '/home/awingrove/repos/stack-orrery/stack-orrery';
const OUT_DIR = REPO + '/experiments/ste-briefs';

const db = new DatabaseSync(DB_PATH, { readOnly: true });

// Extraction frozen at the Phase-0 window: sessions dispatched later (the
// experiment's own rewriter/checker/executor sessions) must never enter
// candidates. 1794400000000 ms = 2026-11-10T00:00Z, before any Phase-1
// session existed and after every original repo session.
const PHASE0_CUTOFF_MS = 1794400000000;

// ---------- sessions ----------
const sessions = db
  .prepare(
    `SELECT id, parent_id, agent, model, title, time_created, time_updated,
            cost, tokens_input, tokens_output, tokens_reasoning,
            summary_additions, summary_deletions, summary_files
     FROM session_v2
     WHERE (directory LIKE '%stack-orrery%' OR path LIKE '%stack-orrery%')
       AND time_created < ${PHASE0_CUTOFF_MS}
     ORDER BY time_created`,
  )
  .all();

const subagentSessions = sessions.filter((s) => s.parent_id && s.agent !== 'build');

// exclude review/analysis sessions — not brief-execution changes
const excludeTitle = /review chunk|deep-dive|double-check|status report|brief chunk/i;
const excludeAgent = /qwen/;
const excludeResearcher = /code-review RESEARCHER/;

function firstUserText(sid) {
  const row = db
    .prepare(
      `SELECT data FROM session_message WHERE session_id = ? AND type = 'user'
       ORDER BY seq LIMIT 1`,
    )
    .get(sid);
  if (!row) return null;
  return JSON.parse(row.data).text ?? null;
}

function assistantMsgs(sid) {
  return db
    .prepare(
      `SELECT data FROM session_message WHERE session_id = ? AND type = 'assistant'
       ORDER BY seq`,
    )
    .all(sid)
    .map((r) => JSON.parse(r.data));
}

function readTargets(sid) {
  const targets = new Set();
  for (const m of assistantMsgs(sid)) {
    for (const c of m.content ?? []) {
      if (c.type !== 'tool' || c.name !== 'read') continue;
      const p = c.state?.input?.path ?? '';
      if (/(AGENTS\.md|FACTORY\.md|DESIGN\.md|docs\/plans\/)/.test(p)) {
        targets.add(p.replace(/^.*stack-orrery\/stack-orrery\//, ''));
      }
    }
  }
  return [...targets].sort();
}

// snapshot.start tree -> actual commit
const commitTrees = execFileSync('git', ['log', '--all', '--format=%H %T %ct'], {
  cwd: REPO,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString()
  .split('\n')
  .map((l) => l.split(' '))
  .filter((p) => p.length === 3);

function treeToCommit(tree, beforeMs) {
  const matches = commitTrees.filter((p) => p[1] === tree && Number(p[2]) * 1000 <= beforeMs);
  if (!matches.length) return null;
  return matches[matches.length - 1][0];
}

function snapshotStart(sid) {
  const msgs = assistantMsgs(sid);
  for (const m of msgs) {
    const t = m.snapshot?.start;
    if (t) return t;
  }
  return null;
}

// merged-commit search: grep commit subjects for brief slug
const commitSubjects = execFileSync('git', ['log', '--all', '--format=%H %ct %s'], {
  cwd: REPO,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString()
  .split('\n')
  .map((l) => {
    const [h, ct, ...rest] = l.split(' ');
    return { hash: h, time: Number(ct) * 1000, rest: rest.join(' ') };
  });

function findMergedCommit(slug, afterMs) {
  // slug e.g. "b6d-primary-down", "stage3-cache", "r1a-stage6-lb-hop-unification"
  // Prefer: full slug → leading code token ("b6d", "r2b", "stage6a") →
  // slug bigrams → single segments. Anchor = newest hit within 36h of the
  // change window (stops the anchor drifting onto later slices' commits).
  const esc = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const windowEnd = afterMs + 36 * 3600 * 1000;
  const candidates = commitSubjects.filter((c) => c.time >= afterMs && c.time <= windowEnd);
  const patterns = [new RegExp(esc, 'i')];
  const token = slug.split('-')[0];
  if (/^(b\d+[a-z]?|r\d+[a-z]?|stage\d+[a-z]?)$/.test(token)) {
    patterns.unshift(new RegExp('(^|[^a-z0-9])' + token + '([^a-z0-9]|$)', 'i'));
  }
  for (let i = 0; i < slug.split('-').length - 1; i++) {
    const bigram = slug
      .split('-')
      .slice(i, i + 2)
      .join('-');
    if (bigram.length >= 8)
      patterns.push(new RegExp(bigram.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
  for (const re of patterns) {
    const hits = candidates.filter((c) => re.test(c.rest));
    if (!hits.length) continue;
    // Prefer the branch-merge commit for this change; else the newest work
    // commit (exclude docs(*) mentions — step-3 ledger notes reference other
    // batches' codes and would drift the anchor past the PR).
    const mergeHit = hits.find((c) => /Merge pull request/.test(c.rest));
    const workHit = hits.find((c) => !/^docs\(/.test(c.rest.trimStart()));
    return (mergeHit ?? workHit ?? hits[0]).hash;
  }
  return null;
}

// start-commit fallback: session snapshot tree unresolved (dirty working
// tree). Approximate from the first work commit after the session start:
// its first parent is the committed state the executor built on.
function startCommitFallback(slug, afterMs) {
  const workCommit = findMergedCommit(slug, afterMs);
  if (!workCommit) return null;
  try {
    const parent = execFileSync('git', ['rev-parse', workCommit + '^'], {
      cwd: REPO,
    })
      .toString()
      .trim();
    return parent;
  } catch {
    return null;
  }
}

// ---------- metrics ----------
const metricsRaw = readFileSync(REPO + '/docs/factory/slice-metrics.yaml', 'utf8');
const metricsEntries = [];
for (const chunk of metricsRaw.split('\n  - id: ').slice(1)) {
  const e = {};
  e.id = chunk.split('\n')[0].trim();
  const m = (re) => {
    const r = chunk.match(re);
    return r ? r[1].trim() : null;
  };
  e.brief = m(/^ {4}brief: (.+)$/m);
  e.agent_model = m(/^ {4}agent_model: (.+)$/m);
  // session_id may be a plain scalar or a ">-" block of session ids + prose
  const sidBlock = chunk.match(/^ {4}session_id: (.*)\n((?:[ \t]+[^\n]*\n)*)/m);
  if (sidBlock) {
    const joined = (sidBlock[1] + '\n' + sidBlock[2])
      .replace(/\n[ \t]+/g, ' ')
      .trim()
      .replace(/^->?\s*/, '');
    e.session_id = joined;
  }
  e.human_interventions = Number(m(/^ {4}human_interventions: (.+)$/m));
  e.agent_review_rounds = Number(m(/^ {4}agent_review_rounds: (.+)$/m));
  e.guardrail_failures = Number(m(/^ {4}guardrail_failures: (.+)$/m));
  e.fix_commits = Number(m(/^ {4}fix_commits: (.+)$/m));
  e.defects_escaped = Number(m(/^ {4}defects_escaped: (.+)$/m));
  const nm = chunk.match(/^ {4}notes: >-\n([\s\S]*?)(?=\n {2}- id: |\n\S|$)/);
  e.notes = nm
    ? nm[1]
        .replace(/\n {6}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  metricsEntries.push(e);
}

// ---------- group sessions into changes (by brief file) ----------
const changes = new Map();

for (const s of subagentSessions) {
  if (excludeTitle.test(s.title) || excludeAgent.test(s.model ?? '')) continue;
  const briefText0 = firstUserText(s.id);
  if (excludeResearcher.test(briefText0 ?? '')) continue;
  const briefText = briefText0;
  const model = s.model ? JSON.parse(s.model) : null;
  const tree = snapshotStart(s.id);
  const startCommit = tree ? treeToCommit(tree, s.time_created) : null;
  const reads = readTargets(s.id);
  const briefFile =
    (briefText.match(/docs\/plans\/[\w./-]+\.md/) ?? [null])[0] ??
    reads.find((r) => /^docs\/plans\//.test(r)) ??
    null;

  const key = briefFile ?? 'prompt-only:' + s.title.slice(0, 30);
  if (!changes.has(key)) {
    changes.set(key, {
      change_id: null,
      brief_file: briefFile,
      brief_text: briefText,
      sessions: [],
      metrics: [],
      instruction_files: null,
      start_commit: null,
      merged_commit: null,
    });
  }
  const ch = changes.get(key);
  ch.sessions.push({
    session_id: s.id,
    agent: s.agent,
    model: model ? model.providerID + '/' + model.id : null,
    title: s.title,
    time_created: s.time_created,
    tokens_input: s.tokens_input,
    tokens_output: s.tokens_output,
    tokens_reasoning: s.tokens_reasoning,
    cost: s.cost,
    summary_additions: s.summary_additions,
    summary_deletions: s.summary_deletions,
    summary_files: s.summary_files,
    start_commit: startCommit,
    instruction_reads: reads,
  });

  // metrics rows matching this session id (ledger ids may carry prose and
  // multiple ids in a ">-" block — extract the ses_ tokens and match any)
  for (const me of metricsEntries) {
    const toks = (me.session_id ?? '').match(/ses_[a-z0-9]+/g) ?? [];
    if (toks.some((t) => s.id.startsWith(t.slice(0, 16)))) {
      ch.metrics.push(me);
    }
  }
}

// resolve per-change start commit (earliest session's snapshot commit),
// merged commit, and instruction file list
for (const ch of changes.values()) {
  ch.sessions.sort((a, b) => a.time_created - b.time_created);
  ch.start_commit = ch.sessions.find((s) => s.start_commit)?.start_commit ?? null;
  const slug = (ch.brief_file?.match(/([\w-]+)\.md$/)?.[1] ?? ch.change_id ?? '').replace(
    /^\d{4}-\d{2}-\d{2}-/,
    '',
  );
  const firstSession = ch.sessions[0];
  if (slug && firstSession) {
    ch.merged_commit = findMergedCommit(slug, firstSession.time_created);
    if (!ch.start_commit && ch.merged_commit) {
      ch.start_commit = startCommitFallback(slug, firstSession.time_created);
      ch.start_commit_approx = true;
    }
  }
  const allReads = new Set();
  for (const s of ch.sessions) for (const r of s.instruction_reads) allReads.add(r);
  ch.instruction_files = [...allReads].sort();
  ch.outcome = ch.metrics.length
    ? {
        human_interventions: Math.max(...ch.metrics.map((m) => m.human_interventions || 0)),
        review_rounds: Math.max(...ch.metrics.map((m) => m.agent_review_rounds || 0)),
        guardrail_failures: Math.max(...ch.metrics.map((m) => m.guardrail_failures || 0)),
        fix_commits: Math.max(...ch.metrics.map((m) => m.fix_commits || 0)),
        defects_escaped: Math.max(...ch.metrics.map((m) => m.defects_escaped || 0)),
        executor_models: [...new Set(ch.metrics.map((m) => m.agent_model))],
      }
    : null;
  ch.difficult =
    (ch.outcome?.human_interventions ?? 0) > 0 ||
    (ch.outcome?.fix_commits ?? 0) > 0 ||
    (ch.outcome?.defects_escaped ?? 0) > 0;
  // completeness per protocol 4.4
  const missing = [];
  if (!ch.brief_text) missing.push('brief');
  if (!ch.start_commit) missing.push('start_commit');
  if (!ch.merged_commit) missing.push('merged_commit');
  if (!ch.instruction_files.length) missing.push('instruction_files');
  if (!ch.outcome) missing.push('outcome_data');
  ch.incomplete = missing;
}

const list = [...changes.values()];

// STAGE-5 manual row: executor ran on Antigravity (flash_lite), not OpenCode —
// its session logs are Electron/LevelDB storage, so brief-as-received is not
// recoverable from this DB. Everything else comes from git + slice-metrics.
{
  const metrics = metricsEntries.find((m) => m.id === 'STAGE-5');
  list.push({
    change_id: null,
    brief_file: 'docs/plans/2026-10-21-stage5-worker-queue.md',
    brief_text: null,
    sessions: [
      {
        session_id: '433cff5a-d8b4-4ef7-ac14-558974b8fe6e (Antigravity, not OpenCode)',
        agent: 'antigravity',
        model: 'antigravity/flash_lite',
        title: 'Stage 5 worker queue (Antigravity executor)',
        start_commit: null,
        instruction_reads: [],
      },
    ],
    metrics: metrics ? [metrics] : [],
    instruction_files: [],
    start_commit: 'a94b094',
    merged_commit: '44d5b55',
    outcome: metrics
      ? {
          human_interventions: metrics.human_interventions,
          review_rounds: metrics.agent_review_rounds,
          guardrail_failures: metrics.guardrail_failures,
          fix_commits: metrics.fix_commits,
          defects_escaped: metrics.defects_escaped,
          executor_models: [metrics.agent_model],
        }
      : null,
    difficult: true,
    incomplete: ['brief_as_received (Antigravity executor — session logs not in OpenCode DB)'],
  });
}

list.forEach((c, i) => (c.change_id = 'C' + String(i + 1).padStart(2, '0')));

// ---------- size labels from merged-commit diff ----------
for (const ch of list) {
  if (!ch.start_commit || !ch.merged_commit || ch.start_commit === ch.merged_commit) continue;
  try {
    const stat = execFileSync(
      'git',
      [
        'diff',
        '--shortstat',
        ch.start_commit + '..' + ch.merged_commit,
        '--',
        '.',
        ':(exclude)docs/plans/*',
        ':(exclude)docs/factory/*',
        ':(exclude)experiments/*',
      ],
      { cwd: REPO },
    ).toString();
    ch.diff_stat = stat.trim();
    const files = Number(stat.match(/(\d+) files? changed/)?.[1] ?? 0);
    const ins = Number(stat.match(/(\d+) insertions?\(/)?.[1] ?? 0);
    const del = Number(stat.match(/(\d+) deletions?\(/)?.[1] ?? 0);
    const size = files + ins + del;
    ch.size_label = size < 300 ? 'small' : size < 900 ? 'medium' : 'large';
  } catch {
    ch.diff_stat = 'unresolvable';
  }
}

// ---------- write outputs ----------
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_DIR + '/candidates.json', JSON.stringify(list, null, 2));

const rows = list
  .map((c) => {
    const size = c.size_label ?? '?';
    const diff = c.difficult ? 'HARD' : 'smooth';
    const inc = c.incomplete.length ? 'INCOMPLETE:' + c.incomplete.join(',') : 'ok';
    return `| ${c.change_id} | ${c.brief_file ?? 'prompt-only'} | ${
      c.outcome?.executor_models?.join(', ') ??
      [...new Set(c.sessions.map((s) => s.model))].join(', ')
    } | ${c.start_commit ?? '?'} | ${c.merged_commit ?? '?'} | ${size} | ${diff} | ${
      c.outcome
        ? `int=${c.outcome.human_interventions} rr=${c.outcome.review_rounds} gf=${c.outcome.guardrail_failures} fc=${c.outcome.fix_commits}`
        : '?'
    } | ${c.sessions.length} | ${inc} |`;
  })
  .join('\n');

const md = `# ste-brief-experiment — Phase 0 candidates

Generated by \`experiments/ste-briefs/phase0-extract.mjs\` from the OpenCode
session DB (\`~/.local/share/opencode/opencode.db\`) + repo git history.
Full data: \`candidates.json\`.

A "change" = one brief (grouped by \`docs/plans/<feature>.md\` or the prompt-only
title). Sessions sharing one brief (base run, reopens, re-executions) are one
change. Review/deep-dive sessions are not changes.

## Table

| id | brief | executor model(s) | start commit | merged commit | size | difficulty | outcome (int/rr/gf/fc) | sessions | completeness |
|----|-------|-------------------|--------------|---------------|------|------------|------------------------|----------|--------------|
${rows}

## Notes

- **start commit** resolved from the session's recorded git-tree snapshot
  (\`snapshot.start\` → commit with matching tree).
- **merged commit** = last commit on any ref whose subject matches the brief
  slug, after the first session start. Squash/PR-title mismatches may need
  human correction — flagged INCOMPLETE:merged_commit when not found.
- **size** from \`git diff --shortstat start..merged\` excluding
  \`docs/plans\`, \`docs/factory\`, \`experiments\` (thresholds 300/900).
- **difficulty HARD** = any of human_interventions, fix_commits,
  defects_escaped > 0 in \`slice-metrics.yaml\`.
- **outcome** columns: int=human interventions, rr=agent review rounds,
  gf=guardrail failures, fc=fix commits.
- Executor-model variance across changes is expected and out of scope for
  arms (protocol §12): the experiment replays each change with its own
  recorded executor.
`;
writeFileSync(OUT_DIR + '/candidates.md', md);
console.log('changes:', list.length);
for (const c of list)
  console.log(
    c.change_id,
    c.brief_file ?? 'prompt-only',
    '| sessions:',
    c.sessions.length,
    '| size:',
    c.size_label ?? '?',
    '| inc:',
    c.incomplete.join(',') || 'ok',
  );
