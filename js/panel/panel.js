// DOCUMENTS: panel controller — wires the controls to the engine on a
// fixed tick interval and renders model labels into data-testid-annotated
// DOM. Behavior is attached with addEventListener only (no inline
// handlers — AGENTS.md CSP rule; the static server enforces it).
import { createEngine } from '../sim/engine.js';
import { describeSnapshot, TICK_MS } from './model.js';

const $ = (id) => document.getElementById(id);

const els = {
  slider: $('users-slider'),
  start: $('start-button'),
  step: $('step-button'),
  tick: $('tick'),
  queueDepth: $('queue-depth'),
  queueBar: $('queue-bar'),
  latency: $('latency'),
  served: $('served'),
  usersCount: $('users-count'),
  dots: $('user-dots'),
  serverAddress: $('server-address'),
  exchange: $('exchange-inspector'),
};

let engine = null;
let timer = null;

function render(snapshot) {
  const labels = describeSnapshot(snapshot);
  els.tick.textContent = labels.tick;
  els.queueDepth.textContent = labels.queueDepth;
  els.queueBar.style.width = labels.queueFill;
  els.latency.textContent = labels.latency;
  els.served.textContent = labels.served;
  els.usersCount.textContent = labels.users;
  els.serverAddress.textContent = labels.serverAddress;
  els.exchange.textContent = labels.exchangeSummary;
  els.dots.replaceChildren(
    ...Array.from({ length: snapshot.users }, () => {
      const dot = document.createElement('span');
      dot.className = 'user-dot';
      return dot;
    }),
  );
}

function createEngineFromControls() {
  return createEngine({
    seed: 42,
    users: Number(els.slider.value),
    serviceRate: 4,
    arrivalProb: 0.5,
  });
}

function start() {
  engine = createEngineFromControls();
  render(engine.snapshot());
  timer = setInterval(() => render(engine.step()), TICK_MS);
  els.start.textContent = 'Pause';
}

function pause() {
  clearInterval(timer);
  timer = null;
  els.start.textContent = 'Start';
}

els.start.addEventListener('click', () => {
  if (timer) pause();
  else start();
});

// The step button advances exactly one tick — creating the engine on
// first use — and pauses a running interval first: a manual advance
// does not start the timer.
els.step.addEventListener('click', () => {
  if (!engine) engine = createEngineFromControls();
  if (timer) pause();
  render(engine.step());
});

els.slider.addEventListener('input', () => {
  const n = Number(els.slider.value);
  if (engine) {
    engine.setUsers(n);
    render(engine.snapshot());
  } else {
    // Idle preview: show N users before the run starts (same render path).
    render({ tick: 0, users: n, queueDepth: 0, served: 0, avgLatencyTicks: 0 });
  }
});

// Initial paint: idle preview at the slider's starting value.
render({
  tick: 0,
  users: Number(els.slider.value),
  queueDepth: 0,
  served: 0,
  avgLatencyTicks: 0,
});
