// DOCUMENTS: compare tray (B-5) — the log-card's auto-pair diff of the two
// most recent completed trace runs. The slot/alignment logic is the pure
// model contract (nextCompareSlots, alignCompareRows in model.js); this
// module is DOM-bound only: it injects the tray into the existing .log-card,
// renders the stored pair verbatim, and exposes the push/clear API. panel.js
// is the only caller (completion branch pushes; switchStage clears); the
// module holds no engine access and no narrative of its own.
import { alignCompareRows, nextCompareSlots } from './model.js';

let slots = { a: null, b: null };
let tray = null;
let headline = null;
let rows = null;

// Boot injection, following the lazy-lookup precedent (renderDnsHud /
// stage6 cards): the tray is JS-built into the log-card that carries the
// #journey-log it mirrors — panel.html stays untouched.
export function initCompareTray() {
  const card = document.querySelector('.log-card');
  if (!card || document.getElementById('compare-tray')) return;
  tray = document.createElement('div');
  tray.id = 'compare-tray';
  tray.dataset.testid = 'compare-tray';
  tray.hidden = true;
  headline = document.createElement('p');
  headline.id = 'compare-headline';
  headline.dataset.testid = 'compare-headline';
  headline.className = 'compare-headline';
  rows = document.createElement('div');
  rows.id = 'compare-rows';
  rows.dataset.testid = 'compare-rows';
  rows.className = 'compare-rows';
  tray.replaceChildren(headline, rows);
  card.appendChild(tray);
  renderTray();
}

// CHECKS: the run's label comes from the run's OWN trace snapshot — the
// only descriptor that cannot be rewritten after completion. trace.js
// (stages 1-5) and trace-stage6.js both carry `path` on every hop state,
// stage 6 hosted paths additionally `host`, so a hosted run reads
// `example.com/about` and a host-less run reads its typed path (the
// URL-input fallback never fires: `snapshot.trace` is always present on
// the completion branch, which runs after at least one hop).
export function pushTraceRun(run, trace, entries) {
  pushCompareRun({
    run,
    label: trace?.host ? `${trace.host}${trace.path}` : (trace?.path ?? ''),
    hops: entries.length,
    entries,
  });
}

export function pushCompareRun(newRun) {
  const next = nextCompareSlots(slots, newRun);
  slots = { a: next.a, b: next.b };
  if (!next.changed) return;
  renderTray();
}

export function clearCompare() {
  slots = { a: null, b: null };
  renderTray();
}

// PINS: hidden/incomplete rule — zero or one stored run renders no tray at
// all (hidden, empty rows), never a half-populated diff. With two stored
// runs the headline is one exact string and the rows are verbatim
// journey-log entry texts (`n · left frame · right frame`, the em-dash
// where a side ended sooner) — the tray renders the snapshot the slots
// hold and writes nothing it has not been given.
function renderTray() {
  if (!tray) return;
  if (!slots.a || !slots.b) {
    headline.textContent = '';
    rows.replaceChildren();
    tray.hidden = true;
    return;
  }
  headline.textContent = `${slots.a.hops} vs ${slots.b.hops} hops · ${slots.a.label} vs ${slots.b.label}`;
  rows.replaceChildren(
    ...alignCompareRows(slots.a, slots.b).map((row) => {
      const item = document.createElement('div');
      item.className = 'compare-row';
      const n = document.createElement('span');
      n.className = 'compare-n';
      n.textContent = String(row.n);
      const left = document.createElement('span');
      left.className = 'compare-left';
      left.textContent = row.left;
      const right = document.createElement('span');
      right.className = 'compare-right';
      right.textContent = row.right;
      item.replaceChildren(n, left, right);
      return item;
    }),
  );
  tray.hidden = false;
}
