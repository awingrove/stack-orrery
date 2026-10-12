// guard-debt — factory-kit DEBT-REGISTER.md, mechanically enforced.
// Checks: three sections; required/forbidden/known fields per section; ids
// TD-\d+/DL-\d+ unique repo-wide; closed/found are real ISO dates; every
// open entry's backticked `where` paths exist (closed `where` is historical
// and exempt — kit: "Do not unify the two shapes").
import { readFileSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

const FILE = 'docs/factory/technical-debt.yaml';
const ID_RE = /^(TD|DL)-\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SCHEMA = {
  open: {
    required: ['id', 'title', 'where', 'what', 'interest', 'paydown'],
    forbidden: ['closed', 'note'],
    optional: ['deferred', 'deferral_note'],
  },
  closed: {
    required: ['id', 'title', 'closed', 'note'],
    forbidden: [],
    optional: ['where', 'what', 'interest'],
  },
  defects: {
    required: ['id', 'title', 'found', 'injection_stage', 'detection_stage', 'systemic_gap'],
    forbidden: [],
    optional: ['what', 'closed_in'],
  },
};

const errors = [];
const fail = (msg) => errors.push(msg);

function realIsoDate(value, where) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    fail(`${where}: \`${value}\` is not a bare ISO date (YYYY-MM-DD).`);
    return;
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    fail(`${where}: \`${value}\` is not a real calendar date.`);
  }
}

// Backticked repo-relative paths inside an open entry's `where`.
function checkWherePaths(id, where) {
  if (typeof where !== 'string') return;
  for (const m of where.matchAll(/`([^`]+)`/g)) {
    let p = m[1];
    if (!p.includes('/')) continue; // bare token = prose/anchor, not a path
    p = p.replace(/^was\s+/, '').replace(/[:（(].*$/, '');
    if (!existsSync(p)) fail(`${id}: where path \`${p}\` does not exist.`);
  }
}

let register;
try {
  register = parse(readFileSync(FILE, 'utf8'));
} catch (err) {
  console.error(`guard-debt: ${FILE} unreadable/unparseable — ${err.message}`);
  console.error('  (hint: prose fields must be folded `>-` scalars, never plain.)');
  process.exit(1);
}

if (!register || typeof register !== 'object' || Array.isArray(register)) {
  console.error(`guard-debt: ${FILE} did not parse to a mapping.`);
  process.exit(1);
}

const extraSections = Object.keys(register).filter((k) => !(k in SCHEMA));
if (extraSections.length > 0) fail(`unknown top-level section(s): ${extraSections.join(', ')}`);

const seenIds = new Map();
let total = 0;

for (const [section, rules] of Object.entries(SCHEMA)) {
  const entries = register[section];
  if (entries === undefined) {
    fail(`missing section \`${section}\` (declare it, [] if empty).`);
    continue;
  }
  if (!Array.isArray(entries)) {
    fail(`section \`${section}\` must be a list.`);
    continue;
  }
  entries.forEach((entry, i) => {
    const label = `${section}[${i}]`;
    total++;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      fail(`${label}: entry must be a mapping.`);
      return;
    }
    const id = typeof entry.id === 'string' ? entry.id : label;

    for (const f of rules.required) {
      if (!(f in entry)) fail(`${id}: missing required field \`${f}\`.`);
      else if (entry[f] === '' || entry[f] == null)
        fail(`${id}: required field \`${f}\` is empty.`);
    }
    for (const f of rules.forbidden) {
      if (f in entry) fail(`${id}: forbidden field \`${f}\` on a \`${section}\` entry.`);
    }
    const known = new Set([...rules.required, ...rules.optional]);
    for (const f of Object.keys(entry)) {
      if (!known.has(f)) fail(`${id}: unknown field \`${f}\` (schema: ${[...known].join(', ')}).`);
    }

    if ('id' in entry) {
      if (!ID_RE.test(entry.id)) fail(`\`${entry.id}\`: id must match TD-\\d+ or DL-\\d+.`);
      if (seenIds.has(entry.id)) {
        fail(
          `duplicate id \`${entry.id}\` (also in ${seenIds.get(entry.id)}); ids are unique repo-wide.`,
        );
      } else {
        seenIds.set(entry.id, label);
      }
    }

    if (section === 'closed' && 'closed' in entry) realIsoDate(entry.closed, `${id}: closed`);
    if (section === 'defects' && 'found' in entry) realIsoDate(entry.found, `${id}: found`);
    if (section === 'open' && 'where' in entry) checkWherePaths(id, entry.where);
  });
}

if (errors.length > 0) {
  for (const e of errors) console.error(`guard-debt: ${e}`);
  process.exit(1);
}
console.log(
  `guard-debt: OK (${total} entries, ${seenIds.size} unique ids, schema + dates + open where-paths)`,
);
