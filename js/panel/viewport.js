// DOCUMENTS: viewport controller — owns the camera, positions node cards and
// wire lanes in world coordinates, draws the orrery rings/spokes/satellites
// into SVG, wires all camera interactions (addEventListener only — CSP rule);
// camera math lives in camera.js, geometry in layout.js.
import { computeStageLayout } from './layout.js';
import {
  panCamera,
  zoomCameraAt,
  fitCameraToBounds,
  formatWorldTransform,
  createAutoRefit,
} from './camera.js';
import { drawOrrery } from './orrery-svg.js';

const DEFAULT_ZOOM_STEP = 1.2;
const DEFAULT_RING_GAP = 400;
const PAN_PX = 48;
// CHECKS: since the Stage R1 remodel nothing scrollable is mounted on the
// plane — the teaching/missions/legend surfaces dock into the page rail, so
// the wheel/pointer handlers below own the camera alone; a rail gesture is
// not a viewport descendant, so it fails to reach these handlers at all.
// PINS: e2e/camera-drawer.spec.js + e2e/control-room-rail.spec.js.
const INTERACTIVE_TARGETS = 'button, input, select, a, .node-card, .camera-hud';

const KEY_PANS = {
  ArrowLeft: [-PAN_PX, 0],
  ArrowRight: [PAN_PX, 0],
  ArrowUp: [0, -PAN_PX],
  ArrowDown: [0, PAN_PX],
};

// PINS: each wire lane sits on its wire in world coordinates (col-left on
// browser↔network, col-right on network↔webserver/lb, lb-backends centered
// between their two wires, stage-6 dns/router columns on their own spokes).
// A value may pin a lane at a fraction t down its wire: Stage 5 anchors the
// cache→db lane at t=0.3 so it clears the queue→worker crossing.
const LANE_WIRES = {
  1: { 'wire-col-left': 'wire-browser-network', 'wire-col-right': 'wire-network-webserver' },
  2: { 'wire-col-left': 'wire-browser-network', 'wire-col-right': 'wire-network-lb' },
  3: { 'wire-col-left': 'wire-browser-network', 'wire-col-right': 'wire-network-lb' },
  4: {
    'wire-col-left': 'wire-browser-network',
    'wire-col-right': 'wire-network-lb',
    'wire-cache-db': 'wire-cache-db',
  },
  5: {
    'wire-col-left': 'wire-browser-network',
    'wire-col-right': 'wire-network-lb',
    'wire-cache-db': ['wire-cache-db', 0.3],
    'wire-cache-queue': 'wire-cache-queue',
    'wire-queue-worker': 'wire-queue-worker',
  },
  6: {
    'wire-col-left': 'wire-browser-network',
    'wire-col-right': 'wire-network-lb',
    'wire-cache-db': ['wire-cache-db', 0.3],
    'wire-cache-queue': 'wire-cache-queue',
    'wire-queue-worker': 'wire-queue-worker',
    'wire-dns': 'wire-browser-dns',
    'wire-router': 'wire-network-router',
    'wire-cdn': 'wire-browser-cdn',
  },
};
// Lanes anchored between parallel wires — lb-backends shared across stages
// 2-6; servers-cache capped left of the Cache card it would otherwise clip.
const LANES_BETWEEN = [
  {
    laneId: 'wire-lb-backends',
    stages: [2, 3, 4, 5, 6],
    wireIds: ['wire-lb-webserver', 'wire-lb-webserver-2'],
  },
  {
    laneId: 'wire-servers-cache',
    stages: [3, 4, 5, 6],
    wireIds: ['wire-webserver-cache', 'wire-webserver-2-cache'],
    capTo: 'node-cache',
    capDx: -175, // 15.5rem card half + chip half + margin, in world px
  },
];

function byId(id) {
  return document.getElementById(id);
}

const at = (a, b, t) => Math.round(a + (b - a) * t);

