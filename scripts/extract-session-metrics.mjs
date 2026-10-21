// extract-session-metrics — exports OpenCode or Antigravity session IDs and
// prints aggregated YAML telemetry fields (`agent_model`, `session_id`,
// `tokens_*`, `cost_usd`, `guardrail_failures`) for `docs/factory/slice-metrics.yaml`.
//
// Usage: node scripts/extract-session-metrics.mjs <sessionID> [moreSessionIDs...]
import { execFileSync } from 'node:child_process';
import { openSync, closeSync, readFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
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

function resolveAntigravityPath(id) {
  if (existsSync(id)) {
    const st = statSync(id);
    if (st.isFile()) return id;
    if (st.isDirectory()) {
      const fullPath = join(id, '.system_generated/logs/transcript_full.jsonl');
      if (existsSync(fullPath)) return fullPath;
      const transPath = join(id, '.system_generated/logs/transcript.jsonl');
      if (existsSync(transPath)) return transPath;
      const jsonlInDir = join(id, 'transcript.jsonl');
      if (existsSync(jsonlInDir)) return jsonlInDir;
    }
  }

  const appData = process.env.ANTIGRAVITY_APP_DATA_DIR || join(homedir(), '.gemini/antigravity');
  const candidateFull = join(appData, 'brain', id, '.system_generated/logs/transcript_full.jsonl');
  if (existsSync(candidateFull)) return candidateFull;
  const candidate = join(appData, 'brain', id, '.system_generated/logs/transcript.jsonl');
  if (existsSync(candidate)) return candidate;

  return null;
}

function parseAntigravitySession(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  let model = null;
  let tokensInput = 0;
  let tokensOutput = 0;
  const tokensReasoning = 0;
  let tokensCacheRead = 0;
  let failures = 0;
  let awaitingFixEdit = false;
  const details = [];

  const steps = [];
  for (const line of lines) {
    try {
      steps.push(JSON.parse(line));
    } catch {
      // skip unparseable lines
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    if (step.content && typeof step.content === 'string') {
      const match = step.content.match(/Model Selection` from \S+ to (.*?)\.\s*(?:No need|$|\n)/);
      if (match) model = match[1].trim();
    }

    if (step.input_tokens) tokensInput += step.input_tokens;
    if (step.output_tokens) tokensOutput += step.output_tokens;
    if (step.cache_read_tokens) tokensCacheRead += step.cache_read_tokens;

    if (Array.isArray(step.tool_calls)) {
      for (const tc of step.tool_calls) {
        if (tc.name === 'edit_file' || tc.name === 'write_file') {
          awaitingFixEdit = false;
          continue;
        }
        if (tc.name === 'invoke_subagent' && tc.args?.Model) {
          if (!model) model = tc.args.Model;
        }
        if (tc.name === 'run_command') {
          let cmd = tc.args?.CommandLine ?? '';
          if (typeof cmd === 'string' && cmd.startsWith('"') && cmd.endsWith('"')) {
            try {
              cmd = JSON.parse(cmd);
            } catch {
              cmd = cmd.slice(1, -1);
            }
          }
          if (!GATE_CMD.test(cmd) || DIAGNOSTIC_ONLY.test(cmd)) continue;

          let outputText = '';
          for (let j = i + 1; j < steps.length; j++) {
            if (steps[j].type === 'GENERIC') {
              outputText = String(steps[j].content ?? '');
              break;
            }
            if (steps[j].type === 'PLANNER_RESPONSE') break;
          }

          const exitMatch =
            outputText.match(/Command exited with code (\d+)/i) ||
            outputText.match(/Exited with code (\d+)/i);
          const exitCode = exitMatch ? Number(exitMatch[1]) : 0;

          if (exitCode !== 0 || FAILURE_OUTPUT.test(outputText)) {
            if (!awaitingFixEdit) {
              failures += 1;
              awaitingFixEdit = true;
              details.push({
                turn: step.step_index ?? i,
                cmd: String(cmd).split('\n')[0].slice(0, 80),
              });
            }
          } else {
            awaitingFixEdit = false;
          }
        }
      }
    }
  }

  return {
    model: model || 'antigravity',
    tokensInput,
    tokensOutput,
    tokensReasoning,
    tokensCacheRead,
    costUsd: 0,
    failures,
    details,
  };
}

function exportOpenCodeSession(id) {
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

function countOpenCodeRedGateCycles(messages = []) {
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

function parseOpenCodeSession(data) {
  const info = data.info ?? {};
  let model = 'unknown';
  if (info.model?.providerID && info.model?.id) {
    model = `${info.model.providerID}/${info.model.id}`;
  }
  const { failures, details } = countOpenCodeRedGateCycles(data.messages);
  return {
    model,
    tokensInput: info.tokens?.input ?? 0,
    tokensOutput: info.tokens?.output ?? 0,
    tokensReasoning: info.tokens?.reasoning ?? 0,
    tokensCacheRead: info.tokens?.cache?.read ?? 0,
    costUsd: info.cost ?? 0,
    failures,
    details,
  };
}

function loadSession(id) {
  const agPath = resolveAntigravityPath(id);
  if (agPath) {
    return parseAntigravitySession(agPath);
  }
  const opencodeData = exportOpenCodeSession(id);
  return parseOpenCodeSession(opencodeData);
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
  const session = loadSession(id);
  if (session.model && session.model !== 'unknown') {
    models.add(session.model);
  }
  tokensInput += session.tokensInput;
  tokensOutput += session.tokensOutput;
  tokensReasoning += session.tokensReasoning;
  tokensCacheRead += session.tokensCacheRead;
  costUsd += session.costUsd;
  guardrailFailures += session.failures;
  for (const d of session.details) failureLog.push({ session: id, ...d });
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
