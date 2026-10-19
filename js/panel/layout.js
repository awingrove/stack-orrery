// DOCUMENTS: pure concentric-ring orrery geometry — node world coordinates,
// wire segments with midpoints, client-orbit satellite positions, and stage
// bounding boxes. Zero DOM: viewport.js consumes this to place cards, lanes,
// and SVG shapes.
export const DEFAULT_RING_GAP = 400;

export const ORRERY_RINGS = buildOrreryRings(DEFAULT_RING_GAP, 1);

// CHECKS: buildOrreryRings validates the ring gap rather than producing NaN
// radii (which would degenerate the whole orrery into a single point).
// DOCUMENTS: every architectural layer of a stage gets its own concentric ring
// at r_k = k * ringGap — Stage 1 has 3 layers (3 rings), Stage 2 has 4 (4 rings).
export function buildOrreryRings(ringGap = DEFAULT_RING_GAP, stage = 1) {
  if (!Number.isFinite(ringGap) || ringGap <= 0) {
    throw new Error('layout: ringGap must be a finite number > 0');
  }
  if (stage !== 1 && stage !== 2) {
    throw new Error(`layout: unknown stage ${stage} (expected 1 or 2)`);
  }
  const gap = Math.round(ringGap);
  const ringSpecs =
    stage === 2
      ? [
          ['ring-compute', 'RING 1 · WEBSERVERS'],
          ['ring-lb', 'RING 2 · LOADBALANCER'],
          ['ring-network', 'RING 3 · NETWORK'],
          ['ring-clients', 'RING 4 · BROWSERS'],
        ]
      : [
          ['ring-compute', 'RING 1 · WEBSERVER'],
          ['ring-network', 'RING 2 · NETWORK'],
          ['ring-clients', 'RING 3 · BROWSERS'],
        ];
  return ringSpecs.map(([id, label], k) => ({ id, radius: (k + 1) * gap, label }));
}

export function polarToWorld(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.round(radius * Math.cos(rad)), y: Math.round(radius * Math.sin(rad)) };
}

// Satellites crowd the outer client ring on either side of the browser node's
// 180° spot: arcs [135°, 172°] and [188°, 225°], evenly spaced per arc.
function computeSatellites(users, outerRadius) {
  const count = Math.max(0, Math.round(users));
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const satellites = [];
  const place = (arcCount, startAngle) => {
    for (let j = 0; j < arcCount; j += 1) {
      const angleDeg = startAngle + ((j + 1) / (arcCount + 1)) * 37;
      const { x, y } = polarToWorld(outerRadius, angleDeg);
      satellites.push({ index: satellites.length, x, y, angleDeg });
    }
  };
  place(leftCount, 135);
  place(rightCount, 188);
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

// CHECKS: computeStageLayout validates the stage range rather than silently
// rendering an unknown topology as empty space.
export function computeStageLayout(
  stage = 1,
  users = 5,
  { ringGap = DEFAULT_RING_GAP, activeBrowser = '10.2' } = {},
) {
  if (stage !== 1 && stage !== 2) {
    throw new Error(`layout: unknown stage ${stage} (expected 1 or 2)`);
  }
  const rings = buildOrreryRings(ringGap, stage);
  const gap = Math.round(ringGap);
  const pos = (id, ring, radius, angleDeg) => ({
    id,
    ring,
    radius,
    angleDeg,
    ...polarToWorld(radius, angleDeg),
  });

  // Addressable browsers on the outer client ring (Ring 3 in Stage 1, Ring 4
  // in Stage 2): slot 0 (mini-IP 10.2) sits at 180° — the expanded
  // #node-browser spot — and slots 1 .. users - 1 (10.3 .. 10.(users + 1))
  // take the satellite arc positions. Compact nodes render at every slot not
  // currently expanded.
  const browserCount = Math.max(0, Math.round(users));
  const outerRadius = rings[rings.length - 1].radius;
  const walkArcs = computeSatellites(Math.max(0, browserCount - 1), outerRadius);
  const browserSlots = Array.from({ length: browserCount }, (_, i) => {
    if (i === 0)
      return { index: 0, address: '10.2', angleDeg: 180, ...polarToWorld(outerRadius, 180) };
    return { index: i, address: `10.${i + 2}`, ...walkArcs[i - 1] };
  });
  const activeSlot = browserSlots.find((slot) => slot.address === String(activeBrowser)) ?? {
    index: 0,
    address: '10.2',
    angleDeg: 180,
    ...polarToWorld(outerRadius, 180),
  };

  const nodes = {
    'node-browser': {
      id: 'node-browser',
      ring: rings[rings.length - 1].id,
      radius: outerRadius,
      angleDeg: activeSlot.angleDeg,
      x: activeSlot.x,
      y: activeSlot.y,
      address: activeSlot.address,
    },
  };
  const networkRing = rings.find((ring) => ring.id === 'ring-network');
  nodes['node-network'] = pos('node-network', 'ring-network', networkRing.radius, 180);
  let wires;
  const computeRing = rings.find((ring) => ring.id === 'ring-compute');
  if (stage === 2) {
    nodes['node-lb'] = pos('node-lb', 'ring-lb', rings[1].radius, 180);
    // Both backends sit squarely on Ring 1 (Compute): 210° puts 10.11 in the
    // top-left arc of the ring, 150° puts 10.12 in the bottom-left arc.
    nodes['node-webserver'] = pos('node-webserver', 'ring-compute', computeRing.radius, 210);
    nodes['node-webserver-2'] = pos('node-webserver-2', 'ring-compute', computeRing.radius, 150);
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
    nodes['node-webserver'] = pos('node-webserver', 'ring-compute', computeRing.radius, 180);
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
    rings,
    nodes,
    wires,
    // DOCUMENTS: the SVG anchor dots reuse the browserSlots coordinates 1:1 so
    // each client-ring dot sits exactly under its browser node (not at
    // users + 1 different angles from the old crowd arcs).
    satellites: browserSlots.map(({ index, x, y, angleDeg }) => ({ index, x, y, angleDeg })),
    browserSlots,
    // DOCUMENTS: bounds frame all active nodes and the (0, 0) origin — the
    // left edge clears the outermost ring's 180° seat, the verticals clear the
    // outer ring's satellite arcs (±37° at the outer radius).
    bounds: {
      minX: -(outerRadius + 180),
      maxX: 120,
      minY: -(gap + 140),
      maxY: gap + 140,
    },
  };
}