function setWorldPos(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export function initViewport({ viewportEl, worldEl, svgEl, getStage, getUsers, getActiveBrowser }) {
  let camera = null;
  let layout = null;
  let lastStage = null;
  let lastUsers = null;
  let zoomStep = DEFAULT_ZOOM_STEP;
  // CHECKS: manual actions cancel the pending auto-refit; a stage or
  // user-count change re-arms it (camera.js).
  const autoRefit = createAutoRefit();
  const activeAddress = () => getActiveBrowser?.() ?? '10.2';

  const zoomStatus = byId('zoom-status');
  const ringGapSlider = byId('ring-gap-slider');
  const ringGapValue = byId('ring-gap-value');
  const zoomSpeedSlider = byId('zoom-speed-slider');
  const zoomSpeedValue = byId('zoom-speed-value');
  const viewSize = () => ({
    w: viewportEl.clientWidth || 960,
    h: viewportEl.clientHeight || 440,
  });

  function apply() {
    const { w, h } = viewSize();
    worldEl.style.transform = formatWorldTransform(camera, w, h);
    zoomStatus.textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  // Repositions cards/lanes/SVG from the current layout (stage sync, ring-gap
  function positionParts() {
    for (const node of Object.values(layout.nodes)) {
      const card = byId(node.id);
      if (card) setWorldPos(card, node.x, node.y);
    }
    const wireById = new Map(layout.wires.map((wire) => [wire.id, wire]));
    for (const [laneId, anchor] of Object.entries(LANE_WIRES[layout.stage])) {
      const [wireId, t = 0.5] = Array.isArray(anchor) ? anchor : [anchor];
      const wire = wireById.get(wireId);
      const lane = byId(laneId);
      if (lane && wire) setWorldPos(lane, at(wire.x1, wire.x2, t), at(wire.y1, wire.y2, t));
    }
    for (const { laneId, stages, wireIds, capTo, capDx } of LANES_BETWEEN) {
      if (!stages.includes(layout.stage)) continue;
      const lane = byId(laneId);
      const [w1, w2] = wireIds.map((id) => wireById.get(id));
      if (!lane || !w1 || !w2) continue;
      const [nx, ny] = capTo ? [layout.nodes[capTo].x + capDx, layout.nodes[capTo].y] : [];
      setWorldPos(lane, nx ?? at(w1.midX, w2.midX, 0.5), ny ?? at(w1.midY, w2.midY, 0.5));
    }
    for (const slot of layout.browserSlots ?? []) {
      // CHECKS: compact Ring-3 nodes track layout.browserSlots so they move
      // with the ring-gap slider like every other card.
      const btn = document.querySelector(`.browser-compact[data-address="${slot.address}"]`);
      if (btn) setWorldPos(btn, slot.x, slot.y);
    }
    drawOrrery(svgEl, layout);
  }

  // Rebuilds stage layout; refits the camera on a stage change (autoRefit).
  function syncLayout() {
    const { w, h } = viewSize();
    // CHECKS: the current slider gap feeds stage sync too — stage switches,
    // browser expansion, and user changes keep the tuned spacing.
    const ringGap = Number(ringGapSlider?.value) || DEFAULT_RING_GAP;
    const prevStage = lastStage;
    const prevUsers = lastUsers;
    lastUsers = getUsers();
    layout = computeStageLayout(getStage(), lastUsers, {
      ringGap,
      activeBrowser: activeAddress(),
    });
    // CHECKS: only a stage or user-count change re-arms auto-refit — the
    // named counter-example is a manual zoom followed by a silent tick: no
    // stage/slider change, so the camera must NOT re-fit.
    if (lastStage !== layout.stage || prevUsers !== lastUsers) autoRefit.rearm();
    lastStage = layout.stage;
    if (
      lastStage !== prevStage /* init + stage switch reframe unconditionally */ ||
      autoRefit.shouldRefit(layout.bounds, camera.zoom, w, h)
    ) {
      camera = fitCameraToBounds(layout.bounds, w, h);
    }
    positionParts();
    apply();
  }

  // --- interactions ---------------------------------------------------------
  // Manual camera actions cancel the pending auto-refit; only a stage or
  // user-count change re-arms it (104-105 contract).
  byId('btn-zoom-in').addEventListener('click', () => {
    autoRefit.cancel();
    camera = zoomCameraAt(camera, zoomStep, 0, 0);
    apply();
  });
  byId('btn-zoom-out').addEventListener('click', () => {
    autoRefit.cancel();
    camera = zoomCameraAt(camera, 1 / zoomStep, 0, 0);
    apply();
  });
  byId('btn-zoom-fit').addEventListener('click', () => {
    autoRefit.cancel();
    const { w, h } = viewSize();
    camera = fitCameraToBounds(layout.bounds, w, h);
    apply();
  });

  let dragPoint = null;
  // CHECKS: pointerdown inside the viewport only pans — rail gestures are not viewport descendants.
  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE_TARGETS)) return;
    autoRefit.cancel(); // a drag pan is a manual camera action
    dragPoint = { x: e.clientX, y: e.clientY };
    viewportEl.classList.add('is-panning');
    viewportEl.setPointerCapture(e.pointerId);
  });
  viewportEl.addEventListener('pointermove', (e) => {
    if (!dragPoint) return;
    camera = panCamera(camera, e.clientX - dragPoint.x, e.clientY - dragPoint.y);
    dragPoint = { x: e.clientX, y: e.clientY };
    apply();
  });
  const endDrag = () => {
    dragPoint = null;
    viewportEl.classList.remove('is-panning');
  };
  viewportEl.addEventListener('pointerup', endDrag);
  viewportEl.addEventListener('pointercancel', endDrag);

  // Wheel zooms toward the cursor offset from the viewport center.
  viewportEl.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      autoRefit.cancel(); // wheel zoom is a manual camera action
      const rect = viewportEl.getBoundingClientRect();
      const factor = e.deltaY < 0 ? zoomStep : 1 / zoomStep;
      camera = zoomCameraAt(
        camera,
        factor,
        e.clientX - rect.left - rect.width / 2,
        e.clientY - rect.top - rect.height / 2,
      );
      apply();
    },
    { passive: false },
  );

  // Keyboard camera control; world-card inputs keep their keystrokes.
  viewportEl.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    const manualKey =
      KEY_PANS[e.key] || e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0';
    if (!manualKey) return;
    autoRefit.cancel(); // keyboard camera control is a manual action
    if (KEY_PANS[e.key]) {
      e.preventDefault();
      camera = panCamera(camera, ...KEY_PANS[e.key]);
      apply();
    } else if (e.key === '+' || e.key === '=') {
      camera = zoomCameraAt(camera, zoomStep, 0, 0);
      apply();
    } else if (e.key === '-') {
      camera = zoomCameraAt(camera, 1 / zoomStep, 0, 0);
      apply();
    } else {
      const { w, h } = viewSize();
      camera = fitCameraToBounds(layout.bounds, w, h);
      apply();
    }
  });

  // Ring-gap tuning: reposition everything live; the camera is NOT reset.
  ringGapSlider.addEventListener('input', () => {
    const ringGap = Number(ringGapSlider.value) || DEFAULT_RING_GAP;
    ringGapValue.textContent = `${ringGap}px`;
    layout = computeStageLayout(getStage(), getUsers(), {
      ringGap,
      activeBrowser: activeAddress(),
    });
    positionParts();
    apply();
  });

  // Zoom-speed tuning: every zoom gesture reads this step size.
  zoomSpeedSlider.addEventListener('input', () => {
    zoomStep = Number(zoomSpeedSlider.value) || DEFAULT_ZOOM_STEP;
    zoomSpeedValue.textContent = `${zoomStep.toFixed(2)}x`;
  });

  syncLayout();

  return {
    syncLayout,
    getCamera: () => camera,
    getLayout: () => layout,
    panBy: (dx, dy) => {
      camera = panCamera(camera, dx, dy);
      apply();
    },
    zoomBy: (factor) => {
      camera = zoomCameraAt(camera, factor, 0, 0);
      apply();
    },
    fitToView: () => {
      const { w, h } = viewSize();
      camera = fitCameraToBounds(layout.bounds, w, h);
      apply();
    },
  };
}
