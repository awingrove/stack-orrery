// Runs every guardrail script in order; the named gate `npm run guard`.
// Exit 1 if any guard fails. Each guard is also runnable standalone.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const guards = [
  'guard-plan-ticks.mjs',
  'guard-debt.mjs',
  'guard-slices.mjs',
  'guard-story-refs.mjs',
  'guard-file-size.mjs',
  'guard-claims.mjs',
];

const results = [];
// PR CI: pass the base ref so guard-slices can enforce meta-rule 7
// (same-change manifest updates); local runs skip it with a notice.
const extra = process.env.GITHUB_BASE_REF
  ? ['--base', `origin/${process.env.GITHUB_BASE_REF}`]
  : [];
for (const guard of guards) {
  const res = spawnSync(process.execPath, [join(here, guard), ...extra], { stdio: 'inherit' });
  results.push({ guard, ok: res.status === 0 });
}

console.log('\nguard summary:');
for (const { guard, ok } of results) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${guard}`);
}
const failed = results.filter((r) => !r.ok);
process.exit(failed.length === 0 ? 0 : 1);
