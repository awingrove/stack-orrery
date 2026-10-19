// DOCUMENTS: pure concentric-ring orrery geometry — node world coordinates,
// wire segments with midpoints, client-orbit satellite positions, and stage
// bounding boxes. Zero DOM: viewport.js consumes this to place cards, lanes,
// and SVG shapes.
export const DEFAULT_RING_GAP = 400;

export const ORRERY_RINGS = [
  { id: 'ring-compute', radius: 267, label: 'RING 1 · COMPUTE' },
  { id: 'ring-network', radius: 667, label: 'RING 2 · NETWORK' },
  { id: 'ring-clients', radius: 1067, label: 'RING 3 · CLIENTS' },
];

// CHECKS: buildOrreryRings validates the ring gap rather than producing NaN
// radii (which would degenerate the whole orrery into a single point).
export function buildOrreryRings(ringGap = DEFAULT_RING_GAP) {
  if (!Number.isFinite(ringGap) || ringGap <= 0) {
    throw new Error('layout: ringGap must be a finite number > 0');
  }
  if (ringGap === DEFAULT_RING_GAP) return ORRERY_RINGS;
  const r1 = Math.round((ORRERY_RINGS[0].radius * ringGap) / DEFAULT_RING_GAP);
  const r2 = r1 + Math.round(ringGap);
  const r3 = r1 + 2 * Math.round(ringGap);
  return [ORRERY_RINGS[0], ORRERY_RINGS[1], ORRERY_RINGS[2]].map((ring, i) => ({
    ...ring,
    radius: [r1, r2, r3][i],
  }));
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
  const rings = buildOrreryRings(ringGap);
  const r1 = rings[0].radius;
  const r2 = rings[1].radius;
  const r3 = rings[2].radius;
  const pos = (id, ring, radius, angleDeg) => ({
    id,
    ring,
    radius,
    angleDeg,
    ...polarToWorld(radius, angleDeg),
  });

  // Addressable browsers on Ring 3: slot 0 (mini-IP 10.2) sits at 180° —
  // the expanded #node-browser spot — and slots 1 .. users - 1 (10.3 ..
  // 10.(users + 1)) take the satellite arc positions. Compact nodes render
  // at every slot not currently expanded.
  const browserCount = Math.max(0, Math.round(users));
  const walkArcs = computeSatellites(Math.max(0, browserCount - 1), r3);
  const browserSlots = Array.from({ length: browserCount }, (_, i) => {
    if (i === 0) return { index: 0, address: '10.2', angleDeg: 180, ...polarToWorld(r3, 180) };
    return { index: i, address: `10.${i + 2}`, ...walkArcs[i - 1] };
  });
  const activeSlot = browserSlots.find((slot) => slot.address === String(activeBrowser)) ?? {
    index: 0,
    address: '10.2',
    angleDeg: 180,
    ...polarToWorld(r3, 180),
  };

  const nodes = {
    'node-browser': {
      id: 'node-browser',
      ring: 'ring-clients',
      radius: r3,
      angleDeg: activeSlot.angleDeg,
      x: activeSlot.x,
      y: activeSlot.y,
      address: activeSlot.address,
    },
    'node-network': pos('node-network', 'ring-network', r2, 180),
  };
  let wires;
  if (stage === 2) {
    nodes['node-lb'] = pos('node-lb', 'ring-compute', r1, 180);
    nodes['node-webserver'] = pos('node-webserver', 'ring-compute', r1, -48);
    nodes['node-webserver-2'] = pos('node-webserver-2', 'ring-compute', r1, 48);
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
    rings,
    nodes,
    wires,
    // DOCUMENTS: the SVG anchor dots reuse the browserSlots coordinates 1:1 so
    // each Ring-3 dot sits exactly under its browser node (not at users + 1
    // different angles from the old crowd arcs).
    satellites: browserSlots.map(({ index, x, y, angleDeg }) => ({ index, x, y, angleDeg })),
    browserSlots,
    // DOCUMENTS: at the default ring gap this equals the plan's pinned
    // { minX: -1247, maxX: 397, minY: -397, maxY: 397 }; tuned gaps scale the
    // bounds with r1/r3 so Fit to view keeps the whole plane in frame.
    bounds: { minX: -(r3 + 180), maxX: r1 + 130, minY: -(r1 + 130), maxY: r1 + 130 },
  };
}
