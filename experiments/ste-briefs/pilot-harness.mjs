// Phase 2 pilot harness — ste-brief-experiment
// Subcommands:
//   node pilot-harness.mjs setup          — build 9 isolated run dirs + shuffled order
//   node pilot-harness.mjs measure <arm> <n> <sessionId> — post-run measurements
//
// Isolation (protocol §7.1): each run dir is a fresh `git archive` export of
// the change's start commit — no future history. One base commit includes the
// harness's only patch (a unique e2e port per run dir, so concurrent gates
// cannot cross-contaminate; deviation #13 in DEVIATIONS.md). Branch name set
// to the brief's branch so "already checked out" stays true. npm ci from the
// shared warm cache happens in setup, sequentially — no npm runs during
// execution (§7.1.4 + §7.3.3).
//
/* global process, console */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const HOME = process.env.HOME;
const REPO = '/home/awingrove/repos/stack-orrery/stack-orrery';
const EXP = REPO + '/experiments/ste-briefs';
const RUNS = '/tmp/opencode/ste-runs/C10';
const CHANGE = 'C10';
const SEED = 20261112;
const ARMS = ['A', 'B', 'C'];
const RUNS_PER_ARM = 3;
const PORT_BASE = 4242;

const startSha = readFileSync(EXP + '/' + CHANGE + '/start.sha', 'utf8').trim();

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: opts.cwd ?? REPO,
    maxBuffer: 128 * 1024 * 1024,
  }).toString();
}

