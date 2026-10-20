// guard-metrics — factory-kit METRICS.md schema and coverage validator.
// Validates docs/factory/slice-metrics.yaml:
//   1. Non-vacuity: at least one entry exists.
//   2. Every entry has required fields, unique id and brief, valid agent class
//      (cheap | frontier | human), non-negative integer counters, declared
//      slice id(s) from slices.yaml, and an existing brief file on disk.
//   3. Past 3 entries (hard gate): every committed plan in docs/plans/*.md has
//      an entry in the ledger.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parse } from 'yaml';

const METRICS_FILE = 'docs/factory/slice-metrics.yaml';
const SLICES_FILE = 'slices.yaml';
const PLANS_DIR = 'docs/plans';

const REQUIRED = [
  'id',
  'slice',
  'name',
  'brief',
  'agent',
  'human_interventions',
  'agent_review_rounds',
  'guardrail_failures',
  'fix_commits',
  'defects_escaped',
];
const COUNTERS = [
  'human_interventions',
  'agent_review_rounds',
  'guardrail_failures',
  'fix_commits',
  'defects_escaped',
];
const AGENT_CLASSES = new Set(['cheap', 'frontier', 'human']);

if (!existsSync(METRICS_FILE)) {
  console.error(`guard-metrics: ${METRICS_FILE} does not exist.`);
  process.exit(1);
}

const doc = parse(readFileSync(METRICS_FILE, 'utf8')) ?? {};
const entries = doc.entries;
if (!Array.isArray(entries) || entries.length === 0) {
  console.error(`guard-metrics: ${METRICS_FILE} has no entries (non-vacuity).`);
  process.exit(1);
}

const slicesDoc = parse(readFileSync(SLICES_FILE, 'utf8')) ?? {};
const validSlices = new Set((slicesDoc.slices ?? []).map((s) => s.id));

const errors = [];
const seenIds = new Set();
const seenBriefs = new Set();

for (const [idx, entry] of entries.entries()) {
  const label = entry?.id ?? `entries[${idx}]`;
  for (const field of REQUIRED) {
    if (entry?.[field] === undefined || entry?.[field] === null || entry?.[field] === '') {
      errors.push(`${label}: missing required field '${field}'`);
    }
  }
  if (entry?.id) {
    if (seenIds.has(entry.id)) errors.push(`${label}: duplicate id '${entry.id}'`);
    seenIds.add(entry.id);
  }
  if (entry?.brief) {
    if (seenBriefs.has(entry.brief)) errors.push(`${label}: duplicate brief '${entry.brief}'`);
    seenBriefs.add(entry.brief);
    if (!existsSync(entry.brief)) {
      errors.push(`${label}: brief path '${entry.brief}' does not exist`);
    }
  }
  if (entry?.agent && !AGENT_CLASSES.has(entry.agent)) {
    errors.push(`${label}: invalid agent '${entry.agent}' (expected cheap | frontier | human)`);
  }
  const sliceList = Array.isArray(entry?.slice) ? entry.slice : entry?.slice ? [entry.slice] : [];
  for (const s of sliceList) {
    if (!validSlices.has(s)) {
      errors.push(`${label}: unknown slice id '${s}' (not in ${SLICES_FILE})`);
    }
  }
  for (const counter of COUNTERS) {
    const val = entry?.[counter];
    if (val !== undefined && (!Number.isInteger(val) || val < 0)) {
      errors.push(`${label}: '${counter}' must be a non-negative integer, got ${val}`);
    }
  }
}

if (entries.length >= 3 && existsSync(PLANS_DIR)) {
  const planFiles = readdirSync(PLANS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => `${PLANS_DIR}/${f}`);
  for (const plan of planFiles) {
    if (!seenBriefs.has(plan)) {
      errors.push(`unrecorded brief: '${plan}' has no entry in ${METRICS_FILE}`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`guard-metrics: ${e}`);
  process.exit(1);
}

console.log(
  `guard-metrics: OK (${entries.length} entries, ${entries.filter((e) => e.agent === 'cheap').length} cheap-model proof(s), all briefs & slices resolve)`,
);
