export const DEFAULT_RING_GAP = 400;

const STAGE_RINGS = {
  1: [
    ['ring-compute', 'RING 1 · WEBSERVER'],
    ['ring-network', 'RING 2 · NETWORK'],
    ['ring-clients', 'RING 3 · BROWSERS'],
  ],
  2: [
    ['ring-compute', 'RING 1 · WEBSERVERS'],
    ['ring-lb', 'RING 2 · LOADBALANCER'],
    ['ring-network', 'RING 3 · NETWORK'],
    ['ring-clients', 'RING 4 · BROWSERS'],
  ],
  3: [
    ['ring-cache', 'RING 1 · CACHE'],
    ['ring-compute', 'RING 2 · WEBSERVERS'],
    ['ring-lb', 'RING 3 · LOADBALANCER'],
    ['ring-network', 'RING 4 · NETWORK'],
    ['ring-clients', 'RING 5 · BROWSERS'],
  ],
  4: [
    ['ring-db', 'RING 1 · DATABASE'],
    ['ring-cache', 'RING 2 · CACHE'],
    ['ring-compute', 'RING 3 · WEBSERVERS'],
    ['ring-lb', 'RING 4 · LOADBALANCER'],
    ['ring-network', 'RING 5 · NETWORK'],
    ['ring-clients', 'RING 6 · BROWSERS'],
  ],
  5: [
    ['ring-db', 'RING 1 · DATABASE'],
    ['ring-workers', 'RING 2 · WORKERS'],
    ['ring-cache', 'RING 3 · CACHE'],
    ['ring-compute', 'RING 4 · WEBSERVERS'],
    ['ring-lb', 'RING 5 · LOADBALANCER'],
    ['ring-network', 'RING 6 · NETWORK'],
    ['ring-clients', 'RING 7 · BROWSERS'],
  ],
};

export const ORRERY_RINGS = buildOrreryRings(DEFAULT_RING_GAP, 1);

export function buildOrreryRings(ringGap = DEFAULT_RING_GAP, stage = 1) {
  if (!Number.isFinite(ringGap) || ringGap <= 0) {
    throw new Error('layout: ringGap must be a finite number > 0');
  }
  const ringSpecs = STAGE_RINGS[stage];
  if (!ringSpecs) {
    throw new Error(`layout: unknown stage ${stage} (expected 1-5)`);
  }
  const gap = Math.round(ringGap);
  return ringSpecs.map(([id, label], k) => ({ id, radius: (k + 1) * gap, label }));
}

export function polarToWorld(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.round(radius * Math.cos(rad)), y: Math.round(radius * Math.sin(rad)) };
}

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
  if (stage < 1 || stage > 5) {
    throw new Error(`layout: unknown stage ${stage} (expected 1-5)`);
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
  // in Stage 2, Ring 5 in Stage 3): slot 0 (mini-IP 10.2) sits at 180° — the
  // expanded #node-browser spot — and slots 1 .. users - 1 (10.3 ..
  // 10.(users + 1)) take the satellite arc positions. Compact nodes render
  // at every slot not currently expanded.
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
  if (stage === 1) {
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
  } else {
    nodes['node-lb'] = pos(
      'node-lb',
      'ring-lb',
      rings.find((ring) => ring.id === 'ring-lb').radius,
      180,
    );
    // Both backends sit squarely on the Compute ring: Stage 2 uses 210°/150°
    // (bottom-left / top-left arc); Stages 3–4 open the arc to 200°/160° so
    // the cache wires down the ring stack stay clear of the LB wire.
    const backendAngle1 = stage >= 3 ? 200 : 210;
    const backendAngle2 = stage >= 3 ? 160 : 150;
    nodes['node-webserver'] = pos(
      'node-webserver',
      'ring-compute',
      computeRing.radius,
      backendAngle1,
    );
    nodes['node-webserver-2'] = pos(
      'node-webserver-2',
      'ring-compute',
      computeRing.radius,
      backendAngle2,
    );
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
    if (stage === 3 || stage === 4) {
      // Cache-aside: the shared Cache sits behind both backends, each with
      // its own lookup wire down the ring stack (Ring 1 in Stage 3, Ring 2
      // in Stage 4).
      nodes['node-cache'] = pos(
        'node-cache',
        'ring-cache',
        rings.find((ring) => ring.id === 'ring-cache').radius,
        180,
      );
      wires.push(
        makeWire(
          'wire-webserver-cache',
          'node-webserver',
          'node-cache',
          nodes['node-webserver'],
          nodes['node-cache'],
        ),
        makeWire(
          'wire-webserver-2-cache',
          'node-webserver-2',
          'node-cache',
          nodes['node-webserver-2'],
          nodes['node-cache'],
        ),
      );
    }
    if (stage === 4 || stage === 5) {
      nodes['node-db'] = pos(
        'node-db',
        'ring-db',
        rings.find((ring) => ring.id === 'ring-db').radius,
        180,
      );
      wires.push(
        makeWire('wire-cache-db', 'node-cache', 'node-db', nodes['node-cache'], nodes['node-db']),
      );
    }
    if (stage === 5) {
      const workersRing = rings.find((ring) => ring.id === 'ring-workers');
      nodes['node-queue'] = pos('node-queue', 'ring-workers', workersRing.radius, 200);
      nodes['node-worker'] = pos('node-worker', 'ring-workers', workersRing.radius, 160);
      wires.push(
        makeWire(
          'wire-cache-queue',
          'node-cache',
          'node-queue',
          nodes['node-cache'],
          nodes['node-queue'],
        ),
        makeWire(
          'wire-queue-worker',
          'node-queue',
          'node-worker',
          nodes['node-queue'],
          nodes['node-worker'],
        ),
        makeWire(
          'wire-worker-db',
          'node-worker',
          'node-db',
          nodes['node-worker'],
          nodes['node-db'],
        ),
      );
    }
  }
  return {
    stage,
    rings,
    nodes,
    wires,
    satellites: browserSlots.map(({ index, x, y, angleDeg }) => ({ index, x, y, angleDeg })),
    browserSlots,
    bounds: {
      minX: -(outerRadius + 180),
      maxX: 120,
      minY: -(gap + 140),
      maxY: gap + 140,
    },
  };
}
