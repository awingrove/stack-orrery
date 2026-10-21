// extract-session-metrics — exports one or more OpenCode session IDs via
// `opencode session export <id>` and prints the aggregated YAML telemetry
// fields (`agent_model`, `session_id`, `tokens_*`, `cost_usd`,
// `guardrail_failures`) for `docs/factory/slice-metrics.yaml`.
//
// Usage: node scripts/extract-session-metrics.mjs <sessionID> [moreSessionIDs...]
import { execFileSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const sessionIds = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
if (sessionIds.length === 0) {
  console.error('Usage: node scripts/extract-session-metrics.mjs <sessionID> [moreSessionIDs...]');
  process.exit(1);
}

const GATE_CMD =
  /\b(npm run (verify|unit|guard|lint|format:check|test:e2e)|npx (vitest|playwright test|eslint|prettier --check)|node scripts\/guard-)/;
const DIAGNOSTIC_ONLY = /^\s*(grep|sed|cat|head|tail)\b/;
const FAILURE_OUTPUT =
  /(\bFAIL\b|\b[1-9]\d*\s+failed\b|AssertionError:|violation\(s\)|offenders|Exited with code [1-9])/;

function exportSession(id) {
  const tmpFile = join('/tmp', `opencode-export-${process.pid}-${id}.json`);
  const fd = openSync(tmpFile, 'w');
  try {
    execFileSync('opencode', ['session', 'export', id], {
      stdio: ['ignore', fd, 'inherit'],
    });
    closeSync(fd);
    return JSON.parse(readFileSync(tmpFile, 'utf8'));
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // ignore missing temp file
    }
  }
}

function countRedGateCycles(messages = []) {
  let failures = 0;
  let awaitingFixEdit = false;
  const details = [];
  for (const [idx, msg] of messages.entries()) {
    for (const part of msg.content ?? []) {
      if (part.type !== 'tool') continue;
      if (part.name === 'edit' || part.name === 'write') {
        awaitingFixEdit = false;
        continue;
      }
      if (part.name !== 'shell') continue;
      const cmd = String(part.state?.input?.command ?? '');
      if (!GATE_CMD.test(cmd) || DIAGNOSTIC_ONLY.test(cmd)) continue;
      const exitCode = part.state?.metadata?.exit ?? 0;
      const text = (part.state?.content ?? []).map((c) => c.text ?? '').join('\n');
      if (exitCode !== 0 || FAILURE_OUTPUT.test(text)) {
        if (!awaitingFixEdit) {
          failures += 1;
          awaitingFixEdit = true;
          details.push({ turn: idx, cmd: cmd.split('\n')[0].slice(0, 80) });
        }
      } else {
        awaitingFixEdit = false;
      }
    }
  }
  return { failures, details };
}

const models = new Set();
let tokensInput = 0;
let tokensOutput = 0;
let tokensReasoning = 0;
let tokensCacheRead = 0;
let costUsd = 0;
let guardrailFailures = 0;
const failureLog = [];

for (const id of sessionIds) {
  const data = exportSession(id);
  const info = data.info ?? {};
  if (info.model?.providerID && info.model?.id) {
    models.add(`${info.model.providerID}/${info.model.id}`);
  }
  tokensInput += info.tokens?.input ?? 0;
  tokensOutput += info.tokens?.output ?? 0;
  tokensReasoning += info.tokens?.reasoning ?? 0;
  tokensCacheRead += info.tokens?.cache?.read ?? 0;
  costUsd += info.cost ?? 0;
  const { failures, details } = countRedGateCycles(data.messages);
  guardrailFailures += failures;
  for (const d of details) failureLog.push({ session: id, ...d });
}

console.log(`    agent_model: ${[...models].join(', ') || 'unknown'}`);
console.log(`    session_id: ${sessionIds.join(', ')}`);
console.log(`    tokens_input: ${tokensInput}`);
console.log(`    tokens_output: ${tokensOutput}`);
console.log(`    tokens_reasoning: ${tokensReasoning}`);
console.log(`    tokens_cache_read: ${tokensCacheRead}`);
console.log(`    cost_usd: ${Number(costUsd.toFixed(4))}`);
console.log(`    guardrail_failures: ${guardrailFailures}`);
if (failureLog.length > 0) {
  console.log('    # Detected red gate runs:');
  for (const f of failureLog) {
    console.log(`    #   ${f.session} [turn ${f.turn}]: ${f.cmd}`);
  }
}
