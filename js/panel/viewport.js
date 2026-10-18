// DOCUMENTS: viewport controller — owns the camera, positions node cards and
// wire lanes in world coordinates, draws the concentric orrery rings/spokes/
// satellites into SVG, and wires all camera interactions with addEventListener
// only (no inline handlers — AGENTS.md CSP rule). Camera math lives in
// camera.js, geometry in layout.js; both are pure and unit-pinned.
import { computeStageLayout } from './layout.js';
import { panCamera, zoomCameraAt, fitCameraToBounds, formatWorldTransform } from './camera.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ZOOM_STEP = 1.2;
const PAN_PX = 48;

// Drag-start targets that own their pointer events (camera never hijacks them).
const INTERACTIVE_TARGETS = 'button, input, select, a, .node-card';

const KEY_PANS = {
  ArrowLeft: [-PAN_PX, 0],
  ArrowRight: [PAN_PX, 0],
  ArrowUp: [0, -PAN_PX],
  ArrowDown: [0, PAN_PX],
};

// PINS: each wire lane sits on the midpoint of its wire in
// world coordinates (col-left on browser↔network, col-right on
// network↔webserver/lb, lb-backends centered between the two backend wires).
const LANE_WIRES = {
  1: { 'wire-col-left': 'wire-browser-network', 'wire-col-right': 'wire-network-webserver' },
  2: { 'wire-col-left': 'wire-browser-network', 'wire-col-right': 'wire-network-lb' },
};
const BACKEND_LANE = ['wire-lb-webserver', 'wire-lb-webserver-2'];

function byId(id) {
  return document.getElementById(id);
}

function setWorldPos(el, x, y) {
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function drawOrrery(svg, layout) {
  const parts = [svgEl('circle', { cx: 0, cy: 0, r: 10, class: 'orrery-core' })];
  for (const ring of layout.rings) {
    parts.push(svgEl('circle', { cx: 0, cy: 0, r: ring.radius, class: 'orrery-ring' }));
  }
  for (const wire of layout.wires) {
    parts.push(
      svgEl('line', {
        x1: wire.x1,
        y1: wire.y1,
        x2: wire.x2,
        y2: wire.y2,
        class: 'orrery-spoke',
      }),
    );
  }
  for (const sat of layout.satellites) {
    parts.push(
      svgEl('circle', {
        cx: sat.x,
        cy: sat.y,
        r: 6,
        class: 'orrery-satellite',
        'data-index': sat.index,
      }),
    );
  }
  svg.replaceChildren(...parts);
}

export function initViewport({ viewportEl, worldEl, svgEl, getStage, getUsers }) {
  let camera = null;
  let layout = null;
  let lastStage = null;

  const zoomStatus = byId('zoom-status');
  const viewSize = () => ({
    w: viewportEl.clientWidth || 960,
    h: viewportEl.clientHeight || 440,
  });

  function apply() {
    const { w, h } = viewSize();
    worldEl.style.transform = formatWorldTransform(camera, w, h);
    zoomStatus.textContent = `${Math.round(camera.zoom * 100)}%`;
  }

  // Rebuilds stage layout and repositions cards/lanes/SVG. Refits the camera
  // only when the stage changed (init + stage switch); pans/zooms survive.
  function syncLayout() {
    const { w, h } = viewSize();
    layout = computeStageLayout(getStage(), getUsers());
    if (lastStage !== layout.stage) {
      camera = fitCameraToBounds(layout.bounds, w, h);
      lastStage = layout.stage;
    }
    for (const node of Object.values(layout.nodes)) {
      const card = byId(node.id);
      if (card) setWorldPos(card, node.x, node.y);
    }
    const wireById = new Map(layout.wires.map((wire) => [wire.id, wire]));
    for (const [laneId, wireId] of Object.entries(LANE_WIRES[layout.stage])) {
      const lane = byId(laneId);
      const wire = wireById.get(wireId);
      if (lane && wire) setWorldPos(lane, wire.midX, wire.midY);
    }
    if (layout.stage === 2) {
      const lane = byId('wire-lb-backends');
      const [w1, w2] = BACKEND_LANE.map((id) => wireById.get(id));
      if (lane && w1 && w2) {
        setWorldPos(lane, Math.round((w1.midX + w2.midX) / 2), Math.round((w1.midY + w2.midY) / 2));
      }
    }
    drawOrrery(svgEl, layout);
    apply();
  }

  // --- interactions ---------------------------------------------------------
  byId('btn-zoom-in').addEventListener('click', () => {
    camera = zoomCameraAt(camera, ZOOM_STEP, 0, 0);
    apply();
  });
  byId('btn-zoom-out').addEventListener('click', () => {
    camera = zoomCameraAt(camera, 1 / ZOOM_STEP, 0, 0);
    apply();
  });
  byId('btn-zoom-fit').addEventListener('click', () => {
    const { w, h } = viewSize();
    camera = fitCameraToBounds(layout.bounds, w, h);
    apply();
  });

  // Pointer drag pans the plane; the plane follows the cursor's screen delta.
  let dragPoint = null;
  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest(INTERACTIVE_TARGETS)) return;
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
      const rect = viewportEl.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
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

  // Keyboard camera control; inputs inside world cards keep their keystrokes.
  viewportEl.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (KEY_PANS[e.key]) {
      e.preventDefault();
      camera = panCamera(camera, ...KEY_PANS[e.key]);
      apply();
    } else if (e.key === '+' || e.key === '=') {
      camera = zoomCameraAt(camera, ZOOM_STEP, 0, 0);
      apply();
    } else if (e.key === '-') {
      camera = zoomCameraAt(camera, 1 / ZOOM_STEP, 0, 0);
      apply();
    } else if (e.key === '0') {
      const { w, h } = viewSize();
      camera = fitCameraToBounds(layout.bounds, w, h);
      apply();
    }
  });

  syncLayout();

  return {
    syncLayout,
    getCamera: () => camera,
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
