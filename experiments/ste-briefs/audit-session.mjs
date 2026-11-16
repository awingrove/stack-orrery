// Session contamination audit — ste-brief-experiment
// Usage: node audit-session.mjs <sessionID> [runDirPath]
// Scans ALL tool calls (read/glob/grep/shell/bash/edit/write) of a session for
// any access outside the run directory. Exit 0 = clean, 1 = suspect calls found.
//
/* global process, console */
import { DatabaseSync } from 'node:sqlite';

const HOME = process.env.HOME;
const sid = process.argv[2];

if (!sid) {
  console.error('usage: node audit-session.mjs <sessionID> [runDirPath]');
  process.exit(2);
}

const db = new DatabaseSync(HOME + '/.local/share/opencode/opencode.db', { readOnly: true });
const msgs = db
  .prepare(
    "SELECT data FROM session_message WHERE session_id = ? AND type = 'assistant' ORDER BY seq",
  )
  .all(sid);

const suspect = [];
let bypass = 0;
for (const m of msgs) {
  for (const c of JSON.parse(m.data).content ?? []) {
    if (c.type !== 'tool') continue;
    const input = JSON.stringify(c.state?.input ?? {});
    const cmd = c.state?.input?.command ?? '';
    // 1. any reference to the live repo path
    if (input.includes('/home/awingrove/repos/stack-orrery')) {
      suspect.push(c.name + ': ' + (cmd || input).slice(0, 110));
    }
    // 2. shell/git gate-hook bypass
    if (/hooksPath|(--no-verify)|no-verify/.test(cmd)) {
      bypass++;
      suspect.push('HOOK-BYPASS: ' + cmd.slice(0, 110));
    }
  }
}

console.log(
  'audited',
  sid,
  '| assistant msgs:',
  msgs.length,
  '| suspect:',
  suspect.length,
  '| hook-bypass:',
  bypass,
);
for (const s of suspect.slice(0, 8)) console.log('  SUSPECT', s);
process.exit(suspect.length ? 1 : 0);
