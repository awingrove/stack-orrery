// guard-slices — factory-kit SLICES.md meta-rules, mechanically enforced
// against this repo's manifests. The role vocabulary below is this app's
// (static-JS flavor, kit examples/slices-static-js.yaml); the meta-rules
// themselves are factory-readable and identical everywhere:
//
//   1. every shipped file claimed exactly once (slice role or allowlist)
//   2. every manifest path/glob resolves — vacuous glob = fail
//   4. no dangling calls
//   5. entry_point chain, or `n/a (<reason>)`
//   6. story-map task ids and slice ids prefix-match bidirectionally
//   7. same-change: slice-feature edits without a manifest edit = fail
//      (needs --base <ref>; skipped locally with a notice)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from 'yaml';

const ROLE_VOCABULARY = ['pages', 'js', 'css', 'unit_tests', 'e2e_specs'];
const MANIFESTS = ['slices.yaml', 'storymap.yaml'];
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'test-results',
  'playwright-report',
  '.cache',
]);
const STORY_STATUSES = new Set(['planned', 'in-progress', 'done']);
const PRIORITIES = new Set(['high', 'medium', 'low']);

const errors = [];
const fail = (msg) => errors.push(msg);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative('.', full).split(sep).join('/'));
  }
  return out;
}

// Glob matcher for the manifest's only metacharacters: `*` and `**`.
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*');
  return new RegExp(`^${body}$`);
}

function loadYaml(file) {
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch (err) {
    fail(`${file}: unparseable — ${err.message}`);
    return null;
  }
}

const repoFiles = walk('.');
const slicesDoc = loadYaml('slices.yaml');
const storyDoc = loadYaml('storymap.yaml');

// --- manifest shape (required fields of the kit meta-grammar) -------------
const SLICE_FIELDS = ['id', 'name', 'roles', 'owns', 'calls', 'tests', 'entry_point'];
const slices = Array.isArray(slicesDoc?.slices) ? slicesDoc.slices : [];
if (!Array.isArray(slicesDoc?.slices)) fail('slices.yaml: `slices` must be a list.');
const allowlist = Array.isArray(slicesDoc?.allowlist) ? slicesDoc.allowlist : [];
if (!Array.isArray(slicesDoc?.allowlist)) {
  fail('slices.yaml: `allowlist` must be a list ([] if empty).');
}

const sliceIds = new Set();
const claims = new Map(); // file -> [claimant descriptions]

function claimFile(file, claimant) {
  if (!claims.has(file)) claims.set(file, []);
  claims.get(file).push(claimant);
}

function checkPattern(pattern, claimant) {
  if (typeof pattern !== 'string' || pattern === '') {
    fail(`${claimant}: empty/non-string path pattern.`);
    return;
  }
  const re = globToRegExp(pattern);
  const matches = repoFiles.filter((f) => re.test(f));
  if (matches.length === 0) {
    // meta-rule 2: path does not resolve / glob is vacuous
    fail(
      `${claimant}: pattern \`${pattern}\` matches no file — meta-rule 2 (every ref resolves, no vacuous globs).`,
    );
  }
  for (const f of matches) claimFile(f, claimant);
}

for (const slice of slices) {
  const id = typeof slice?.id === 'string' ? slice.id : '<no id>';
  for (const field of SLICE_FIELDS) {
    if (!(field in (slice ?? {}))) fail(`slice \`${id}\`: missing required field \`${field}\`.`);
  }
  if (sliceIds.has(id)) fail(`duplicate slice id \`${id}\`.`);
  sliceIds.add(id);

  if (typeof slice.roles !== 'object' || slice.roles === null || Array.isArray(slice.roles)) {
    fail(`slice \`${id}\`: \`roles\` must be a mapping of role -> path list.`);
  } else {
    for (const [role, patterns] of Object.entries(slice.roles)) {
      if (!ROLE_VOCABULARY.includes(role)) {
        fail(
          `slice \`${id}\`: unknown role \`${role}\` (vocabulary: ${ROLE_VOCABULARY.join(', ')}).`,
        );
        continue;
      }
      if (!Array.isArray(patterns)) {
        fail(
          `slice \`${id}\`: role \`${role}\` must be a list (declare [] when empty — an absent key was never reviewed).`,
        );
        continue;
      }
      // Empty list is legitimate (kit: declare [] for empty roles);
      // non-vacuity applies per-pattern, below.
      for (const p of patterns) checkPattern(p, `slice \`${id}\` role \`${role}\``);
    }
  }

  for (const field of ['owns', 'calls', 'tests']) {
    if (field in slice && !Array.isArray(slice[field])) {
      fail(`slice \`${id}\`: \`${field}\` must be a list.`);
    }
  }
  for (const dep of slice.calls ?? []) {
    // meta-rule 4
    if (!slices.some((s) => s?.id === dep)) {
      fail(`slice \`${id}\`: calls unknown slice \`${dep}\`.`);
    }
  }
  for (const t of slice.tests ?? []) {
    const keys = t && typeof t === 'object' ? Object.keys(t) : [];
    if (keys.length !== 1 || !['unit', 'e2e'].includes(keys[0])) {
      fail(
        `slice \`${id}\`: test ref \`${JSON.stringify(t)}\` must be a single-key unit:/e2e: mapping.`,
      );
    }
  }
  // meta-rule 5
  const ep = slice.entry_point;
  if (typeof ep !== 'string' || ep.trim() === '') {
    fail(`slice \`${id}\`: entry_point required (chain or \`n/a (<reason>)\`).`);
  } else if (/^n\/a/i.test(ep) && !/\(.+\)/.test(ep)) {
    fail(`slice \`${id}\`: \`n/a\` entry_point needs a parenthetical reason.`);
  }
}

