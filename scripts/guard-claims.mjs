// guard-claims — factory-kit CLAIM-LANGUAGE.md, mechanically enforced
// (strict mode). Every comment paragraph in js/**, css/**, test/**, e2e/**
// obeys three rules:
//   1. At most one claim keyword (CHECKS:, PINS:, DOCUMENTS:) per paragraph.
//   2. Guarantee words (guarantees, always, never, ensures, will) may appear
//      ONLY inside CHECKS: or PINS: paragraphs — never in untagged comments
//      and never in DOCUMENTS: paragraphs ("description of behavior, carrying
//      no guarantee").
//   3. Non-vacuity: fails if 0 source files or 0 claim tags are scanned.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';

const SOURCE_DIRS = ['js', 'css', 'test', 'e2e'];
const SOURCE_EXT = new Set(['.js', '.css']);
const CLAIM_TAG = /\b(CHECKS|PINS|DOCUMENTS):/g;
const GUARANTEE_WORD = /\b(guarantees?|always|never|ensures?|will)\b/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.has(extname(full))) out.push(relative('.', full).split(sep).join('/'));
  }
  return out;
}

// Extract comment paragraphs [{ line, text }] while skipping '', "", and ``
// string literals (so template code in inspector-source.js and test titles
// in it('...') are not misread as comments).
function extractCommentParagraphs(src) {
  const blocks = [];
  let i = 0;
  let line = 1;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '\n') {
      line += 1;
      i += 1;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i += 1;
        if (src[i] === '\n') line += 1;
        i += 1;
      }
      i += 1;
    } else if (ch === '/' && next === '/') {
      const startLine = line;
      const end = src.indexOf('\n', i);
      const raw = (end === -1 ? src.slice(i + 2) : src.slice(i + 2, end)).trim();
      blocks.push({ kind: 'line', line: startLine, text: raw });
      i = end === -1 ? src.length : end;
    } else if (ch === '/' && next === '*') {
      const startLine = line;
      const end = src.indexOf('*/', i + 2);
      const raw = end === -1 ? src.slice(i + 2) : src.slice(i + 2, end);
      line += raw.split('\n').length - 1;
      blocks.push({ kind: 'block', line: startLine, text: raw.trim() });
      i = end === -1 ? src.length : end + 2;
    } else {
      i += 1;
    }
  }

  // Merge adjacent non-empty `//` lines into paragraphs; blank `//` or a new
  // leading claim keyword starts a fresh paragraph.
  const paragraphs = [];
  let current = null;
  for (const b of blocks) {
    if (b.kind === 'block') {
      if (current) paragraphs.push(current);
      current = null;
      if (b.text) paragraphs.push({ line: b.line, text: b.text });
    } else if (b.text === '') {
      if (current) paragraphs.push(current);
      current = null;
    } else if (
      current &&
      b.line === current.lastLine + 1 &&
      !/^(CHECKS|PINS|DOCUMENTS):/.test(b.text)
    ) {
      current.text += ` ${b.text}`;
      current.lastLine = b.line;
    } else {
      if (current) paragraphs.push(current);
      current = { line: b.line, lastLine: b.line, text: b.text };
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs;
}

const files = SOURCE_DIRS.flatMap((d) => walk(d));
const errors = [];
let totalClaims = 0;

for (const file of files) {
  for (const p of extractCommentParagraphs(readFileSync(file, 'utf8'))) {
    const tags = [...p.text.matchAll(CLAIM_TAG)].map((m) => m[1]);
    totalClaims += tags.length;
    if (tags.length > 1) {
      errors.push(
        `${file}:${p.line} — multiple claim keywords (${tags.join(', ')}) in one comment paragraph.`,
      );
      continue;
    }
    const word = p.text.match(GUARANTEE_WORD);
    if (!word) continue;
    if (tags.length === 0) {
      errors.push(
        `${file}:${p.line} — bare guarantee word "${word[0]}" outside CHECKS:/PINS: ("${p.text.slice(0, 72)}…")`,
      );
    } else if (tags[0] === 'DOCUMENTS') {
      errors.push(
        `${file}:${p.line} — DOCUMENTS: carries no guarantee, but found "${word[0]}" ("${p.text.slice(0, 72)}…")`,
      );
    }
  }
}

if (files.length === 0 || totalClaims === 0) {
  console.error('guard-claims: selection or claim count is 0 — guard is vacuous.');
  process.exit(1);
}
if (errors.length > 0) {
  for (const e of errors) console.error(`guard-claims: ${e}`);
  console.error(`guard-claims: ${errors.length} violation(s).`);
  process.exit(1);
}
console.log(
  `guard-claims: OK (${files.length} files, ${totalClaims} claim(s), strict CHECKS/PINS/DOCUMENTS)`,
);
