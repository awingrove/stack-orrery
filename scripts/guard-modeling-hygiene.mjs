// guard-modeling-hygiene — DOCUMENTS: enforces three AGENTS.md modeling rules
// in js/sim/** code: two-number mini-IP addresses (no dotted-quad IPv4), slim
// protocols (no "HTTP/1.1" wire chrome), and DOM-free components (no
// innerHTML). Component cards narrate the sim's own records, never browser
// chrome. Comments are stripped first so prose cannot false-fail the scan.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments } from './guard-determinism.mjs';

const OFFENDING = [
  { token: 'dotted-quad IPv4', re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { token: 'HTTP/1.1', re: /HTTP\/1\.1/ },
  { token: 'innerHTML', re: /innerHTML/ },
];

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
  console.error('guard-modeling-hygiene: no js/sim files scanned — guard is vacuous.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    for (const { token, re } of OFFENDING) {
      if (re.test(lines[n])) failures.push(`${file}:${n + 1} — ${token}`);
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`guard-modeling-hygiene: ${f}`);
  console.error(
    'guard-modeling-hygiene: two-number mini-IPs, slim GET/status protocols, no ' +
      'innerHTML: simulations narrate real component records, not HTTP chrome.',
  );
  process.exit(1);
}
console.log(`guard-modeling-hygiene: OK (${files.length} js/sim files scanned, comments stripped)`);