// --- allowlist + claim resolution (meta-rules 1, 2) -----------------------
for (const p of allowlist) checkPattern(p, 'allowlist');

for (const [file, claimants] of claims) {
  if (claimants.length > 1) {
    fail(`double-claim: ${file} claimed by ${claimants.join(' + ')} (meta-rule 1).`);
  }
}
for (const f of repoFiles) {
  if (!claims.has(f)) {
    fail(`orphan: ${f} belongs to no slice role and no allowlist entry (meta-rule 1).`);
  }
}

// --- story map (meta-rule 6 + shape) --------------------------------------
const tasks = (storyDoc?.activities ?? []).flatMap((a) => a?.tasks ?? []);
if (!Array.isArray(storyDoc?.activities)) fail('storymap.yaml: `activities` must be a list.');
const taskIds = new Set();

for (const task of tasks) {
  const id = typeof task?.id === 'string' ? task.id : '<no id>';
  for (const field of ['id', 'name', 'entry_point', 'stories']) {
    if (!(field in (task ?? {}))) fail(`task \`${id}\`: missing required field \`${field}\`.`);
  }
  if (taskIds.has(id)) fail(`duplicate task id \`${id}\`.`);
  taskIds.add(id);

  const m = id.match(/^([A-Za-z][A-Za-z0-9]*)-\d+$/);
  if (!m) fail(`task \`${id}\`: id must be <SLICEID>-<n>.`);
  else if (!sliceIds.has(m[1])) {
    fail(`task \`${id}\`: prefix \`${m[1]}\` is not a declared slice id (meta-rule 6).`);
  }

  const ep = task.entry_point;
  if (typeof ep !== 'string' || ep.trim() === '') fail(`task \`${id}\`: entry_point required.`);
  else if (/^n\/a/i.test(ep) && !/\(.+\)/.test(ep)) {
    fail(`task \`${id}\`: \`n/a\` entry_point needs a parenthetical reason.`);
  }

  for (const story of task.stories ?? []) {
    const title = typeof story?.title === 'string' ? story.title : '<untitled>';
    if (typeof story?.title !== 'string' || !story.title)
      fail(`task \`${id}\`: story missing title.`);
    if (!STORY_STATUSES.has(story?.status)) {
      fail(
        `task \`${id}\` story \`${title}\`: status \`${story?.status}\` not in [${[...STORY_STATUSES].join(', ')}].`,
      );
    }
    if (!PRIORITIES.has(story?.priority)) {
      fail(
        `task \`${id}\` story \`${title}\`: priority \`${story?.priority}\` not in [${[...PRIORITIES].join(', ')}].`,
      );
    }
    for (const ref of story.tests ?? []) {
      const keys = ref && typeof ref === 'object' ? Object.keys(ref) : [];
      if (keys.length !== 1 || !['unit', 'e2e'].includes(keys[0])) {
        fail(`task \`${id}\` story \`${title}\`: test ref must be single-key unit:/e2e:.`);
      }
    }
  }
}

for (const sid of sliceIds) {
  // meta-rule 6, bidirectional
  if (!tasks.some((t) => typeof t?.id === 'string' && t.id.startsWith(`${sid}-`))) {
    fail(`slice \`${sid}\` has no story-map task (meta-rule 6: bidirectional id prefix).`);
  }
}

// --- meta-rule 7: same-change (needs --base) ------------------------------
const baseIdx = process.argv.indexOf('--base');
if (baseIdx !== -1 && process.argv[baseIdx + 1]) {
  const base = process.argv[baseIdx + 1];
  try {
    const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    const changed = execFileSync('git', ['diff', '--name-only', mergeBase, 'HEAD'], {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const manifestsTouched = changed.some((f) => MANIFESTS.includes(f));
    const touchedBySlice = changed.filter((f) => claims.get(f)?.some((c) => c.startsWith('slice')));
    if (touchedBySlice.length > 0 && !manifestsTouched) {
      fail(
        `same-change violation: slice-owned files changed (${touchedBySlice.slice(0, 5).join(', ')}${touchedBySlice.length > 5 ? ', …' : ''}) without touching ${MANIFESTS.join(' or ')} (meta-rule 7 — a stale map is a defect).`,
      );
    }
  } catch (err) {
    fail(`meta-rule 7: cannot diff against base \`${base}\` — ${err.message}`);
  }
} else {
  console.log('guard-slices: meta-rule 7 skipped (no --base) — runs on PR CI only.');
}

// -------------------------------------------------------------------------
if (errors.length > 0) {
  for (const e of errors) console.error(`guard-slices: ${e}`);
  console.error(`guard-slices: ${errors.length} violation(s).`);
  process.exit(1);
}
console.log(
  `guard-slices: OK (${slices.length} slices, ${tasks.length} tasks, ${repoFiles.length} repo files all claimed exactly once, no vacuous globs)`,
);
