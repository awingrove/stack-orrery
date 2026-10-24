// DOCUMENTS: panel controller — wires stage selection, trace controls, the
// interactive mini-browser, node selection, and the crowd sim to the engine.
// All behavior is attached with addEventListener only (no inline handlers —
// AGENTS.md CSP rule; the static server enforces it), and DOM updates are
// delegated to render.js.
import { createEngine } from '../sim/engine.js';
import { TICK_MS } from './model.js';
import { COMPONENT_SOURCE } from './inspector-source.js';
import { $, els, addToJourney, relabelJourneyRun, render, renderInspector } from './render.js';
import { renderStageTopology, onStageRendered } from './render-stage.js';
import { ensureStage6Dom } from './stage6-registry.js';
import { initViewport } from './viewport.js';
import { initTeachingDrawer, renderTeaching } from './teaching-drawer.js';

// Stage-6 topology DOM (DNS/Router cards, wire columns, inspector tabs) is
// injected before the wiring loops below so every getElementById resolves.
ensureStage6Dom();

let currentStage = 1;
let engine = null;
let timer = null;
let selectedComponent = 'browser';
let currentSnapshot = null;
// The browser currently expanded into #node-browser (mini-IP on Ring 3);
// every other browser renders as a compact clickable node in its slot.
let activeBrowserAddress = '10.2';
// Total hops per stage's trace shape; trace.js, trace-stage6.js and
// model.js's labels agree (stage 6's hosted shape: ask + answer + the
// stage-5 wire chain = 9).
const TOTAL_HOPS = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8, 6: 9 };

const totalHopsFor = (stage) => TOTAL_HOPS[stage] ?? TOTAL_HOPS[1];

// CHECKS: the live final hop reads from the trace itself — stage 6's shape
// is host ? (nx ? 2 : 9) : 8 (mirroring trace-stage6.js), so a host-less
// trace stops at its normal stage-5 count and an NX answer stops at the
// answer hop; other stages use TOTAL_HOPS.
const traceFinalHop = (snapshot, stage) => {
  if (snapshot.stage === 6 && snapshot.trace) {
    if (snapshot.trace.nx) return 2;
    return snapshot.trace.host ? 9 : 8;
  }
  return totalHopsFor(stage);
};

function createEngineFromControls() {
  return createEngine({
    seed: 42,
    users: Number($('users-slider').value),
    serviceRate: 4,
    arrivalProb: 0.5,
    stage: currentStage,
  });
}

function updateView(snapshot) {
  currentSnapshot = snapshot;
  render(snapshot, selectedComponent, {
    layout: viewport.getLayout(),
    activeAddress: activeBrowserAddress,
  });
}

function selectComponent(component) {
  if (!COMPONENT_SOURCE[component]) return;
  selectedComponent = component;
  renderInspector(selectedComponent, currentSnapshot, activeBrowserAddress);
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
      // Each tick's frame is its own journey run: newer ticks float above
      // older ones in #journey-log (render.js sorts by run key).
      addToJourney(`tick ${snapshot.tick}`, snapshot.lastFrame, { run: nextJourneyRun() });
    }
    updateView(snapshot);
  }, TICK_MS);
  $('start-button').textContent = 'Pause';
}

function pause() {
  clearInterval(timer);
  timer = null;
  $('start-button').textContent = 'Start';
}

function switchStage(stage) {
  if (timer) pause();
  currentStage = stage;
  renderStageTopology(currentStage);
  engine = createEngineFromControls();
  syncUrlState();
  renderTeaching(currentStage);
  updateView(engine.snapshot());
}

// CHECKS: deep-linked state reads exactly once at load — ?stage=N selects a
// live stage 1-6 and ?users=U clamps into the slider's 1-50 range; anything
// unknown, out of range, or non-numeric falls back to the fresh-load
// defaults (Stage 1, five users) without a console error. Named
// counter-example (pinned in e2e/panel.spec.js): ?stage=9 renders Stage 1 —
// out-of-range values must not crash or half-select a pill.
function readDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const stage = Number.parseInt(params.get('stage') ?? '', 10);
  const users = Number.parseFloat(params.get('users') ?? '');
  return {
    stage: stage >= 1 && stage <= 6 ? stage : 1,
    users: Number.isFinite(users) ? Math.min(50, Math.max(1, Math.round(users))) : 5,
  };
}

