// guard-determinism — DOCUMENTS: enforces the AGENTS.md determinism rule for
// js/sim/**: seeded rng only (js/sim/rng.js), time advances by explicit tick;
// Math.random / Date / timers / frame or performance clocks are forbidden in
// simulator code. Scans real code only: comments are stripped first so prose
// that mentions a banned symbol (rng.js, users.js) is not a false hit.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const OFFENDING = [
  'Math.random(',
  'Date.now(',
  'new Date(',
  'setTimeout(',
  'setInterval(',
  'requestAnimationFrame(',
  'performance.now(',
];

// Replace comment text with spaces, keeping '\n' so file:line reporting stays
// faithful to the original file.
export function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (ch === '/' && next === '*') {
      let close = src.indexOf('*/', i + 2);
      if (close === -1) close = src.length;
      for (let k = i; k < close + 2 && k < src.length; k += 1) {
        out += src[k] === '\n' ? '\n' : ' ';
      }
      i = close + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(relative('.', full).split(sep).join('/'));
  }
  return out;
}

const files = walk('js/sim');
if (files.length === 0) {
  console.error('guard-determinism: no js/sim files scanned — guard is vacuous.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    for (const token of OFFENDING) {
      if (lines[n].includes(token)) {
        failures.push(`${file}:${n + 1} — ${token}`);
      }
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`guard-determinism: ${f}`);
  }
  console.error(
    'guard-determinism: js/sim is deterministic: seeded rng only, explicit tick ' +
      'advance; Date.now / Math.random / timers are forbidden.',
  );
  process.exit(1);
}
console.log(`guard-determinism: OK (${files.length} js/sim files scanned, comments stripped)`);
