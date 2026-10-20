// DOCUMENTS: stage-shape DOM writes, split from render.js by
// responsibility (guard-file-size): which cards and wire lanes are visible
// per stage, which card and wire lane carries the active hop, the crowd
// dots, and the compact browser nodes on the outer client ring. Zero
// engine knowledge: snapshots and layout geometry in, DOM writes out.
const $ = (id) => document.getElementById(id);

const LANES = {
  'packet-req-left': $('packet-req-left'),
  'packet-res-left': $('packet-res-left'),
  'packet-req-right': $('packet-req-right'),
  'packet-res-right': $('packet-res-right'),
  'packet-req-lb': $('packet-req-lb'),
  'packet-res-lb': $('packet-res-lb'),
  'packet-req-cache': $('packet-req-cache'),
  'packet-res-cache': $('packet-res-cache'),
};

// Stage-switch hook: viewport.js registers a callback so camera + world
// layout resync the moment the topology toggles.
let stageRenderedHook = null;

export function onStageRendered(fn) {
  stageRenderedHook = fn;
}

export function renderStageTopology(stage) {
  const hasLb = stage === 2 || stage === 3;
  const hasCache = stage === 3;
  $('node-lb').hidden = !hasLb;
  $('wire-lb-backends').hidden = !hasLb;
  $('node-webserver-2').hidden = !hasLb;
  $('node-cache').hidden = !hasCache;
  $('wire-servers-cache').hidden = !hasCache;
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
// lookup (Cache 10.20 answers) and the response emission.
function activeHopTarget(snapshot) {
  const hop = snapshot.trace?.hop ?? 0;
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
  for (const [id, node] of Object.entries(LANES)) {
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
