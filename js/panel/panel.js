// DOCUMENTS: panel controller — wires stage selection, trace controls, the
// interactive mini-browser, node selection, and the crowd sim to the engine.
// All behavior is attached with addEventListener only (no inline handlers —
// AGENTS.md CSP rule; the static server enforces it), and DOM updates are
// delegated to render.js.
import { createEngine } from '../sim/engine.js';
import { TICK_MS } from './model.js';
import { COMPONENT_SOURCE } from './inspector-source.js';
import { $, els, addToJourney, render, renderInspector } from './render.js';
import { renderStageTopology, onStageRendered } from './render-stage.js';
import { initViewport } from './viewport.js';

let currentStage = 1;
let engine = null;
let timer = null;
let selectedComponent = 'browser';
let currentSnapshot = null;
// The browser currently expanded into #node-browser (mini-IP on Ring 3);
// every other browser renders as a compact clickable node in its slot.
let activeBrowserAddress = '10.2';
// Total hops per stage; trace.js's machine and model.js's labels agree.
const TOTAL_HOPS = { 1: 4, 2: 5, 3: 6, 4: 7, 5: 8 };

const totalHopsFor = (stage) => TOTAL_HOPS[stage] ?? TOTAL_HOPS[1];

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
      addToJourney(`tick ${snapshot.tick}`, snapshot.lastFrame);
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
  updateView(engine.snapshot());
}

$('start-button').addEventListener('click', () => {
  if (timer) pause();
  else start();
});

$('step-button').addEventListener('click', () => {
  if (timer) pause();
  const snapshot = engine.step();
  if (snapshot.lastFrame) addToJourney(`tick ${snapshot.tick}`, snapshot.lastFrame);
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
  updateView(engine.snapshot());
});

// Single hop of the trace; the engine moves the request one stage per call,
// originating from whichever browser is currently expanded on Ring 3.
function stepOneHop() {
  const snapshot = engine.traceHop({
    method: els.method.value,
    path: els.urlInput.value,
    from: activeBrowserAddress,
  });
  const totalHops = totalHopsFor(snapshot.stage);
  addToJourney(`hop ${snapshot.trace.hop}/${totalHops}`, snapshot.lastFrame);
  updateView(snapshot);
  return snapshot;
}

$('btn-next-hop').addEventListener('click', stepOneHop);

$('btn-play-request').addEventListener('click', () => {
  if (timer) pause();
  const finalHop = totalHopsFor(currentStage);
  const iv = setInterval(() => {
    if (stepOneHop().trace.hop === finalHop) clearInterval(iv);
  }, TICK_MS);
});

$('btn-url-go').addEventListener('click', () => {
  if (timer) pause();
  const finalHop = totalHopsFor(currentStage);
  for (let i = 0; i < finalHop + 1; i += 1) {
    if (stepOneHop().trace.hop === finalHop) break;
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

// Boot: Stage 1 is active by default so existing Stage 1 tests run unchanged.
// The viewport fits the active stage bounds at init and on every stage switch
// (via the onStageRendered hook), so every node card is on-screen from load.
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
updateView(engine.snapshot());
