// guard-no-inline-html — DOCUMENTS: enforces the AGENTS.md CSP rule on static
// pages: no inline event handlers, no inline style attributes, and every
// script tag is an external ES module (type="module"). The static server
// serves script-src 'self'; style-src 'self' — an inline-script temptation is
// a defect to report, not a CSP to relax.
import { readdirSync, readFileSync } from 'node:fs';

const CHECKS = [
  { token: 'inline handler (on*=)', re: /\son[a-z]+\s*=/i },
  { token: 'inline style (style=)', re: /\sstyle\s*=/i },
  {
    token: '<script without type="module"',
    re: /<script\b(?![^>]*type=["']module["'])/i,
  },
];

const files = readdirSync('.').filter((name) => name.endsWith('.html'));
if (files.length === 0) {
  console.error('guard-no-inline-html: no *.html pages scanned — guard is vacuous.');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let n = 0; n < lines.length; n += 1) {
    for (const { token, re } of CHECKS) {
      if (re.test(lines[n])) failures.push(`${file}:${n + 1} — ${token}`);
    }
  }
}

if (failures.length > 0) {
  for (const f of failures) console.error(`guard-no-inline-html: ${f}`);
  console.error(
    'guard-no-inline-html: AGENTS.md: an inline-script temptation is a defect to ' +
      "report, not a CSP to relax (static server sends script-src 'self'; " +
      "style-src 'self'; wire behavior with addEventListener in external JS).",
  );
  process.exit(1);
}
console.log(`guard-no-inline-html: OK (${files.length} pages scanned, CSP-clean)`);
