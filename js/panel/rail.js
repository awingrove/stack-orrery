// DOCUMENTS: the control-room rail (Stage R1 brief,
// docs/plans/2026-10-26-style2-control-room-remodel.md) — the page-level
// right rail that docks the teaching drawer, the missions section, and the
// legend drawer beside the orrery plane, one surface visible at a time. The
// module owns the railTab state ('teach' | 'missions' | 'legend', default
// 'teach'), the tab chrome, and the per-host empty-state lines. It holds no
// engine access — the camera and the snapshot pipeline stay with panel.js;
// the plane's geometry is page-level CSS only (css/panel/rail.css owns the
// two-zone grid and the 1100px stacking breakpoint). Rail chrome is JS-built
// because panel.html sits at its 550-line cap; the static #legend-panel is
// the one moved node (re-parented INTO its host, testids intact — the
// mountpoint precedent from the compare tray). All behavior is
// addEventListener-only and content writes are textContent/attributes —
// strict CSP (AGENTS.md).
const TABS = ['teach', 'missions', 'legend'];
const RAIL_EMPTY = {
  teach: 'Teaching notes closed — press Teach in the camera HUD.',
  missions: 'No missions registered for this stage.',
  legend: 'Legend closed — press Legend in the camera HUD.',
};

let railTab = 'teach';
let rail = null;
const hosts = new Map(); // tab -> .rail-host section node
const tabs = new Map(); // tab -> .rail-tab button node

function surfaceOf(tab) {
  const el = hosts.get(tab)?.querySelector('.teaching-panel, .legend-panel, .missions-section');
  return Boolean(el && !el.hidden); // a closed panel yields to the empty line
}

// CHECKS: an active host whose surface is closed (or a stage with no
// missions) shows its empty-state line instead of blanking the rail; hosts
// that are simply not the active tab hide whole. The surface-toggling
// modules (teaching-drawer, missions-view) call this after they flip a
// panel's hidden flag or rebuild their section.
export function refreshRail() {
  if (!rail) return;
  for (const tab of TABS) {
    const empty = hosts.get(tab)?.querySelector('.rail-empty');
    if (empty) empty.hidden = Boolean(surfaceOf(tab));
  }
}

// CHECKS: switching tabs only rewrites the rail's own DOM — no camera call,
// no engine/pipeline touch (auto-refit and syncLayout stay with panel.js).
export function setRailTab(tab) {
  if (!TABS.includes(tab)) return; // unknown tab is a no-op, not a crash
  railTab = tab;
  for (const key of TABS) {
    const host = hosts.get(key);
    const button = tabs.get(key);
    if (!host || !button) continue;
    host.hidden = key !== railTab;
    button.classList.toggle('rail-tab-active', key === railTab);
    button.setAttribute('aria-selected', String(key === railTab));
  }
  refreshRail();
}

export function getRailHost(tab) {
  return rail ? (hosts.get(tab) ?? null) : null;
}

function buildChrome() {
  rail = document.createElement('aside');
  rail.id = 'rail';
  rail.dataset.testid = 'rail';
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Control-room rail');
  const tablist = document.createElement('div');
  tablist.className = 'rail-tabs';
  tablist.setAttribute('role', 'tablist');
  tablist.setAttribute('aria-label', 'Docked rail surfaces');
  const railHosts = document.createElement('div');
  railHosts.className = 'rail-hosts';
  for (const tab of TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rail-tab';
    button.dataset.testid = `rail-tab-${tab}`;
    button.dataset.railTab = tab;
    button.textContent = tab === 'teach' ? 'Teach' : `${tab[0].toUpperCase()}${tab.slice(1)}`;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => setRailTab(tab));
    tablist.append(button);
    tabs.set(tab, button);
    const host = document.createElement('section');
    host.className = 'rail-host';
    host.dataset.railHost = tab;
    host.setAttribute('aria-label', `Docked ${tab} surface`);
    const empty = document.createElement('p');
    empty.className = 'rail-empty';
    empty.textContent = RAIL_EMPTY[tab];
    host.append(empty);
    railHosts.append(host);
    hosts.set(tab, host);
  }
  rail.append(tablist, railHosts);
}

export function initRail() {
  if (document.getElementById('rail')) return;
  buildChrome();
  document.getElementById('orrery-viewport')?.after(rail);
  // Move, don't rewrite: the static legend aside keeps its own testids and
  // content — the rail only re-parents it into the legend host.
  const legend = document.getElementById('legend-panel');
  if (legend) hosts.get('legend').append(legend);
  // The HUD's #legend-toggle stays in its camera-HUD slot and drives the
  // rail state: open docks the legend surface; closing flips the panel's
  // hidden flag (the pinned panel.spec toggle) and leaves the tab on legend.
  const legendToggle = document.getElementById('legend-toggle');
  legendToggle?.addEventListener('click', () => {
    const panel = document.getElementById('legend-panel');
    const open = panel.hidden;
    panel.hidden = !open;
    legendToggle.setAttribute('aria-expanded', String(open));
    if (open) setRailTab('legend');
    refreshRail();
  });
  setRailTab(railTab); // paints the default tab once chrome exists
}
