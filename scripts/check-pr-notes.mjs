// check-pr-notes — DOCUMENTS: checks a GitHub PR body against the kit's
// PR-NOTES.md shape: the decision half on top (five named sections) with the
// full audit trail collapsed in a record block. A body that requires the
// glossary to have read anything is unreviewable, so this fails with the
// missing section names, not vibes.
const SECTIONS = ['TL;DR', 'Review path', 'Decisions needed', 'Risk map', 'Verification'];

const body = process.env.PR_BODY ?? '';
if (!body.trim()) {
  console.error('check-pr-notes: PR_BODY is empty — no PR notes to check.');
  process.exit(1);
}

const missing = SECTIONS.filter(
  (name) => !new RegExp(`^### ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'm').test(body),
);

const summarySpans = body.match(/<summary[^>]*>[\s\S]*?<\/summary>/gi) ?? [];
const namesRecord = summarySpans.some((span) => /record/i.test(span));
const hasRecord = /<details/i.test(body) && namesRecord;

const failures = [];
if (missing.length > 0) failures.push(`missing section(s): ${missing.join(', ')}`);
if (!hasRecord) {
  failures.push('missing collapsed record block (<details><summary>Record …)');
}

if (failures.length > 0) {
  for (const f of failures) console.error(`check-pr-notes: ${f}`);
  console.error(
    'check-pr-notes: factory-kit PR-NOTES.md — decision half on top, record ' +
      'collapsed; a body that requires the glossary to have read anything is ' +
      'unreviewable.',
  );
  process.exit(1);
}
console.log('check-pr-notes: OK (five decision sections + collapsed record block present)');
