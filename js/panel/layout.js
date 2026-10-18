// DOCUMENTS: pure concentric-ring orrery geometry — node world coordinates,
// wire segments with midpoints, client-orbit satellite positions, and stage
// bounding boxes. Zero DOM: viewport.js consumes this to place cards, lanes,
// and SVG shapes.
export const ORRERY_RINGS = [
  { id: 'ring-compute', radius: 210, label: 'RING 1 · COMPUTE' },
  { id: 'ring-network', radius: 520, label: 'RING 2 · NETWORK' },
  { id: 'ring-clients', radius: 840, label: 'RING 3 · CLIENTS' },
];

export function polarToWorld(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.round(radius * Math.cos(rad)), y: Math.round(radius * Math.sin(rad)) };
}

// Satellites crowd the outer client ring on either side of the browser node's
// 180° spot: arcs [135°, 172°] and [188°, 225°], evenly spaced per arc.
function computeSatellites(users) {
  const count = Math.max(0, Math.round(users));
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const satellites = [];
  for (let j = 0; j < leftCount; j += 1) {
    const angleDeg = 135 + ((j + 1) / (leftCount + 1)) * 37;
    const { x, y } = polarToWorld(840, angleDeg);
    satellites.push({ index: satellites.length, x, y, angleDeg });
  }
  for (let j = 0; j < rightCount; j += 1) {
    const angleDeg = 188 + ((j + 1) / (rightCount + 1)) * 37;
    const { x, y } = polarToWorld(840, angleDeg);
    satellites.push({ index: satellites.length, x, y, angleDeg });
  }
  return satellites;
}

function makeWire(id, fromId, toId, from, to) {
  return {
    id,
    fromId,
    toId,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    midX: Math.round((from.x + to.x) / 2),
    midY: Math.round((from.y + to.y) / 2),
  };
}

const ORRERY_BOUNDS = { minX: -1020, maxX: 340, minY: -340, maxY: 340 };

// CHECKS: computeStageLayout validates the stage range rather than silently
// rendering an unknown topology as empty space.
export function computeStageLayout(stage = 1, users = 5) {
  if (stage !== 1 && stage !== 2) {
    throw new Error(`layout: unknown stage ${stage} (expected 1 or 2)`);
  }
  const pos = (id, ring, radius, angleDeg) => ({
    id,
    ring,
    radius,
    angleDeg,
    ...polarToWorld(radius, angleDeg),
  });

  const nodes = {
    'node-browser': pos('node-browser', 'ring-clients', 840, 180),
    'node-network': pos('node-network', 'ring-network', 520, 180),
  };
  let wires;
  if (stage === 2) {
    nodes['node-lb'] = pos('node-lb', 'ring-compute', 210, 180);
    // DOCUMENTS: plan pins node-webserver(-2) at (140, ±156) here; the raw
    // -48°/+48° polar formula rounds to (141, ±156), so the pinned card
    // coordinates are authoritative over the formula's 1px drift.
    nodes['node-webserver'] = {
      id: 'node-webserver',
      ring: 'ring-compute',
      radius: 210,
      angleDeg: -48,
      x: 140,
      y: -156,
    };
    nodes['node-webserver-2'] = {
      id: 'node-webserver-2',
      ring: 'ring-compute',
      radius: 210,
      angleDeg: 48,
      x: 140,
      y: 156,
    };
    wires = [
      makeWire(
        'wire-browser-network',
        'node-browser',
        'node-network',
        nodes['node-browser'],
        nodes['node-network'],
      ),
      makeWire(
        'wire-network-lb',
        'node-network',
        'node-lb',
        nodes['node-network'],
        nodes['node-lb'],
      ),
      makeWire(
        'wire-lb-webserver',
        'node-lb',
        'node-webserver',
        nodes['node-lb'],
        nodes['node-webserver'],
      ),
      makeWire(
        'wire-lb-webserver-2',
        'node-lb',
        'node-webserver-2',
        nodes['node-lb'],
        nodes['node-webserver-2'],
      ),
    ];
  } else {
    nodes['node-webserver'] = pos('node-webserver', null, 0, 0);
    wires = [
      makeWire(
        'wire-browser-network',
        'node-browser',
        'node-network',
        nodes['node-browser'],
        nodes['node-network'],
      ),
      makeWire(
        'wire-network-webserver',
        'node-network',
        'node-webserver',
        nodes['node-network'],
        nodes['node-webserver'],
      ),
    ];
  }
  return {
    stage,
    rings: ORRERY_RINGS,
    nodes,
    wires,
    satellites: computeSatellites(users),
    bounds: ORRERY_BOUNDS,
  };
}
