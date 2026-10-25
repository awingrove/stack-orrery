// DOCUMENTS: stage-shape DOM writes, split from render.js by
// responsibility (guard-file-size): which cards and wire lanes are visible
// per stage, the crowd dots, the active-hop DOM writes, and the compact
// browser nodes on the outer client ring. Zero engine knowledge: snapshots
// and layout geometry in, DOM writes out; the hop → (card, lane) id
// mapping itself lives in hop-targets.js.
import { activeHopTarget } from './hop-targets.js';

const $ = (id) => document.getElementById(id);

// CHECKS: lane lookups are lazy — the stage-6 cards/columns are JS-injected
// by stage6-registry.js after this module loads, so a module-scope grab would
// hold nulls. Each call re-reads the current DOM.
let laneCache = null;
function laneEls() {
  if (laneCache) return laneCache;
  const lane = (id) => document.getElementById(id);
  laneCache = {
    'packet-req-left': lane('packet-req-left'),
    'packet-res-left': lane('packet-res-left'),
    'packet-req-right': lane('packet-req-right'),
    'packet-res-right': lane('packet-res-right'),
    'packet-req-lb': lane('packet-req-lb'),
    'packet-res-lb': lane('packet-res-lb'),
    'packet-req-cache': lane('packet-req-cache'),
    'packet-res-cache': lane('packet-res-cache'),
    'packet-req-db': lane('packet-req-db'),
    'packet-res-db': lane('packet-res-db'),
    'packet-req-queue': lane('packet-req-queue'),
    'packet-res-queue': lane('packet-res-queue'),
    'packet-req-worker': lane('packet-req-worker'),
    'packet-res-worker': lane('packet-res-worker'),
    'packet-req-dns': lane('packet-req-dns'),
    'packet-res-dns': lane('packet-res-dns'),
    'packet-req-router': lane('packet-req-router'),
    'packet-res-router': lane('packet-res-router'),
    'packet-req-cdn': lane('packet-req-cdn'),
    'packet-res-cdn': lane('packet-res-cdn'),
  };
  for (const [id, node] of Object.entries(laneCache)) {
    if (!node) delete laneCache[id];
  }
  return laneCache;
}

// Stage-switch hook: viewport.js registers a callback so camera + world
// layout resync the moment the topology toggles.
let stageRenderedHook = null;

export function onStageRendered(fn) {
  stageRenderedHook = fn;
}

export function renderStageTopology(stage) {
  const hasLb = stage >= 2;
  const hasCache = stage >= 3;
  const hasDb = stage >= 4;
  const hasWorkers = stage >= 5;
  const hasCrossNet = stage >= 6;
  $('node-lb').hidden = !hasLb;
  $('wire-lb-backends').hidden = !hasLb;
  $('node-webserver-2').hidden = !hasLb;
  $('node-cache').hidden = !hasCache;
  $('wire-servers-cache').hidden = !hasCache;
  $('node-db').hidden = !hasDb;
  $('wire-cache-db').hidden = !hasDb;
  $('node-queue').hidden = !hasWorkers;
  $('wire-cache-queue').hidden = !hasWorkers;
  $('node-worker').hidden = !hasWorkers;
  $('wire-queue-worker').hidden = !hasWorkers;
  // Stage 6: the DNS ledger card + its browser wire column, the Router
  // card + its hub wire column (10.65 ⇄ 20.254 gateway lane), and the
  // Stage 6b CDN edge card + its browser wire column (20.1 edge lane).
  $('node-dns').hidden = !hasCrossNet;
  $('node-router').hidden = !hasCrossNet;
  $('node-cdn').hidden = !hasCrossNet;
  const dnsColumn = $('wire-dns');
  if (dnsColumn) dnsColumn.hidden = !hasCrossNet;
  const routerColumn = $('wire-router');
  if (routerColumn) routerColumn.hidden = !hasCrossNet;
  const cdnColumn = $('wire-cdn');
  if (cdnColumn) cdnColumn.hidden = !hasCrossNet;
  $('network-role-10-1').textContent = hasLb ? 'LoadBalancer -> 10.11, 10.12' : 'WebServer';
  for (const pill of document.querySelectorAll('.stage-pill[data-stage]')) {
    const active = Number(pill.dataset.stage) === stage;
    pill.classList.toggle('active-stage', active);
    if (active) pill.setAttribute('aria-current', 'true');
    else pill.removeAttribute('aria-current');
  }
  if (stageRenderedHook) stageRenderedHook(stage);
}

export function renderHopHighlights(snapshot, selectedComponent) {
  const { cardId, laneId } = activeHopTarget(snapshot);
  for (const card of document.querySelectorAll('.node-card')) {
    card.classList.toggle('active-hop', card.id === cardId);
    card.classList.toggle('selected-node', card.dataset.component === selectedComponent);
  }
  for (const [id, node] of Object.entries(laneEls())) {
    node.classList.toggle('lane-active', id === laneId);
  }
}

export function renderDots(n) {
  $('user-dots').replaceChildren(
    ...Array.from({ length: n }, () => {
      const dot = document.createElement('span');
      dot.className = 'user-dot';
      return dot;
    }),
  );
}

// CHECKS: compact outer-ring browser nodes rebuild from the layout's
// browser slots so a re-spaced or re-populated ring leaves no stale or
// ghost buttons behind.
export function renderRingBrowsers(slots, activeAddress) {
  const ring = $('browser-ring-nodes');
  if (!ring) return;
  ring.replaceChildren(
    ...slots
      .filter((slot) => slot.address !== activeAddress)
      .map((slot) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'browser-compact';
        button.dataset.testid = `browser-node-${slot.address}`;
        button.dataset.address = slot.address;
        button.style.left = `${slot.x}px`;
        button.style.top = `${slot.y}px`;
        const chip = document.createElement('span');
        chip.className = 'ip-chip';
        chip.textContent = slot.address;
        const status = document.createElement('span');
        status.className = 'browser-compact-status';
        status.textContent = slot.lastDisplay ? String(slot.lastDisplay.status) : 'idle';
        button.replaceChildren(chip, status);
        return button;
      }),
  );
}
