// DOCUMENTS: the B-6 fault console — the rail's fourth docked surface
// (rail tab 'faults', host built by rail.js). Per-stage fault switches, one
// fault per stage (DESIGN.md Fault Console): slice 1 ships the stage-1
// WebServer-down switch, B-6b appends the stage-2 Backend-10.12 row, B-6c
// the stage-3 bypass row, B-6d the stage-4 primary row, and B-6e the
// stage-5 worker-crash row. The
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
// card whose DOWN chip reflects the component's live state. The B-6c
// stage-3 fault is a bypass, not a down: kind 'bypass' flips the shared
// cache's own state through engine.setCacheBypassed, its console chip reads
// BYPASS (warn tokens, not the DOWN danger pair), and the 10.20 card's chip
// carries the node-bypass-chip testid.
const FAULTS = {
  1: [
    {
      id: 'webserver-down',
      label: 'WebServer down',
      switchId: 'fault-toggle-webserver',
      chipId: 'fault-state-webserver',
      serverAddress: '10.1',
      cardId: 'node-webserver',
      kind: 'down',
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
      kind: 'down',
    },
  ],
  3: [
    {
      id: 'cache-bypassed',
      label: 'Cache bypassed — GETs go to origin',
      switchId: 'fault-toggle-cache',
      chipId: 'fault-state-cache',
      serverAddress: '10.20',
      cardId: 'node-cache',
      kind: 'bypass',
    },
  ],
  4: [
    // B-6d: the first fault where the GET story and the POST story split —
    // the flip is the database's own setPrimaryDown flag, the write branch
    // answers a real 503, and reads keep serving from the replica.
    {
      id: 'primary-down',
      label: 'Database primary down — writes fail, replica reads keep serving',
      switchId: 'fault-toggle-primary',
      chipId: 'fault-state-primary',
      serverAddress: '10.30',
      cardId: 'node-db',
      kind: 'primary',
    },
  ],
  5: [
    // B-6e: the async decoupler's fault — the flip is the queue's own
    // setCrashed flag written through engine.setWorkerCrashed; the 202
    // story keeps answering while the worker's step() pauses, and a job
    // caught ACTIVE re-delivers on restore (component state, not narration).
    {
      id: 'worker-crashed',
      label: 'Worker crashed — async jobs wait, re-delivered on restore',
      switchId: 'fault-toggle-worker',
      chipId: 'fault-state-worker',
      serverAddress: '10.41',
      cardId: 'node-worker',
      kind: 'worker',
    },
  ],
};

let stage = null;
let section = null;
const consoleRefs = { getEngine: null, rerender: null };
const rows = new Map(); // fault id -> { fault, chipEl, switchEl }
const cardChips = new Map(); // fault id -> node-card DOWN chip element

// CHECKS: each fault's ON state is read from the snapshot's own component
// record — a DOWN flag the transport consults (down kind), or the bypass
// flag the cache snapshot carries (bypass kind) — so the UI cannot show a
// fault while the component is live, or off while it is misbehaving.
const downIn = (snapshot, serverAddress) =>
  Boolean(snapshot.servers?.find((s) => s.address === serverAddress)?.down);

const bypassedIn = (snapshot) => Boolean(snapshot.cache?.bypassed);

// B-6d: the primary-down flag reads off the database snapshot's own record.
const primaryDownIn = (snapshot) => Boolean(snapshot.database?.primaryDown);

// B-6e: the crashed flag reads off the workerQueue snapshot's own record.
const workerCrashedIn = (snapshot) => Boolean(snapshot.workerQueue?.crashed);

const faultStateIn = (snapshot, fault) =>
  fault.kind === 'bypass'
    ? bypassedIn(snapshot)
    : fault.kind === 'primary'
      ? primaryDownIn(snapshot)
      : fault.kind === 'worker'
        ? workerCrashedIn(snapshot)
        : downIn(snapshot, fault.serverAddress);

// The fault write goes through the engine's own fail-loud setter, exactly
// per kind: setServerDown for a down flip, setCacheBypassed for the cache,
// setDatabasePrimaryDown for the B-6d primary, setWorkerCrashed for the
// B-6e worker.
const flipFault = (engine, fault, next) =>
  fault.kind === 'bypass'
    ? engine.setCacheBypassed(next)
    : fault.kind === 'primary'
      ? engine.setDatabasePrimaryDown(next)
      : fault.kind === 'worker'
        ? engine.setWorkerCrashed(next)
        : engine.setServerDown(fault.serverAddress, next);

function nodeWith(tag, className, text, testId) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (testId) n.dataset.testid = testId;
  if (text !== undefined) n.textContent = text;
  return n;
}

// The fault chip lives on the affected node card's header: DOWN chips keep
// the DOWN/danger pair and the node-down-chip testid; the bypass chip reads
// BYPASS on the warn pair with the node-bypass-chip testid — the cache is
// out of the path, not down. Exactly one fault chip on the page at a time.
const FAULT_CHIP = {
  down: { className: 'down-chip', text: 'DOWN', testId: 'node-down-chip' },
  bypass: { className: 'bypass-chip', text: 'BYPASS', testId: 'node-bypass-chip' },
  // B-6d: the primary is genuinely down (a down component, not slice 3's
  // out-of-path bypass), so it carries the real DOWN/danger chip.
  primary: { className: 'down-chip', text: 'DOWN', testId: 'node-down-chip' },
  // B-6e: the worker is genuinely down (the crash pauses delivery), the
  // real DOWN/danger chip on the 10.41 card.
  worker: { className: 'down-chip', text: 'DOWN', testId: 'node-down-chip' },
};

function ensureCardChip(fault) {
  let chip = cardChips.get(fault.id);
  if (chip?.isConnected) return chip;
  const card = document.getElementById(fault.cardId);
  if (!card) return null;
  const spec = FAULT_CHIP[fault.kind];
  chip = nodeWith('span', spec.className, spec.text, spec.testId);
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
    flipFault(engine, fault, !faultStateIn(engine.snapshot(), fault));
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
// stay hidden on stages the fault does not own. The ON-state classes are
// per kind: DOWN keeps the danger pair, the bypass reads warn.
function refresh(snapshot) {
  for (const { fault, chipEl, switchEl } of rows.values()) {
    const active = faultStateIn(snapshot, fault);
    const text = active ? (fault.kind === 'bypass' ? 'BYPASS' : 'DOWN') : 'off';
    if (chipEl.textContent !== text) chipEl.textContent = text;
    chipEl.classList.toggle('fault-down', fault.kind !== 'bypass' && active);
    chipEl.classList.toggle('fault-bypass-on', fault.kind === 'bypass' && active);
    switchEl.setAttribute('aria-pressed', String(active));
    switchEl.classList.toggle('fault-switch-on', fault.kind !== 'bypass' && active);
    switchEl.classList.toggle('fault-switch-warn', fault.kind === 'bypass' && active);
    const cardChip = ensureCardChip(fault);
    if (cardChip) cardChip.hidden = !active;
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
