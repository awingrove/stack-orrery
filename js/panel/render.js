// DOCUMENTS: panel DOM renderer — translates engine snapshots and model
// labels into DOM updates (queues, route tables, cache entries, load
// balancer backend counters, and inspector panes). Stage topology and hop
// highlights live in render-stage.js; event wiring in panel.js.
import { describeSnapshot } from './model.js';
import { COMPONENT_SOURCE, formatComponentState } from './inspector-source.js';
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
  inspectorTitle: $('inspector-title'),
  inspectorCode: $('inspector-code'),
  inspectorState: $('inspector-state'),
  journeyLog: $('journey-log'),
  exchange: $('exchange-inspector'),
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
  const behindLb = snapshot.stage === 2 || snapshot.stage === 3;
  const servedBy2 = behindLb && snapshot.lastExchange?.to === '10.12';
  for (const node of document.querySelectorAll('[data-file]')) {
    node.classList.toggle('matched-route', !servedBy2 && node.dataset.file === matchedRouteId);
  }
  for (const node of document.querySelectorAll('[data-file-2]')) {
    node.classList.toggle('matched-route', servedBy2 && node.dataset.file2 === matchedRouteId);
  }
}

// Cache entries (Stage 3): one row per live cached key with its remaining
// TTL in ticks — the Map on screen, never an aggregate hit rate.
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
  els.inspectorTitle.textContent =
    selectedComponent === 'browser' && browserAddress !== '10.2'
      ? `${browserName(browserAddress)} — mini-IP ${browserAddress}`
      : source.title;
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
  if (snapshot.stage === 2 || snapshot.stage === 3) {
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
  if (snapshot.stage === 3 && snapshot.cache) {
    els.cacheStats.textContent = labels.cacheStatsLabel;
    renderCacheEntries(labels.cacheEntries);
  }
  renderRoutes(labels.matchedRouteId, snapshot);
  renderHopHighlights(snapshot, selectedComponent);
  renderDots(snapshot.users);
  renderRingBrowsers(layout?.browserSlots ?? [], activeAddress);
  els.inspectorState.textContent = formatComponentState(snapshot, selectedComponent, activeAddress);
}
