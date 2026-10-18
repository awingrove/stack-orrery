// DOCUMENTS: panel controller — wires stage selection, trace controls, the
// interactive mini-browser, node selection, and the crowd sim to the engine.
// All behavior is attached with addEventListener only (no inline handlers —
// AGENTS.md CSP rule; the static server enforces it), and DOM updates are
// delegated to render.js.
import { createEngine } from '../sim/engine.js';
import { TICK_MS } from './model.js';
import { COMPONENT_SOURCE } from './inspector-source.js';
import {
  $,
  els,
  addToJourney,
  render,
  renderInspector,
  renderStageTopology,
  onStageRendered,
} from './render.js';
import { initViewport } from './viewport.js';

let currentStage = 1;
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
    stage: currentStage,
  });
}

function updateView(snapshot) {
  currentSnapshot = snapshot;
  render(snapshot, selectedComponent);
}

function selectComponent(component) {
  if (!COMPONENT_SOURCE[component]) return;
  selectedComponent = component;
  renderInspector(selectedComponent, currentSnapshot);
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
  engine.setUsers(Number($('users-slider').value));
  updateView(engine.snapshot());
  viewport.syncLayout(); // crowd satellites re-space on the client ring
});

// Single hop of the trace; the engine moves the request one stage per call.
function stepOneHop() {
  const snapshot = engine.traceHop({
    method: els.method.value,
    path: els.urlInput.value,
  });
  const totalHops = snapshot.stage === 2 ? 5 : 4;
  addToJourney(`hop ${snapshot.trace.hop}/${totalHops}`, snapshot.lastFrame);
  updateView(snapshot);
  return snapshot;
}

$('btn-next-hop').addEventListener('click', stepOneHop);

$('btn-play-request').addEventListener('click', () => {
  if (timer) pause();
  const finalHop = currentStage === 2 ? 5 : 4;
  const iv = setInterval(() => {
    if (stepOneHop().trace.hop === finalHop) clearInterval(iv);
  }, TICK_MS);
});

$('btn-url-go').addEventListener('click', () => {
  if (timer) pause();
  const finalHop = currentStage === 2 ? 5 : 4;
  for (let i = 0; i < finalHop + 1; i += 1) {
    if (stepOneHop().trace.hop === finalHop) break;
  }
});

document.querySelectorAll('.stage-pill[data-stage]').forEach((pill) => {
  pill.addEventListener('click', () => switchStage(Number(pill.dataset.stage)));
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
});
onStageRendered(() => viewport.syncLayout());
selectComponent('browser');
updateView(engine.snapshot());
