// DOCUMENTS: panel controller — wires the trace controls, the interactive
// mini-browser, node selection, and the crowd sim to the engine, then
// renders model labels into data-testid-annotated DOM. All behavior is
// attached with addEventListener only (no inline handlers — AGENTS.md CSP
// rule; the static server enforces it), and all DOM writes live here.
import { createEngine } from '../sim/engine.js';
import { describeSnapshot, TICK_MS } from './model.js';
import { COMPONENT_SOURCE, formatComponentState } from './inspector-source.js';

const $ = (id) => document.getElementById(id);

const els = {
  playRequest: $('btn-play-request'),
  nextHop: $('btn-next-hop'),
  hopStatus: $('hop-status'),
  method: $('req-method'),
  urlInput: $('url-input'),
  urlGo: $('btn-url-go'),
  statusBadge: $('browser-status-badge'),
  renderedBody: $('browser-rendered-body'),
  crowdCount: $('network-crowd-count'),
  lastFrame: $('network-last-frame'),
  queueList: $('server-queue-list'),
  queueBar: $('queue-bar'),
  inspectorTitle: $('inspector-title'),
  inspectorCode: $('inspector-code'),
  inspectorState: $('inspector-state'),
  journeyLog: $('journey-log'),
  exchange: $('exchange-inspector'),
};

const ROUTES = {
  'route-home': $('route-home'),
  'route-about': $('route-about'),
  'route-404': $('route-404'),
  'route-405': $('route-405'),
};

const LANES = {
  'packet-req-left': $('packet-req-left'),
  'packet-res-left': $('packet-res-left'),
  'packet-req-right': $('packet-req-right'),
  'packet-res-right': $('packet-res-right'),
};

// Which component executes each hop of the single-request trace.
const HOP_OWNER = { 1: 'node-browser', 2: 'node-network', 3: 'node-webserver', 4: 'node-browser' };
// Which outbound/return lane carries the packet at each hop.
const HOP_LANE = {
  1: 'packet-req-left',
  2: 'packet-req-right',
  3: 'packet-res-right',
  4: 'packet-res-left',
};

let engine = null;
let timer = null;
let selectedComponent = 'browser';
let currentSnapshot = null;

function createEngineFromControls() {
  return createEngine({
    seed: 42,
    users: Number($('users-slider').value),
    serviceRate: 4,
    arrivalProb: 0.5,
  });
}

