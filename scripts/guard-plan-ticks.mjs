// guard-plan-ticks — PLAN-FORMAT.md's tick-honesty rule, mechanically.
// A ticked step (`- [x]`) must have the work it names on disk: every
// repo-relative path written in backticks in that step's line must exist.
// Fenced/indented example blocks are stripped first (kit PLAN-FORMAT:
// examples are never metadata). Ticks ahead of files = red.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PLANS_DIR = 'docs/plans';

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
const looksLikePath = (t) =>
  !t.includes(' ') && (t.includes('/') || /\.[a-z]{1,5}$/.test(t)) && !t.startsWith('http');

let failures = 0;
const files = planFiles(PLANS_DIR);
if (files.length === 0) {
  console.error(`guard-plan-ticks: no plan files under ${PLANS_DIR}/ — nothing to check.`);
  process.exit(1);
}

for (const file of files) {
  const lines = stripFences(readFileSync(file, 'utf8')).split('\n');
  for (const [i, line] of lines.entries()) {
    const m = line.match(/^\s*- \[x\] (.*)/);
    if (!m) continue;
    // Collect this step's text: the tick line plus its continuation lines.
    let stepText = m[1];
    for (let j = i + 1; j < lines.length && /^\s{2,}\S/.test(lines[j]) && !/^\s*- \[/.test(lines[j]); j++) {
      stepText += ` ${lines[j].trim()}`;
    }
    for (const tok of stepText.matchAll(PATH_TOKEN)) {
      const p = tok[1];
      if (!looksLikePath(p)) continue;
      const cleaned = p.replace(/[:（(].*$/, '');
      if (!existsSync(cleaned)) {
        console.error(
          `guard-plan-ticks: ${file}:${i + 1} — ticked step names \`${p}\` but \`${cleaned}\` does not exist.`
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
