// DOCUMENTS: panel DOM renderer — translates engine snapshots and model
// labels into DOM updates (queues, route tables, cache entries, load
// balancer backend counters, and inspector panes). Stage topology and hop
// highlights live in render-stage.js; event wiring in panel.js.
import { describeSnapshot, orderJourneyEntries } from './model.js';
import { COMPONENT_SOURCE } from './inspector-source.js';
import { componentTitle, formatComponentState } from './inspector-state.js';
import { renderHopHighlights, renderDots, renderRingBrowsers } from './render-stage.js';

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
  browserRoleName: $('browser-role-name'),
  browserIpChip: $('browser-ip-chip'),
  crowdCount: $('network-crowd-count'),
  lastFrame: $('network-last-frame'),
  lbNext: $('lb-next-backend'),
  lbBackend1: $('lb-backend-1'),
  lbBackend2: $('lb-backend-2'),
  serverIpChip: $('server-ip-chip'),
  queueList: $('server-queue-list'),
  queueBar: $('queue-bar'),
  server2Address: $('server-2-address'),
  queueList2: $('server-2-queue-list'),
  queueBar2: $('queue-bar-2'),
  cacheStats: $('cache-stats'),
  cacheEntries: $('cache-entries-list'),
  dbStats: $('db-stats'),
  dbRows: $('db-rows-list'),
  queueStats: $('queue-stats'),
  queueJobs: $('queue-jobs-list'),
  workerStats: $('worker-stats'),
  inspectorTitle: $('inspector-title'),
  inspectorCode: $('inspector-code'),
  inspectorState: $('inspector-state'),
  journeyLog: $('journey-log'),
  exchange: $('exchange-inspector'),
};

// PINS: journey-log chronology — the entries render newest-run-first and,
// inside one run, hop-ascending regardless of emission order; the ordering
// is the pure contract in model.js (orderJourneyEntries). The cap keeps the
// 20 newest entries (bottom tail trimmed), like the previous DOM trim, and
// the consecutive-emission dedupe (same label + text emitted twice in a row)
// stays: the duplicate frame is not logged (the render test pins ordering).
const JOURNEY_CAP = 20;
let journeyEntries = [];
let lastEmitted = null;

export function addToJourney(label, text, { run = 0, hop = 0 } = {}) {
  if (lastEmitted && lastEmitted.label === label && lastEmitted.text === text) return;
  lastEmitted = { label, text };
  journeyEntries = orderJourneyEntries(journeyEntries, { label, text, run, hop }).slice(
    0,
    JOURNEY_CAP,
  );
  els.journeyLog.replaceChildren(
    ...journeyEntries.map((entry) => {
      const item = document.createElement('li');
      item.className = 'journey-entry';
      item.textContent = `${entry.label} · ${entry.text}`;
      return item;
    }),
  );
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
  const behindLb = snapshot.stage >= 2;
  const servedBy2 = behindLb && snapshot.lastExchange?.to === '10.12';
  for (const node of document.querySelectorAll('[data-file]')) {
    node.classList.toggle('matched-route', !servedBy2 && node.dataset.file === matchedRouteId);
  }
  for (const node of document.querySelectorAll('[data-file-2]')) {
    node.classList.toggle('matched-route', servedBy2 && node.dataset.file2 === matchedRouteId);
  }
}

// DOCUMENTS: cache entries (Stage 3) render one row per live cached key with
// its remaining TTL in ticks — the Map on screen rather than an aggregate hit rate.
function renderCacheEntries(entries) {
  els.cacheEntries.replaceChildren(
    ...entries.map((e) => {
      const item = document.createElement('li');
      item.className = 'route-item';
      item.textContent = `${e.key} · ttl ${e.ttlRemaining}t`;
      return item;
    }),
  );
}

// DOCUMENTS: database rows (Stage 4) render one row per primary key with
// both sides' versions; a row whose Replica lags Primary carries .you-pill
// until async replication completes (DESIGN.md db-rows-list).
function renderDbRows(rows) {
  els.dbRows.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement('li');
      item.className = `route-item${row.lagging ? ' you-pill' : ''}`;
      item.textContent = `${row.key} · P v${row.primaryVersion} · R v${row.replicaVersion}`;
      return item;
    }),
  );
}