function addToJourney(label, text) {
  // Reverse-chronological: newest entry first; skip exact repeats so
  // idle ticks do not flood the log with the same line.
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

function render(snapshot) {
  currentSnapshot = snapshot;
  const labels = describeSnapshot(snapshot);
  $('tick').textContent = labels.tick;
  $('queue-depth').textContent = labels.queueDepth;
  els.queueBar.style.width = labels.queueFill;
  $('latency').textContent = labels.latency;
  $('served').textContent = labels.served;
  $('users-count').textContent = labels.users;
  $('server-address').textContent = labels.serverAddress;
  els.exchange.textContent = labels.exchangeSummary;
  els.hopStatus.textContent = labels.hopStatus;
  els.crowdCount.textContent = `${labels.users} crowd browsers`;
  els.lastFrame.textContent = labels.networkLastFrame;
  els.renderedBody.textContent = labels.browserBody;
  els.statusBadge.textContent = labels.browserStatus;
  els.statusBadge.className = `status-badge${badgeClass(snapshot.browserDisplay)}`;
  renderQueue(snapshot.queue ?? []);
  renderRoutes(labels.matchedRouteId);
  renderHopsForTrace(snapshot);
  renderDots(snapshot.users);
  els.inspectorState.textContent = formatComponentState(snapshot, selectedComponent);
}

function badgeClass(display) {
  if (!display) return '';
  return display.status >= 200 && display.status < 400 ? ' status-200' : ' status-err';
}

function renderQueue(queue) {
  els.queueList.replaceChildren(
    ...queue.map((q) => {
      const pill = document.createElement('span');
      pill.className = `queue-pill${q.isYou ? ' you-pill' : ''}`;
      pill.textContent = `${q.from}: ${q.request}`;
      return pill;
    }),
  );
  if (queue.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'queue-empty-hint';
    hint.textContent = 'queue empty';
    els.queueList.replaceChildren(hint);
  }
}

function renderRoutes(matchedRouteId) {
  for (const [routeId, node] of Object.entries(ROUTES)) {
    node.classList.toggle('matched-route', routeId === matchedRouteId);
  }
}

function renderHopsForTrace(snapshot) {
  const hop = snapshot.trace?.hop ?? 0;
  for (const card of document.querySelectorAll('.node-card')) {
    card.classList.toggle('active-hop', card.id === HOP_OWNER[hop]);
    card.classList.toggle('selected-node', card.dataset.component === selectedComponent);
  }
  for (const [laneId, node] of Object.entries(LANES)) {
    node.classList.toggle('lane-active', laneId === HOP_LANE[hop]);
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

function renderInspector() {
  const source = COMPONENT_SOURCE[selectedComponent];
  els.inspectorTitle.textContent = source.title;
  els.inspectorCode.textContent = source.code;
  if (currentSnapshot) {
    els.inspectorState.textContent = formatComponentState(currentSnapshot, selectedComponent);
  }
}

function selectComponent(component) {
  if (!COMPONENT_SOURCE[component]) return;
  selectedComponent = component;
  renderInspector();
  for (const tab of document.querySelectorAll('.comp-tab')) {
    tab.classList.toggle('active-tab', tab.dataset.select === component);
  }
  for (const card of document.querySelectorAll('.node-card')) {
    card.classList.toggle('selected-node', card.dataset.component === component);
  }
}

function start() {
  timer = setInterval(() => {
    const snapshot = engine.step();
    if (snapshot.lastFrame) {
      addToJourney(`tick ${snapshot.tick}`, snapshot.lastFrame);
    }
    render(snapshot);
  }, TICK_MS);
  $('start-button').textContent = 'Pause';
}

function pause() {
  clearInterval(timer);
  timer = null;
  $('start-button').textContent = 'Start';
}

$('start-button').addEventListener('click', () => {
  if (timer) pause();
  else start();
});

$('step-button').addEventListener('click', () => {
  if (timer) pause();
  const snapshot = engine.step();
  if (snapshot.lastFrame) addToJourney(`tick ${snapshot.tick}`, snapshot.lastFrame);
  render(snapshot);
});

$('users-slider').addEventListener('input', () => {
  engine.setUsers(Number($('users-slider').value));
  render(engine.snapshot());
});

// Single hop of the trace; the engine moves the request one stage per call.
function stepOneHop() {
  const snapshot = engine.traceHop({
    method: els.method.value,
    path: els.urlInput.value,
  });
  addToJourney(`hop ${snapshot.trace.hop}/4`, snapshot.lastFrame);
  render(snapshot);
  return snapshot;
}

$('btn-next-hop').addEventListener('click', stepOneHop);

$('btn-play-request').addEventListener('click', () => {
  if (timer) pause(); // a manual trace does not run alongside the crowd timer
  const iv = setInterval(() => {
    if (stepOneHop().trace.hop === 4) clearInterval(iv);
  }, TICK_MS);
});

$('btn-url-go').addEventListener('click', () => {
  if (timer) pause();
  // Run the whole 4-hop trace now: at most 4 moves from idle, 4 from hop 4.
  for (let i = 0; i < 5; i += 1) {
    if (stepOneHop().trace.hop === 4) break;
  }
});

document.querySelectorAll('.path-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    els.method.value = chip.dataset.method;
    els.urlInput.value = chip.dataset.path;
  });
});

// Clicking a node card selects it in the bottom inspector (clicks on the
// mini-browser's own inputs/select/buttons stay with those controls).
document.querySelectorAll('.node-card').forEach((card) => {
  card.addEventListener('click', (e) => {
    if (e.target.closest('input, select, button')) return;
    selectComponent(card.dataset.component);
  });
});

document.querySelectorAll('.comp-tab').forEach((tab) => {
  tab.addEventListener('click', () => selectComponent(tab.dataset.select));
});

// Boot: engine eagerly exists so the inspector shows real internal state;
// the initial paint is an idle snapshot with nothing served.
engine = createEngineFromControls();
selectComponent('browser');
render(engine.snapshot());
