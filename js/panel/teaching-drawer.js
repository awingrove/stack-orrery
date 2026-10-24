// Teaching drawer UI (stage-teaching-drawer brief): the HUD toggle + the
// aside that renders the per-stage narrative from js/panel/teaching.js.
// Built in js rather than panel.html because that page sits at its 550-line
// cap; behavior stays addEventListener-only (AGENTS.md CSP rule) and all
// content comes from textContent/attributes — no inline styles, no innerHTML.
import { describeStageTeaching } from './teaching.js';

// CHECKS: the drawer renders the entry for the *current* stage — panel.js
// calls renderTeaching at boot and on every stage switch, so the stage-3
// cache headline appears exactly when stage 3 is active (on stage 1 it
// leaves the drawer; named counter-example pinned in e2e/teaching.spec.js).
// Stage switches reuse the same aside nodes, so the open state persists
// across switches within the page, and unknown stage keys render the pending
// note instead of blank sections or a crash.
let teachingPanel = null;

export function initTeachingDrawer() {
  const teachingToggle = document.createElement('button');
  teachingToggle.id = 'teaching-toggle';
  teachingToggle.dataset.testid = 'teaching-toggle';
  teachingToggle.type = 'button';
  teachingToggle.title = 'Open the per-stage teaching drawer';
  teachingToggle.setAttribute('aria-expanded', 'false');
  teachingToggle.setAttribute('aria-controls', 'teaching-panel');
  teachingToggle.textContent = 'Teach';
  document.getElementById('legend-toggle').after(teachingToggle);

  teachingPanel = document.createElement('aside');
  teachingPanel.id = 'teaching-panel';
  teachingPanel.dataset.testid = 'teaching-panel';
  teachingPanel.className = 'teaching-panel';
  teachingPanel.hidden = true; // closed by default: the first view is the orrery
  teachingPanel.setAttribute('aria-label', 'Teaching notes');
  document.getElementById('legend-panel').after(teachingPanel);

  teachingToggle.addEventListener('click', () => {
    const open = teachingPanel.hidden;
    teachingPanel.hidden = !open;
    teachingToggle.setAttribute('aria-expanded', String(open));
  });
}

function teachingNode(tag, className, text, testId) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (testId) node.dataset.testid = testId;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderTeaching(stage) {
  const entry = describeStageTeaching(stage);
  teachingPanel.replaceChildren();
  teachingPanel.append(teachingNode('h2', 'heading-section', entry.headline, 'teaching-headline'));
  const sections = [
    ['Teaches', entry.teaches, 'teaching-teaches'],
    ['Try', entry.try, 'teaching-try'],
    ['Watch for', entry.watchFor, 'teaching-watch-for'],
  ];
  // An entry with no lists is the pending placeholder: mirror its headline
  // with a named note so the drawer stays readable instead of blank.
  if (sections.every(([, items]) => items.length === 0)) {
    teachingPanel.append(
      teachingNode(
        'p',
        'teaching-pending',
        `Teaching notes for stage ${stage} are pending — the stage itself still runs.`,
        'teaching-pending',
      ),
    );
  }
  for (const [label, items, testId] of sections) {
    if (items.length === 0) continue;
    teachingPanel.append(
      teachingNode('p', 'teaching-list-title', label),
      teachingNode('ul', 'teaching-list', undefined, testId),
    );
    const list = teachingPanel.lastElementChild;
    for (const item of items) list.append(teachingNode('li', undefined, item));
  }
  teachingPanel.append(
    teachingNode('p', 'teaching-tradeoff', entry.tradeoff, 'teaching-tradeoff'),
    teachingNode('a', 'teaching-primer-link', entry.primerLink.label, 'teaching-primer-link'),
  );
  const link = teachingPanel.lastElementChild;
  link.href = entry.primerLink.url;
  link.target = '_blank';
  link.rel = 'noreferrer';
}