// CHECKS: stage-pill clicks and user-slider commits rewrite the URL in place
// via history.replaceState — the shareable state tracks the panel without
// pushing history entries (no history spam). Existing params are preserved.
function syncUrlState() {
  const params = new URLSearchParams(window.location.search);
  params.set('stage', String(currentStage));
  params.set('users', $('users-slider').value);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

$('start-button').addEventListener('click', () => {
  if (timer) pause();
  else start();
});

$('step-button').addEventListener('click', () => {
  if (timer) pause();
  const snapshot = engine.step();
  if (snapshot.lastFrame) {
    addToJourney(`tick ${snapshot.tick}`, snapshot.lastFrame, { run: nextJourneyRun() });
  }
  updateView(snapshot);
});

$('users-slider').addEventListener('input', () => {
  const users = Number($('users-slider').value);
  engine.setUsers(users);
  // A shrunken crowd drops its highest mini-IP slots; if the expanded browser
  // no longer exists, fall back to the learner's own browser.
  const host = Number(String(activeBrowserAddress).split('.')[1]);
  if (host > users + 1) activeBrowserAddress = '10.2';
  viewport.syncLayout(); // browser slots + crowd satellites re-space on Ring 3
  syncUrlState(); // user-count changes stay shareable
  updateView(engine.snapshot());
});

// Journey run keys: each trace run (a hop 1 emission) and each crowd tick
// gets the next run id, so render.js can sort #journey-log newest-run-first
// with hop-ascending entries inside every run. A trace run keeps its id for
// its whole life (hops must group together); crowd ticks each take a fresh
// id.
let journeyRunId = 0;
let traceRunId = 0;
const nextJourneyRun = () => {
  journeyRunId += 1;
  return journeyRunId;
};

// Single hop of the trace; the engine moves the request one stage per call,
// originating from whichever browser is currently expanded on Ring 3.
function stepOneHop() {
  const snapshot = engine.traceHop({
    method: els.method.value,
    path: els.urlInput.value,
    from: activeBrowserAddress,
  });
  const totalHops = traceFinalHop(snapshot, snapshot.stage);
  // PINS: hop 1 emission starts a new trace run — that run (whole, hops
  // ascending) floats above the previous run in #journey-log.
  // CHECKS: when the trace's final hop lands, the run's stored labels are
  // relabeled to the final denominator (an NX run's early `hop 1/9` estimate
  // must not survive into the finished log, which ends at hop 2).
  if (snapshot.trace.hop === 1) traceRunId = nextJourneyRun();
  addToJourney(`hop ${snapshot.trace.hop}/${totalHops}`, snapshot.lastFrame, {
    run: traceRunId,
    hop: snapshot.trace.hop,
  });
  if (snapshot.trace.hop === traceFinalHop(snapshot, snapshot.stage)) {
    relabelJourneyRun(traceRunId, totalHops);
  }
  updateView(snapshot);
  return snapshot;
}

$('btn-next-hop').addEventListener('click', stepOneHop);

$('btn-play-request').addEventListener('click', () => {
  if (timer) pause();
  const iv = setInterval(() => {
    const snapshot = stepOneHop();
    if (snapshot.trace.hop === traceFinalHop(snapshot, currentStage)) clearInterval(iv);
  }, TICK_MS);
});

$('btn-url-go').addEventListener('click', () => {
  if (timer) pause();
  for (let i = 0; i < totalHopsFor(currentStage) + 1; i += 1) {
    const snapshot = stepOneHop();
    if (snapshot.trace.hop === traceFinalHop(snapshot, currentStage)) break;
  }
});

document.querySelectorAll('.stage-pill[data-stage]').forEach((pill) => {
  pill.addEventListener('click', () => switchStage(Number(pill.dataset.stage)));
});

// Clicking a compact browser on Ring 3 expands it into #node-browser at its
// orbital position and collapses the previously expanded browser (10.2
// included) into a compact node in its own slot.
document.getElementById('browser-ring-nodes').addEventListener('click', (e) => {
  const chip = e.target.closest('.browser-compact');
  if (!chip) return;
  activeBrowserAddress = chip.dataset.address;
  viewport.syncLayout(); // moves #node-browser + wire lane to the new slot
  selectComponent('browser');
  updateView(engine.snapshot());
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

// CHECKS: the legend drawer toggles closed by default and reveals the app's
// own glossary (tick clock, cache stats trio, Ring 3 site chips, wire-lane
// direction labels); aria-expanded tracks visibility for assistive tech.
$('legend-toggle').addEventListener('click', () => {
  const panel = document.getElementById('legend-panel');
  const open = panel.hidden;
  panel.hidden = !open;
  $('legend-toggle').setAttribute('aria-expanded', String(open));
});

// CHECKS: the teaching drawer lives in js/panel/teaching-drawer.js; panel.js
// hands it the current stage at boot and on every switch (see also the
// legend drawer above for the toggle pattern).
initTeachingDrawer();

// Boot: Stage 1 is active by default so existing Stage 1 tests run unchanged,
// except where the URL deep-links a live stage and user count (?stage=N&
// users=U) — those restore shared states on load. The viewport fits the
// active stage bounds at init and on every stage switch (via the
// onStageRendered hook), so every node card is on-screen from load.
const deepLink = readDeepLink();
currentStage = deepLink.stage;
$('users-slider').value = String(deepLink.users);
engine = createEngineFromControls();
renderStageTopology(currentStage);
const viewport = initViewport({
  viewportEl: $('orrery-viewport'),
  worldEl: $('orrery-world'),
  svgEl: $('orrery-svg'),
  getStage: () => currentStage,
  getUsers: () => Number($('users-slider').value),
  getActiveBrowser: () => activeBrowserAddress,
});
onStageRendered(() => viewport.syncLayout());
selectComponent('browser');
renderTeaching(currentStage);
updateView(engine.snapshot());