// seeded shuffle (LCG + Fisher-Yates), recorded in runs-order.json
function shuffledRuns() {
  let x = SEED >>> 0;
  const rand = () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return x / 4294967296;
  };
  const items = [];
  for (const arm of ARMS) for (let n = 1; n <= RUNS_PER_ARM; n++) items.push({ arm, n });
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function setup() {
  const order = shuffledRuns();
  writeFileSync(EXP + '/runs-order.json', JSON.stringify({ SEED, order }, null, 2) + '\n');
  mkdirSync(RUNS, { recursive: true });
  for (const r of order) {
    const dir = `${RUNS}/${r.arm}-${r.n}`;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync('bash', ['-c', `git archive ${startSha} | tar -x -C ${dir}`], { cwd: REPO });
    const port = PORT_BASE + r.n * 3 + ARMS.indexOf(r.arm);
    const cfg = dir + '/playwright.config.js';
    const patched = readFileSync(cfg, 'utf8').replace(
      'const PORT = 4173;',
      `const PORT = ${port};`,
    );
    if (patched === readFileSync(cfg, 'utf8')) throw new Error('port patch failed for ' + dir);
    writeFileSync(cfg, patched);
    sh('git', ['init', '-q', '-b', 'feat/b5-compare-tray'], { cwd: dir });
    sh('git', ['add', '-A'], { cwd: dir });
    sh(
      'git',
      [
        'commit',
        '-q',
        '-m',
        `base: export of ${startSha.slice(0, 9)} (ste-brief-experiment harness; e2e port patched 4173->${port})`,
      ],
      { cwd: dir },
    );
    sh('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir });
    console.log(`setup ${r.arm}-${r.n} ok (port ${port})`);
  }
  console.log('order:', order.map((r) => `${r.arm}-${r.n}`).join(' '));
}

// ---------- measurement ----------

function dbSession(sid) {
  const db = new DatabaseSync(HOME + '/.local/share/opencode/opencode.db', { readOnly: true });
  const row = db.prepare('SELECT * FROM session_v2 WHERE id = ?').get(sid);
  const msgs = db
    .prepare(
      'SELECT type, data, time_created FROM session_message WHERE session_id = ? ORDER BY seq',
    )
    .all(sid)
    .map((m) => ({ type: m.type, time: m.time_created, data: JSON.parse(m.data) }));
  db.close();
  return { row, msgs };
}

function measure(arm, n, sid) {
  const dir = `${RUNS}/${arm}-${n}`;
  const outDir = `${EXP}/runs/${CHANGE}/${arm}-${n}`;
  mkdirSync(outDir, { recursive: true });

  // gate (harness-run, §8.1)
  let gate;
  try {
    const out = sh('npm', ['run', 'verify'], { cwd: dir });
    gate = { pass: true, output: out };
  } catch (e) {
    gate = { pass: false, output: (e.stdout ?? '') + (e.stderr ?? '') + String(e.status ?? '') };
  }

  // diff
  const diff = sh('bash', ['-c', 'git diff $(git rev-list --max-parents=0 HEAD) HEAD'], {
    cwd: dir,
  });
  writeFileSync(outDir + '/run.diff', diff);
  const numstat = sh(
    'bash',
    ['-c', `git diff --numstat $(git rev-list --max-parents=0 HEAD) HEAD`],
    {
      cwd: dir,
    },
  );
  const files = numstat
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\t')[2]);
  const lines = numstat
    .split('\n')
    .filter(Boolean)
    .reduce(
      (a, l) => {
        const [i, d] = l.split('\t');
        a.added += Number(i);
        a.removed += Number(d);
        return a;
      },
      { added: 0, removed: 0 },
    );

  // reference file list
  const refDiff = readFileSync(EXP + '/' + CHANGE + '/reference.diff', 'utf8');
  const refFiles = [...refDiff.matchAll(/^diff --git a\/(.+) b\/.+$/gm)].map((m) => m[1]);
  const runSet = new Set(files);
  const refSet = new Set(refFiles);
  const extra = files.filter((f) => !refSet.has(f));
  const missing = refFiles.filter((f) => !runSet.has(f));
  const overlap = refFiles.length
    ? refFiles.filter((f) => runSet.has(f)).length / refFiles.length
    : 0;

  // session telemetry
  const { row, msgs } = dbSession(sid);
  const asst = msgs.filter((m) => m.type === 'assistant');
  const tokens = asst.reduce(
    (a, m) => ({
      input: a.input + (m.data.tokens?.input ?? 0),
      output: a.output + (m.data.tokens?.output ?? 0),
      reasoning: a.reasoning + (m.data.tokens?.reasoning ?? 0),
    }),
    { input: 0, output: 0, reasoning: 0 },
  );
  const cost = asst.reduce((a, m) => a + (m.data.cost ?? 0), 0);
  const lastTime = Math.max(...msgs.map((m) => m.time));
  const wallMin = (lastTime - row.time_created) / 60000;

  // gate attempts from the log: bash tool calls running the gate
  const gateRuns = [];
  let guardFails = 0;
  for (const m of asst) {
    for (const c of m.data.content ?? []) {
      if (c.type !== 'tool' || c.name !== 'bash') continue;
      const cmd = c.state?.input?.command ?? '';
      const result = JSON.stringify(c.state?.output ?? c.state?.result ?? '');
      if (/npm run (verify|unit|guard)/.test(cmd)) {
        const failed =
          /FAIL|✖|exit code 1|ELIFECYCLE/i.test(result) &&
          !/guard summary:[\s\S]*?all PASS/i.test(result);
        gateRuns.push({ cmd: cmd.slice(0, 80), failed });
        if (failed) guardFails++;
      } else if (/guard/.test(cmd) && /FAIL/.test(result)) {
        guardFails++;
      }
    }
  }
  const firstAttempt = gateRuns.length ? !gateRuns[0].failed : null;

  // questions/assumptions from the final assistant text
  const finalText = asst
    .at(-1)
    ?.data.content?.filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join(' ');
  const questions = (finalText.match(/\?/g) ?? []).length;
  const assumptions = (finalText.match(/assum\w*/gi) ?? []).length;

  // stop reason (§7.2.4 limits: 105 turns / 15 min for this change)
  let stopReason = 'finished';
  if (asst.length > 105) stopReason = 'turn limit';
  if (wallMin > 15) stopReason = 'time limit';

  const runJson = {
    change_id: CHANGE,
    arm,
    run_number: n,
    seed: SEED,
    executor_model: 'opencode/glm-5.3-flash-free',
    executor_session_id: sid,
    gate_pass: gate.pass,
    first_attempt_gate_pass: firstAttempt,
    guardrail_failures: guardFails,
    files_changed: files.length,
    lines_added: lines.added,
    lines_removed: lines.removed,
    extra_files: extra,
    missing_files: missing,
    file_overlap: Number(overlap.toFixed(3)),
    questions,
    assumptions,
    turns: asst.length,
    tokens_input: tokens.input,
    tokens_output: tokens.output,
    tokens_reasoning: tokens.reasoning,
    wall_seconds: Math.round(wallMin * 60),
    cost,
    stop_reason: stopReason,
    gate_runs_seen: gateRuns.length,
  };
  writeFileSync(outDir + '/run.json', JSON.stringify(runJson, null, 2) + '\n');
  writeFileSync(outDir + '/gate.txt', gate.output);
  // session log export (DB dump of messages)
  writeFileSync(
    outDir + '/session-log.json',
    JSON.stringify(
      { session_id: sid, row: { ...row, model: JSON.parse(row.model ?? '{}') }, messages: msgs },
      null,
      2,
    ),
  );
  console.log(
    `measure ${arm}-${n}: gate=${gate.pass ? 'PASS' : 'FAIL'} files=${files.length} +${lines.added}/-${lines.removed} turns=${asst.length} wall=${wallMin.toFixed(1)}m stop=${stopReason} firstGate=${firstAttempt} guardFails=${guardFails}`,
  );
  console.log(`  extra: ${extra.join(', ') || 'none'}`);
  console.log(`  missing: ${missing.join(', ') || 'none'}`);
}

const [, , cmd, ...rest] = process.argv;
if (cmd === 'setup') setup();
else if (cmd === 'measure') measure(rest[0], Number(rest[1]), rest[2]);
else if (cmd === 'csv') csv();
else console.log('usage: setup | measure <arm> <n> <sessionId> | csv');

// csv — emit results.csv from all run.json files (§8.4)
function csv() {
  const COLS = [
    'change_id',
    'arm',
    'run_number',
    'seed',
    'executor_model',
    'gate_pass',
    'first_attempt_gate_pass',
    'guardrail_failures',
    'files_changed',
    'lines_added',
    'lines_removed',
    'extra_files',
    'missing_files',
    'file_overlap',
    'questions',
    'assumptions',
    'turns',
    'tokens_input',
    'tokens_output',
    'tokens_reasoning',
    'wall_seconds',
    'cost',
    'stop_reason',
    'requirements_score',
    'requirements_max',
    'quality_checks_score',
    'human_graded',
  ];
  const rows = [COLS.join(',')];
  const order = JSON.parse(readFileSync(EXP + '/runs-order.json', 'utf8')).order;
  for (const { arm, n } of order) {
    const p = `${EXP}/runs/${CHANGE}/${arm}-${n}/run.json`;
    if (!existsSync(p)) {
      rows.push([CHANGE, arm, n].join(',') + ',NO-RUN');
      continue;
    }
    const r = JSON.parse(readFileSync(p, 'utf8'));
    rows.push(
      COLS.map((c) => {
        const v = r[c];
        if (Array.isArray(v)) return `"${v.join('; ')}"`;
        return v === undefined ? '' : String(v);
      }).join(','),
    );
  }
  writeFileSync(EXP + '/runs/' + CHANGE + '/results.csv', rows.join('\n') + '\n');
  console.log('results.csv written:', rows.length - 1, 'runs');
}
