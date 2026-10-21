// guard-plan-ticks — PLAN-FORMAT.md's tick-honesty rule, mechanically.
// A ticked step (`- [x]`) must have the work it names on disk: every
// repo-relative path written in backticks in that step's line must exist.
// Fenced/indented example blocks are stripped first (kit PLAN-FORMAT:
// examples are never metadata). Ticks ahead of files = red.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PLANS_DIR = 'docs/plans';
const MAX_BRIEF_LINES = 120;
// Pre-existing briefs authored before the 120-line boundary-contract rule.
const LEGACY_LONG_BRIEFS = new Set([
  'docs/plans/2026-10-15-stage1-executable-model.md',
  'docs/plans/2026-10-16-stage1-interactive-orrery-ui.md',
  'docs/plans/2026-10-18-orrery-plane-camera.md',
  'docs/plans/2026-10-20-stage3-cache.md',
  'docs/plans/2026-10-20-stage4-database.md',
]);

function planFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile() && f.endsWith('.md'));
}

function stripFences(text) {
  let inFence = false;
  return text
    .split('\n')
    .filter((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence;
    })
    .join('\n');
}

const PATH_TOKEN = /`([^`]+)`/g;
// Path-like: a token with a file extension, a dotfile/dir (`.gitignore`,
// `.github/…`), or a trailing slash — while allowing `js/sim/**` globs and
// branch names (`feature/phase1-bootstrap`) to pass as non-paths.
const looksLikePath = (t) =>
  !t.includes(' ') &&
  !t.startsWith('http') &&
  (t.startsWith('.') || t.endsWith('/') || /\.[A-Za-z0-9]{1,8}$/.test(t));

let failures = 0;
const files = planFiles(PLANS_DIR);
if (files.length === 0) {
  console.error(`guard-plan-ticks: no plan files under ${PLANS_DIR}/ — nothing to check.`);
  process.exit(1);
}

for (const file of files) {
  const normalized = file.replace(/\\/g, '/');
  const rawLines = readFileSync(file, 'utf8').split('\n');
  if (rawLines.at(-1) === '') rawLines.pop();
  if (!LEGACY_LONG_BRIEFS.has(normalized) && rawLines.length > MAX_BRIEF_LINES) {
    console.error(
      `guard-plan-ticks: ${normalized} is ${rawLines.length} lines (> ${MAX_BRIEF_LINES}) — write boundary contracts, not pseudocode.`,
    );
    failures++;
  }
  const lines = stripFences(readFileSync(file, 'utf8')).split('\n');
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^\s*- \[x\] (.*)/);
    if (!m) continue;
    // Collect this step's text: the tick line plus its continuation lines.
    let stepText = m[1];
    for (
      let j = i + 1;
      j < lines.length && /^\s{2,}\S/.test(lines[j]) && !/^\s*- \[/.test(lines[j]);
      j++
    ) {
      stepText += ` ${lines[j].trim()}`;
    }
    for (const tok of stepText.matchAll(PATH_TOKEN)) {
      const p = tok[1];
      if (!looksLikePath(p)) continue;
      const cleaned = p.replace(/[:（(].*$/, '');
      if (!existsSync(cleaned)) {
        console.error(
          `guard-plan-ticks: ${file}:${i + 1} — ticked step names \`${p}\` but \`${cleaned}\` does not exist.`,
        );
        failures++;
      }
    }
  }
}

if (failures > 0) {
  console.error('guard-plan-ticks: ticks ahead of the work. Untick, or land the work.');
  process.exit(1);
}
console.log(`guard-plan-ticks: OK (${files.length} plan(s), every ticked path exists)`);
