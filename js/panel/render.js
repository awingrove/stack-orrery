// DOCUMENTS: panel DOM renderer — translates engine snapshots and model
// labels into DOM updates (queues, route tables, hop highlights, load
// balancer backend counters, and inspector panes). Separating DOM writes
// from event wiring in panel.js keeps both modules focused and concise.
import { describeSnapshot } from './model.js';
import { COMPONENT_SOURCE, formatComponentState } from './inspector-source.js';

export const $ = (id) => document.getElementById(id);

export const els = {
  playRequest: $('btn-play-request'),
  nextHop: $('btn-next-hop'),
  hopStatus: $('hop-status'),
  method: $('req-method'),
  urlInput: $('url-input'),
  urlGo: $('btn-url-go'),
  statusBadge: $('browser-status-badge'),
  renderedBody: $('browser-rendered-body'),
  netRole101: $('network-role-10-1'),
  crowdCount: $('network-crowd-count'),
  lastFrame: $('network-last-frame'),
  nodeLb: $('node-lb'),
  wireLb: $('wire-lb-backends'),
  lbNext: $('lb-next-backend'),
  lbBackend1: $('lb-backend-1'),
  lbBackend2: $('lb-backend-2'),
  serverIpChip: $('server-ip-chip'),
  queueList: $('server-queue-list'),
  queueBar: $('queue-bar'),
  nodeServer2: $('node-webserver-2'),
  server2Address: $('server-2-address'),
  queueList2: $('server-2-queue-list'),
  queueBar2: $('queue-bar-2'),
  inspectorTitle: $('inspector-title'),
  inspectorCode: $('inspector-code'),
  inspectorState: $('inspector-state'),
  journeyLog: $('journey-log'),
  exchange: $('exchange-inspector'),
};

const LANES = {
  'packet-req-left': $('packet-req-left'),
  'packet-res-left': $('packet-res-left'),
  'packet-req-right': $('packet-req-right'),
  'packet-res-right': $('packet-res-right'),
  'packet-req-lb': $('packet-req-lb'),
  'packet-res-lb': $('packet-res-lb'),
};

export function addToJourney(label, text) {
  if (els.journeyLog.firstElementChild && els.journeyLog.firstElementChild.dataset.text === text) {
    return;
  }
  const item = document.createElement('li');
  item.className = 'journey-entry';
  item.textContent = `${label} · ${text}`;
  item.dataset.text = text;
  els.journeyLog.prepend(item);
  while (els.journeyLog.children.length > 20) els.journeyLog.lastElementChild.remove();
}

// Stage-switch hook: viewport.js registers a callback so camera + world layout
// resync the moment the topology toggles (keeps render.js DOM-only).
let stageRenderedHook = null;

export function onStageRendered(fn) {
  stageRenderedHook = fn;
}

export function renderStageTopology(stage) {
  const isStage2 = stage === 2;
  els.nodeLb.hidden = !isStage2;
  els.wireLb.hidden = !isStage2;
  els.nodeServer2.hidden = !isStage2;
  els.netRole101.textContent = isStage2 ? 'LoadBalancer -> 10.11, 10.12' : 'WebServer';
  for (const pill of document.querySelectorAll('.stage-pill[data-stage]')) {
    const active = Number(pill.dataset.stage) === stage;
    pill.classList.toggle('active-stage', active);
    if (active) pill.setAttribute('aria-current', 'true');
    else pill.removeAttribute('aria-current');
  }
  if (stageRenderedHook) stageRenderedHook(stage);
}

function badgeClass(display) {
  if (!display) return '';
  return display.status >= 200 && display.status < 400 ? ' status-200' : ' status-err';
}

function renderQueueInto(container, queue) {
  if (queue.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'queue-empty-hint';
    hint.textContent = 'queue empty';
    container.replaceChildren(hint);
    return;
  }
  container.replaceChildren(
    ...queue.map((q) => {
      const pill = document.createElement('span');
      pill.className = `queue-pill${q.isYou ? ' you-pill' : ''}`;
      pill.textContent = `${q.from}: ${q.request}`;
      return pill;
    }),
  );
}

function renderRoutes(matchedRouteId, snapshot) {
  const servedBy2 = snapshot.stage === 2 && snapshot.lastExchange?.to === '10.12';
  for (const node of document.querySelectorAll('[data-file]')) {
    node.classList.toggle('matched-route', !servedBy2 && node.dataset.file === matchedRouteId);
  }
  for (const node of document.querySelectorAll('[data-file-2]')) {
    node.classList.toggle('matched-route', servedBy2 && node.dataset.file2 === matchedRouteId);
  }
}

function activeHopTarget(snapshot) {
  const hop = snapshot.trace?.hop ?? 0;
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

function renderHopsForTrace(snapshot, selectedComponent) {
  const { cardId, laneId } = activeHopTarget(snapshot);
  for (const card of document.querySelectorAll('.node-card')) {
    card.classList.toggle('active-hop', card.id === cardId);
    card.classList.toggle('selected-node', card.dataset.component === selectedComponent);
  }
  for (const [id, node] of Object.entries(LANES)) {
    node.classList.toggle('lane-active', id === laneId);
  }
}

function renderDots(n) {
  $('user-dots').replaceChildren(
    ...Array.from({ length: n }, () => {
      const dot = document.createElement('span');
      dot.className = 'user-dot';
      return dot;
    }),
  );
}

export function renderInspector(selectedComponent, currentSnapshot) {
  const source = COMPONENT_SOURCE[selectedComponent];
  els.inspectorTitle.textContent = source.title;
  els.inspectorCode.textContent = source.code;
  if (currentSnapshot) {
    els.inspectorState.textContent = formatComponentState(currentSnapshot, selectedComponent);
  }
}

export function render(snapshot, selectedComponent) {
  const labels = describeSnapshot(snapshot);
  $('tick').textContent = labels.tick;
  $('queue-depth').textContent = labels.queueDepth;
  els.queueBar.style.width = labels.queueFill1;
  $('latency').textContent = labels.latency;
  $('served').textContent = labels.served;
  $('users-count').textContent = labels.users;
  $('server-address').textContent = labels.server1Address;
  els.serverIpChip.textContent = labels.server1Address;
  els.exchange.textContent = labels.exchangeSummary;
  els.hopStatus.textContent = labels.hopStatus;
  els.crowdCount.textContent = `${labels.users} crowd browsers`;
  els.lastFrame.textContent = labels.networkLastFrame;
  els.renderedBody.textContent = labels.browserBody;
  els.statusBadge.textContent = labels.browserStatus;
  els.statusBadge.className = `status-badge${badgeClass(snapshot.browserDisplay)}`;
  renderQueueInto(els.queueList, snapshot.queue ?? []);
  if (snapshot.stage === 2) {
    els.server2Address.textContent = labels.server2Address;
    els.queueBar2.style.width = labels.queueFill2;
    renderQueueInto(els.queueList2, snapshot.servers?.[1]?.queue ?? []);
    els.lbNext.textContent = labels.lbNextBackend;
    els.lbBackend1.textContent = labels.lbBackend1Label;
    els.lbBackend2.textContent = labels.lbBackend2Label;
    const lastTarget = snapshot.loadBalancer?.lastTarget;
    els.lbBackend1.classList.toggle('matched-route', lastTarget === '10.11');
    els.lbBackend2.classList.toggle('matched-route', lastTarget === '10.12');
  }
  renderRoutes(labels.matchedRouteId, snapshot);
  renderHopsForTrace(snapshot, selectedComponent);
  renderDots(snapshot.users);
  els.inspectorState.textContent = formatComponentState(snapshot, selectedComponent);
}
