// Configures git to use the tracked .githooks/ directory (pre-commit gate).
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';

if (existsSync('.git') && existsSync('.githooks/pre-commit')) {
  chmodSync('.githooks/pre-commit', 0o755);
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
  console.log('install-hooks: core.hooksPath -> .githooks (.githooks/pre-commit active)');
}