// DOCUMENTS: Stage 5 worker-queue jobs render one row per pending job with
// its enqueue tick; the queue stats and worker HUD mirror the counters and
// the active job (DESIGN.md queue-jobs-list).
function renderJobsInto(container, jobs) {
  container.replaceChildren(
    ...jobs.map((job) => {
      const item = document.createElement('li');
      item.className = 'route-item';
      item.textContent = `#${job.jobId} · ${job.path} · queued @ tick ${job.queuedAtTick}`;
      return item;
    }),
  );
}

function activeBrowserDisplay(snapshot, activeAddress) {
  const browsers = Array.isArray(snapshot.browsers) ? snapshot.browsers : [];
  const slot = browsers.find((b) => b.address === activeAddress) ?? browsers[0] ?? null;
  // The learner's own interactive browser keeps its dedicated clientBrowser
  // state on the snapshot; pool browsers carry theirs per-slot.
  if (slot && slot.address === '10.2') return snapshot.browserDisplay ?? null;
  return slot?.lastDisplay ?? null;
}

function browserName(address) {
  return address === '10.2'
    ? 'Browser (You)'
    : `Browser-${Number(String(address).split('.')[1]) - 1}`;
}

export function renderInspector(selectedComponent, currentSnapshot, browserAddress = '10.2') {
  const source = COMPONENT_SOURCE[selectedComponent];
  els.inspectorTitle.textContent = componentTitle(
    currentSnapshot,
    selectedComponent,
    browserAddress,
  );
  els.inspectorCode.textContent = source.code;
  if (currentSnapshot) {
    els.inspectorState.textContent = formatComponentState(
      currentSnapshot,
      selectedComponent,
      browserAddress,
    );
  }
}

export function render(snapshot, selectedComponent, { layout, activeAddress = '10.2' } = {}) {
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
  els.crowdCount.textContent = `${labels.users} browsers`;
  els.lastFrame.textContent = labels.networkLastFrame;
  const display = activeBrowserDisplay(snapshot, activeAddress);
  els.browserRoleName.textContent = browserName(activeAddress);
  els.browserIpChip.textContent = activeAddress;
  els.renderedBody.textContent = display
    ? display.body
    : 'Send a request or step a hop to render a response.';
  els.statusBadge.textContent = display
    ? `${display.status} (${display.request})`
    : 'No response yet';
  els.statusBadge.className = `status-badge${badgeClass(display)}`;
  renderQueueInto(els.queueList, snapshot.queue ?? []);
  renderQueueInto(els.queueList2, snapshot.servers?.[1]?.queue ?? []);
  renderRoutes(labels.matchedRouteId, snapshot);
  if (snapshot.stage >= 2) {
    els.server2Address.textContent = labels.server2Address;
    els.queueBar2.style.width = labels.queueFill2;
    els.lbNext.textContent = labels.lbNextBackend;
    els.lbBackend1.textContent = labels.lbBackend1Label;
    els.lbBackend2.textContent = labels.lbBackend2Label;
    const lastTarget = snapshot.loadBalancer?.lastTarget;
    els.lbBackend1.classList.toggle('matched-route', lastTarget === '10.11');
    els.lbBackend2.classList.toggle('matched-route', lastTarget === '10.12');
  }
  if (snapshot.stage >= 3 && snapshot.cache) {
    els.cacheStats.textContent = labels.cacheStatsLabel;
    renderCacheEntries(labels.cacheEntries);
  }
  if (snapshot.stage >= 4 && snapshot.database) {
    els.dbStats.textContent = labels.dbStatsLabel;
    renderDbRows(labels.dbRows);
  }
  if (snapshot.stage === 5 && snapshot.workerQueue) {
    els.queueStats.textContent = labels.queueStatsLabel;
    els.workerStats.textContent = labels.workerStatsLabel;
    renderJobsInto(els.queueJobs, labels.queueJobs);
  }
  renderHopHighlights(snapshot, selectedComponent);
  renderDots(snapshot.users);
  renderRingBrowsers(layout?.browserSlots ?? [], activeAddress);
  // The headline is snapshot-derived (componentTitle), so it follows every
  // stage switch and compact-browser expansion too, not just tab clicks.
  els.inspectorTitle.textContent = componentTitle(snapshot, selectedComponent, activeAddress);
  els.inspectorState.textContent = formatComponentState(snapshot, selectedComponent, activeAddress);
}
