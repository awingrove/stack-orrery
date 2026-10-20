// guard-file-size — per-role split triggers (AGENTS.md stack rule; kit
// FACTORY DoD). Production modules (js/**, css/**) fail over 300 lines so
// logic splits into focused ES modules/stylesheets; additive test suites
// (test/**, e2e/**) fail over 450 lines; static pages (*.html, no partials/
// bundler) fail over 550 lines. Non-vacuity: if the selection is empty the
// guard itself is broken, so that fails too.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';

const LIMITS = {
  html: 550,
  test: 450,
  code: 300,
};

function limitFor(file) {
  if (extname(file) === '.html') return LIMITS.html;
  if (file.startsWith('test/') || file.startsWith('e2e/')) return LIMITS.test;
  return LIMITS.code;
}
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'test-results',
  'playwright-report',
  '.cache',
]);
const SOURCE_DIRS = ['js', 'css', 'e2e', 'test'];
const SOURCE_EXT = new Set(['.js', '.css', '.html']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative('.', full).split(sep).join('/'));
  }
  return out;
}

const candidates = [
  ...SOURCE_DIRS.filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  }).flatMap((d) => walk(d)),
  ...walk('.').filter((f) => !f.includes('/') && SOURCE_EXT.has(extname(f))),
];

if (candidates.length === 0) {
  console.error('guard-file-size: selection is empty — the guard itself is broken (non-vacuity).');
  process.exit(1);
}

const offenders = [];
for (const file of candidates) {
  if (!SOURCE_EXT.has(extname(file))) continue;
  const limit = limitFor(file);
  const lines = readFileSync(file, 'utf8').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length > limit) offenders.push({ file, lines: lines.length, limit });
}

if (offenders.length > 0) {
  for (const { file, lines, limit } of offenders) {
    console.error(
      `guard-file-size: ${file} is ${lines} lines (> ${limit}) — split by responsibility.`,
    );
  }
  process.exit(1);
}
console.log(
  `guard-file-size: OK (${candidates.length} source files scanned; js/css ≤ ${LIMITS.code}, test/e2e ≤ ${LIMITS.test}, html ≤ ${LIMITS.html})`,
);
