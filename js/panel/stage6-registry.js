// Stage-6 topology DOM (stage6a brief): the DNS card, the Router card, their
// two wire columns, and the two inspector tabs. Injected from js rather than
// panel.html because that page sits at its 550-line cap (teaching-drawer.js
// precedent). Behavior stays addEventListener-only elsewhere (AGENTS.md CSP
// rule) and all content comes from textContent/attributes — no innerHTML.
// CHECKS: ensureStage6Dom runs once at panel-boot (before panel.js's wiring
// loops call renderStageTopology), so the injected ids exist by the first
// render; calling it twice must not duplicate the registry (idempotent guard
// below).

let injected = false;

export function ensureStage6Dom() {
  if (injected) return;
  injected = true;
  const world = document.getElementById('orrery-world');

  world.append(
    wireColumn('wire-router', [
      ['packet-req-router', 'route =>'],
      ['packet-res-router', '<- via router'],
    ]),
    nodeCard('node-router', 'router', 'Router', 'cross-subnet gateway', '10.65 ⇄ 20.1', [
      ['p', 'router-stats', 'Router 10.65 ⇄ 20.1 · Routed: 0'],
    ]),
    wireColumn('wire-dns', [
      ['packet-req-dns', 'who is? =>'],
      ['packet-res-dns', '<- answer'],
    ]),
    nodeCard('node-dns', 'dns', 'DNS', 'authoritative ledger', '10.60', [
      ['p', 'dns-stats', 'Lookups: 0 · Cached: 0 · Authoritative: 0 · TTL: 300t'],
      ['ul', 'dns-entries-list'],
    ]),
  );

  const tabs = document.querySelector('.comp-tabs');
  for (const [key, label] of [
    ['dns', 'dns'],
    ['router', 'router'],
  ]) {
    const tab = document.createElement('button');
    tab.className = 'comp-tab';
    tab.type = 'button';
    tab.dataset.select = key;
    tab.textContent = label;
    tabs.append(tab);
  }
}

function nodeCard(id, component, name, subtitle, addressChip, bodyNodes) {
  const card = document.createElement('article');
  card.id = id;
  card.dataset.testid = id;
  card.dataset.component = component;
  card.className = 'node-card';
  card.hidden = true;
  const head = document.createElement('header');
  head.className = 'node-head';
  const nameBox = document.createElement('div');
  nameBox.className = 'node-name';
  const role = document.createElement('span');
  role.className = 'role-name';
  role.textContent = name;
  const sub = document.createElement('span');
  sub.className = 'node-subtitle';
  sub.textContent = subtitle;
  nameBox.append(role, sub);
  const chip = document.createElement('span');
  chip.className = 'ip-chip';
  chip.textContent = addressChip;
  const code = document.createElement('span');
  code.className = 'code-chip';
  code.textContent = '</> Code';
  head.append(nameBox, chip, code);
  card.append(head);
  for (const [tag, nodeId] of bodyNodes) {
    const node = document.createElement(tag);
    node.id = nodeId;
    node.dataset.testid = nodeId;
    if (tag === 'p') {
      node.className = 'mono last-frame';
      node.textContent = firstText(nodeId);
    } else {
      node.className = 'route-list';
      node.setAttribute('aria-label', 'Entries');
    }
    card.append(node);
  }
  return card;
}

const FIRST_TEXT = {
  'dns-stats': 'Lookups: 0 · Cached: 0 · Authoritative: 0 · TTL: 300t',
  'router-stats': 'Router 10.65 ⇄ 20.1 · Routed: 0',
};

function firstText(nodeId) {
  return FIRST_TEXT[nodeId] ?? '';
}

function wireColumn(id, lanes) {
  const column = document.createElement('div');
  column.id = id;
  column.className = 'wire-column';
  column.setAttribute('aria-hidden', 'true');
  column.hidden = true;
  for (const [laneId, text] of lanes) {
    const lane = document.createElement('div');
    lane.id = laneId;
    lane.className = 'wire-lane';
    lane.textContent = text;
    column.append(lane);
  }
  return column;
}
