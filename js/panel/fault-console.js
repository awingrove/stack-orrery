// DOCUMENTS: the B-6 fault console — the rail's fourth docked surface
// (rail tab 'faults', host built by rail.js). Per-stage fault switches, one
// fault per stage (DESIGN.md Fault Console): slice 1 ships the stage-1
// WebServer-down switch and B-6b appends the stage-2 Backend-10.12 row. The
// switch writes real component state through engine.setServerDown
// (webserver.setDown validates the boolean, fail-loud) and every visible
// fault state — the console row's DOWN/off chip and the staged server
// card's DOWN chip — reads back from the fresh snapshot, not from local UI
// memory. panel.html sits at its 550-line cap, so the console and the card
// chip are JS-built: textContent/attributes only,
// addEventListener only (AGENTS.md CSP rule). Stages without faults render
// no section — the rail shows its own empty-state line, not blank space.
import { getRailHost, refreshRail } from './rail.js';

// One fault per stage. serverAddress names the component the fault downs
// (stage 1's single server, stage 2's backend 10.12) and cardId the node
// card whose DOWN chip reflects the component's live state.
const FAULTS = {
  1: [
    {
      id: 'webserver-down',
      label: 'WebServer down',
      switchId: 'fault-toggle-webserver',
      chipId: 'fault-state-webserver',
      serverAddress: '10.1',
      cardId: 'node-webserver',
    },
  ],
  2: [
    // B-6b: the slice-1 pattern verbatim — the flip is component state, and
    // the LB cursor's health-aware skip is what keeps the pool serving.
    {
      id: 'backend-10-12-down',
      label: 'Backend 10.12 down',
      switchId: 'fault-toggle-backend-10-12',
      chipId: 'fault-state-backend-10-12',
      serverAddress: '10.12',
      cardId: 'node-webserver-2',
    },
  ],
};

let stage = null;
let section = null;
const consoleRefs = { getEngine: null, rerender: null };
const rows = new Map(); // fault id -> { fault, chipEl, switchEl }
const cardChips = new Map(); // fault id -> node-card DOWN chip element

// CHECKS: down is read from the snapshot's own server record — the card's
// down flag the transport consults — so the UI cannot show DOWN while the
// component is live, or off while it refuses.
const downIn = (snapshot, serverAddress) =>
  Boolean(snapshot.servers?.find((s) => s.address === serverAddress)?.down);

function nodeWith(tag, className, text, testId) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (testId) n.dataset.testid = testId;
  if (text !== undefined) n.textContent = text;
  return n;
}

// The DOWN chip lives on the affected node card's header (DESIGN.md: an
// affected .node-card carries it in danger tokens; the card stays in
// place — still addressable, simply refusing).
function ensureCardChip(fault) {
  let chip = cardChips.get(fault.id);
  if (chip?.isConnected) return chip;
  const card = document.getElementById(fault.cardId);
  if (!card) return null;
  chip = nodeWith('span', 'down-chip', 'DOWN', 'node-down-chip');
  card.querySelector('.node-head')?.append(chip);
  cardChips.set(fault.id, chip);
  return chip;
}

function buildRow(fault) {
  const row = nodeWith('div', 'fault-row');
  const label = nodeWith('span', 'fault-label', fault.label);
  const switchEl = nodeWith('button', 'fault-switch', undefined, fault.switchId);
  switchEl.type = 'button';
  switchEl.setAttribute('aria-pressed', 'false');
  switchEl.textContent = 'Take down / restore';
  const chipEl = nodeWith('span', 'fault-chip', 'off', fault.chipId);
  // CHECKS: the click writes through the engine's fail-loud setter and
  // re-renders from the snapshot — no local state, no auto-send of
  // anything: the fault is component state, the wire reacts on its own.
  switchEl.addEventListener('click', () => {
    const engine = consoleRefs.getEngine?.();
    if (!engine) return;
    const down = downIn(engine.snapshot(), fault.serverAddress);
    engine.setServerDown(fault.serverAddress, !down);
    consoleRefs.rerender?.(engine.snapshot());
  });
  const wrap = nodeWith('div', 'fault-row-line');
  wrap.append(switchEl, chipEl);
  row.append(label, wrap);
  rows.set(fault.id, { fault, chipEl, switchEl });
  return row;
}

function rebuild() {
  section?.remove();
  section = null;
  rows.clear();
  const list = FAULTS[stage] ?? [];
  // A stage with no fault renders no rows at all: no section, no empty
  // shell — the rail's faults empty-state line stands (its contract).
  const host = list.length > 0 ? getRailHost('faults') : null;
  if (!host) return;
  const node = nodeWith('div', 'faults-section', undefined, 'faults-section');
  node.append(nodeWith('p', 'teaching-list-title', 'Faults'));
  for (const fault of list) {
    node.append(buildRow(fault));
    ensureCardChip(fault);
  }
  section = node;
  host.append(section);
  refreshRail(); // the host's empty-state line yields to the section
}

// CHECKS: cheap on every snapshot — rows persist across updates and a
// chip's text/class/aria are written only when they change, so with the
// fault off the console is byte-identical over crowd ticks. Card chips
// stay hidden on stages the fault does not own.
function refresh(snapshot) {
  for (const { fault, chipEl, switchEl } of rows.values()) {
    const isDown = downIn(snapshot, fault.serverAddress);
    const text = isDown ? 'DOWN' : 'off';
    if (chipEl.textContent !== text) chipEl.textContent = text;
    chipEl.classList.toggle('fault-down', isDown);
    switchEl.setAttribute('aria-pressed', String(isDown));
    switchEl.classList.toggle('fault-switch-on', isDown);
    const cardChip = ensureCardChip(fault);
    if (cardChip) cardChip.hidden = !isDown;
  }
}

// Stage switches leave no card chip behind: a previously expanded card's
// chip hides when the new stage carries no fault rows at all.
function hideCardChips() {
  for (const chip of cardChips.values()) chip.hidden = true;
}

// Called on every snapshot (per crowd tick and per hop, riding render.js's
// hook). The stage comes from the snapshot itself, so stage switches are
// detected here — a stage change rebuilds (or empties) the console before
// refreshing, mirroring the missions view's stage detection.
export function updateFaultConsole(snapshot) {
  if (!snapshot) return;
  if (stage !== snapshot.stage) {
    stage = snapshot.stage;
    rebuild();
    hideCardChips();
  }
  refresh(snapshot);
}

export function initFaultConsole({ getEngine, rerender } = {}) {
  consoleRefs.getEngine = getEngine ?? null;
  consoleRefs.rerender = rerender ?? null;
}
