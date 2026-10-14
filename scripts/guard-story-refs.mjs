// guard-story-refs — kit SLICES.md meta-rule 3: every `tests:` ref resolves.
//   unit: <path>::<fragment> — path exists, lies under some slice's
//         unit_tests role, and the fragment appears verbatim in the file.
//   e2e:  <spec-stem>::<fragment> — a spec named <stem>.spec.js exists
//         under some slice's e2e_specs role, and the fragment appears
//         verbatim in it (kit TEST-RULES: fragments are addressed by
//         storymap refs and must appear in the file).
// Refs are collected from BOTH manifests: slices.yaml and storymap.yaml.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse } from 'yaml';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'test-results',
  'playwright-report',
  '.cache',
]);

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

function globToRegExp(glob) {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body = escaped.replace(/\*\*/g, ' ').replace(/\*/g, '[^/]*').replace(/ /g, '.*');
  return new RegExp(`^${body}$`);
}

const repoFiles = walk('.');
const slices = parse(readFileSync('slices.yaml', 'utf8'))?.slices ?? [];
const storymap = parse(readFileSync('storymap.yaml', 'utf8'));

const unitRolePatterns = slices.flatMap((s) => s?.roles?.unit_tests ?? []);
const e2eRolePatterns = slices.flatMap((s) => s?.roles?.e2e_specs ?? []);

const refs = [];
for (const slice of slices) {
  for (const t of slice?.tests ?? [])
    refs.push({ where: `slices.yaml slice \`${slice.id}\``, ...refOf(t) });
}
for (const activity of storymap?.activities ?? []) {
  for (const task of activity?.tasks ?? []) {
    for (const story of task?.stories ?? []) {
      for (const t of story?.tests ?? [])
        refs.push({ where: `storymap task \`${task.id}\``, ...refOf(t) });
    }
  }
}

function refOf(t) {
  const key = t && typeof t === 'object' ? Object.keys(t)[0] : undefined;
  return { kind: key, value: key ? String(t[key]) : '' };
}

function underRole(value, patterns) {
  return patterns.some((p) => globToRegExp(p).test(value));
}

if (refs.length === 0) {
  fail('no test refs found in either manifest — empty selection tests nothing (non-vacuity).');
}

let checkedUnit = 0;
let checkedE2e = 0;

for (const { where, kind, value } of refs) {
  if (!['unit', 'e2e'].includes(kind)) {
    fail(`${where}: ref \`${JSON.stringify(value)}\` is not unit:/e2e:.`);
    continue;
  }
  const [target, ...fragmentParts] = value.split('::');
  const fragment = fragmentParts.join('::');
  if (!target || !fragment) {
    fail(`${where}: ref \`${value}\` must be \`<target>::<title fragment>\`.`);
    continue;
  }

  if (kind === 'unit') {
    checkedUnit++;
    if (!repoFiles.includes(target)) {
      fail(`${where}: unit file \`${target}\` does not exist.`);
      continue;
    }
    if (!underRole(target, unitRolePatterns)) {
      fail(`${where}: unit file \`${target}\` is not under any slice's unit_tests role.`);
    }
    if (!readFileSync(target, 'utf8').includes(fragment)) {
      fail(`${where}: fragment \`${fragment}\` not found in \`${target}\`.`);
    }
  } else {
    checkedE2e++;
    const candidates = repoFiles.filter(
      (f) =>
        f.endsWith(`/${target}.spec.js`) ||
        f === `e2e/${target}.spec.js` ||
        f === `${target}.spec.js`,
    );
    if (candidates.length === 0) {
      fail(`${where}: no spec file \`${target}.spec.js\` found under e2e/.`);
      continue;
    }
    const spec = candidates[0];
    if (!underRole(spec, e2eRolePatterns)) {
      fail(`${where}: spec \`${spec}\` is not under any slice's e2e_specs role.`);
    }
    if (!readFileSync(spec, 'utf8').includes(fragment)) {
      fail(`${where}: fragment \`${fragment}\` not found in \`${spec}\`.`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`guard-story-refs: ${e}`);
  process.exit(1);
}
console.log(
  `guard-story-refs: OK (${refs.length} refs — ${checkedUnit} unit, ${checkedE2e} e2e — all files and fragments resolve)`,
);
