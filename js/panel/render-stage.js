// DOCUMENTS: stage-shape DOM writes, split from render.js by
// responsibility (guard-file-size): which cards and wire lanes are visible
// per stage, which card and wire lane carries the active hop, the crowd
// dots, and the compact browser nodes on the outer client ring. Zero
// engine knowledge: snapshots and layout geometry in, DOM writes out.
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
  // Stage 6: the DNS ledger card + its browser wire column, and the Router
  // card + its hub wire column (10.65 ⇄ 20.1 gateway lane).
  $('node-dns').hidden = !hasCrossNet;
  $('node-router').hidden = !hasCrossNet;
  const dnsColumn = $('wire-dns');
  if (dnsColumn) dnsColumn.hidden = !hasCrossNet;
  const routerColumn = $('wire-router');
  if (routerColumn) routerColumn.hidden = !hasCrossNet;
  $('network-role-10-1').textContent = hasLb ? 'LoadBalancer -> 10.11, 10.12' : 'WebServer';
  for (const pill of document.querySelectorAll('.stage-pill[data-stage]')) {
    const active = Number(pill.dataset.stage) === stage;
    pill.classList.toggle('active-stage', active);
    if (active) pill.setAttribute('aria-current', 'true');
    else pill.removeAttribute('aria-current');
  }
  if (stageRenderedHook) stageRenderedHook(stage);
}

// Which card executes the hop, and which wire lane carries it:
// Stage 1 is emit / route / serve / render; Stage 2 inserts the LB's
// round-robin pick; Stage 3 splits the backend serve into the cache
// lookup (Cache 10.20 answers) and the response emission; Stage 4 adds
// the database hop; Stage 5 adds async worker queue processing. Stage 6
// re-uses this stage-5 mapping (host-less verbatim; hosted hops > 2 off by
// exactly the +2 DNS prelude) and owns its hops 1-2 below.
function stage5HopTarget(snapshot, hop) {
  const backendCard =
    snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
  const dbLane = snapshot.trace?.dbOp === 'WRITE' ? 'packet-req-db' : 'packet-res-db';
  const owners = snapshot.trace?.asyncJob
    ? {
        1: 'node-browser',
        2: 'node-network',
        3: 'node-lb',
        4: 'node-queue',
        5: 'node-webserver',
        6: 'node-network',
        7: 'node-browser',
        8: 'node-worker',
      }
    : {
        1: 'node-browser',
        2: 'node-network',
        3: 'node-lb',
        4: 'node-db',
        5: backendCard,
        6: 'node-network',
        7: 'node-browser',
        8: 'node-worker',
      };
  const lanes = snapshot.trace?.asyncJob
    ? {
        1: 'packet-req-left',
        2: 'packet-req-right',
        3: 'packet-req-lb',
        4: 'packet-req-queue',
        5: 'packet-res-cache',
        6: 'packet-res-right',
        7: 'packet-res-left',
        8: 'packet-res-db',
      }
    : {
        1: 'packet-req-left',
        2: 'packet-req-right',
        3: 'packet-req-lb',
        4: dbLane,
        5: 'packet-res-cache',
        6: 'packet-res-right',
        7: 'packet-res-left',
        8: 'packet-res-worker',
      };
  return { cardId: owners[hop] ?? 'node-browser', laneId: lanes[hop] ?? 'packet-req-left' };
}

function activeHopTarget(snapshot) {
  const hop = snapshot.trace?.hop ?? 0;
  if (snapshot.stage === 6) {
    if (!snapshot.trace?.host) return stage5HopTarget(snapshot, hop);
    if (hop <= 2) {
      // Hops 1-2 of the hosted shape: the browser asks DNS 10.60 and the
      // ledger answers on its wire lane; NX and resolved answers share the
      // lanes (both write the packet-res-dns answer lane at hop 2). There
      // is no card highlight before hop 1's ask — no GET exists on the wire
      // yet.
      const owners = { 1: 'node-dns', 2: 'node-browser' };
      const lanes = { 1: 'packet-req-dns', 2: 'packet-res-dns' };
      return { cardId: owners[hop], laneId: lanes[hop] };
    }
    // The resolved chain replays the stage-5 cards two hops deeper.
    return stage5HopTarget(snapshot, hop - 2);
  }
  if (snapshot.stage === 5) {
    return stage5HopTarget(snapshot, hop);
  }
  if (snapshot.stage === 4) {
    const backendCard =
      snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
    const dbLane = snapshot.trace?.dbOp === 'WRITE' ? 'packet-req-db' : 'packet-res-db';
    const owners = {
      1: 'node-browser',
      2: 'node-network',
      3: 'node-lb',
      4: 'node-cache',
      5: 'node-db',
      6: backendCard,
      7: 'node-browser',
    };
    const lanes = {
      1: 'packet-req-left',
      2: 'packet-req-right',
      3: 'packet-req-lb',
      4: 'packet-req-cache',
      5: dbLane,
      6: 'packet-res-cache',
      7: 'packet-res-left',
    };
    return { cardId: owners[hop], laneId: lanes[hop] };
  }
  if (snapshot.stage === 3) {
    const backendCard =
      snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
    const owners = {
      1: 'node-browser',
      2: 'node-network',
      3: 'node-lb',
      4: 'node-cache',
      5: backendCard,
      6: 'node-browser',
    };
    const lanes = {
      1: 'packet-req-left',
      2: 'packet-req-right',
      3: 'packet-req-lb',
      4: 'packet-req-cache',
      5: 'packet-res-cache',
      6: 'packet-res-left',
    };
    return { cardId: owners[hop], laneId: lanes[hop] };
  }
  if (snapshot.stage === 2) {
    const backendCard =
      snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
    const owners = {
      1: 'node-browser',
      2: 'node-network',
      3: 'node-lb',
      4: backendCard,
      5: 'node-browser',
    };
    const lanes = {
      1: 'packet-req-left',
      2: 'packet-req-right',
      3: 'packet-req-lb',
      4: 'packet-res-lb',
      5: 'packet-res-left',
    };
    return { cardId: owners[hop], laneId: lanes[hop] };
  }
  const owners = { 1: 'node-browser', 2: 'node-network', 3: 'node-webserver', 4: 'node-browser' };
  const lanes = {
    1: 'packet-req-left',
    2: 'packet-req-right',
    3: 'packet-res-right',
    4: 'packet-res-left',
  };
  return { cardId: owners[hop], laneId: lanes[hop] };
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
