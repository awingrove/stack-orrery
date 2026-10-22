import { describe, it, expect } from 'vitest';
import {
  MIN_ZOOM,
  MAX_ZOOM,
  WORLD_BOUNDS,
  createCamera,
  panCamera,
  zoomCameraAt,
  fitCameraToBounds,
  formatWorldTransform,
} from '../../js/panel/camera.js';
import {
  ORRERY_RINGS,
  DEFAULT_RING_GAP,
  buildOrreryRings,
  computeStageLayout,
  polarToWorld,
} from '../../js/panel/layout.js';

describe('camera math', () => {
  it('pans world coordinates inversely to zoom and clamps to world bounds', () => {
    const cam = createCamera({ x: -340, y: 0, zoom: 0.5 });
    // CHECKS: the same screen delta moves the world center twice as far at
    // half zoom — pan is inverse to zoom, then clamped to WORLD_BOUNDS.
    const pan50 = panCamera(cam, 100, 50);
    expect(pan50.x).toBeCloseTo(cam.x - 100 / 0.5);
    expect(pan50.y).toBeCloseTo(cam.y - 50 / 0.5);
    expect(panCamera(createCamera({ x: -340, y: 0, zoom: 0.75 }), 100, 50).x).toBeCloseTo(
      -340 - 100 / 0.75,
    );

    // Overshoot pans clamp into the world bounds instead of escaping them.
    const edge = createCamera({ x: WORLD_BOUNDS.maxX, y: WORLD_BOUNDS.minY, zoom: MIN_ZOOM });
    const clamped = panCamera(edge, -4000, 4000);
    expect(clamped.x).toBe(WORLD_BOUNDS.maxX);
    expect(clamped.y).toBe(WORLD_BOUNDS.minY);

    expect(() => createCamera({ x: NaN, y: 0, zoom: 1 })).toThrow(/camera:/);
    expect(() => createCamera({ x: 0, y: 0, zoom: -1 })).toThrow(/camera:/);

    // CHECKS: zoom clamps into [MIN_ZOOM, MAX_ZOOM] regardless of input.
    expect(createCamera({ x: 0, y: 0, zoom: 99 }).zoom).toBe(MAX_ZOOM);
    expect(createCamera({ x: 0, y: 0, zoom: 0.01 }).zoom).toBe(MIN_ZOOM);
  });

  it('zooms toward the cursor while keeping the cursor world point fixed', () => {
    const cam = createCamera({ x: -340, y: 0, zoom: 0.5 });
    const cursorX = 120; // screen px right of the viewport center
    const cursorY = -60;

    const worldX = cam.x + cursorX / cam.zoom;
    const worldY = cam.y + cursorY / cam.zoom;

    for (const factor of [1.2, 1 / 1.2]) {
      const next = zoomCameraAt(cam, factor, cursorX, cursorY);
      expect(next.x + cursorX / next.zoom).toBeCloseTo(worldX, 6);
      expect(next.y + cursorY / next.zoom).toBeCloseTo(worldY, 6);
      expect(next.zoom).toBeCloseTo(cam.zoom * factor, 6);
    }

    // PINS: formatWorldTransform arithmetic — a fixed world point under the
    // cursor prints the same screen position before and after the zoom.
    const before = formatWorldTransform(cam, 1150, 448);
    const after = formatWorldTransform(zoomCameraAt(cam, 1.2, cursorX, cursorY), 1150, 448);
    const screenOf = (t) => {
      const [tx, scale] = [
        Number(t.match(/translate\((-?\d+)px/)[1]),
        Number(t.match(/scale\(([\d.]+)\)/)[1]),
      ];
      return tx + worldX * scale;
    };
    expect(screenOf(after)).toBeCloseTo(screenOf(before), 6);
  });
});

describe('orrery layout', () => {
  it('computes concentric ring coordinates and stage bounding boxes for the orrery', () => {
    // CHECKS: default ORRERY_RINGS stays the 3-ring Stage 1 layout at gap 400.
    expect(ORRERY_RINGS.map((r) => r.radius)).toEqual([400, 800, 1200]);
    expect(ORRERY_RINGS.map((r) => r.id)).toEqual(['ring-compute', 'ring-network', 'ring-clients']);
    // CHECKS: the default ring gap returns the plan-pinned Stage 1 rings, and a
    // non-finite or non-positive gap (or unknown stage) is rejected.
    expect(buildOrreryRings(400).map((r) => r.radius)).toEqual([400, 800, 1200]);
    expect(() => buildOrreryRings(0)).toThrow(/ringGap/);
    expect(() => buildOrreryRings(Number.NaN)).toThrow(/ringGap/);
    expect(() => buildOrreryRings(400, 6)).toThrow(/stage/);
    expect(polarToWorld(1200, 180)).toEqual({ x: -1200, y: 0 });
    expect(polarToWorld(400, 210)).toEqual({ x: -346, y: -200 });
    expect(polarToWorld(400, 150)).toEqual({ x: -346, y: 200 });

    // CHECKS: the world frame widens for Stage 3's five rings and Stage 4's
    // six (pan and fit reach the outer client ring and the innermost node).
    expect(WORLD_BOUNDS).toEqual({ minX: -3100, maxX: 600, minY: -900, maxY: 900 });

    // Stage 1: 3 layers -> 3 rings, one component seated per layer ring.
    const stage1 = computeStageLayout(1, 5);
    expect(stage1.rings.map((r) => r.radius)).toEqual([400, 800, 1200]);
    expect(stage1.nodes['node-webserver']).toMatchObject({
      x: -400,
      y: 0,
      radius: 400,
      ring: 'ring-compute',
    });
    expect(stage1.nodes['node-network']).toMatchObject({
      x: -800,
      y: 0,
      radius: 800,
      ring: 'ring-network',
    });
    expect(stage1.nodes['node-browser']).toMatchObject({
      x: -1200,
      y: 0,
      radius: 1200,
      ring: 'ring-clients',
    });
    expect(stage1.wires.map((w) => w.id)).toEqual([
      'wire-browser-network',
      'wire-network-webserver',
    ]);
    expect(stage1.bounds).toEqual({ minX: -1380, maxX: 120, minY: -540, maxY: 540 });
    // The SVG satellite anchors map 1:1 onto the browser slots, so each dot
    // sits exactly under its client-ring browser node (slot 0 at 180°).
    expect(stage1.satellites).toEqual(
      stage1.browserSlots.map(({ index, x, y, angleDeg }) => ({ index, x, y, angleDeg })),
    );
    for (const sat of stage1.satellites.slice(1)) {
      expect(Math.abs(sat.angleDeg - 180)).toBeGreaterThan(8);
      expect(Math.abs(Math.hypot(sat.x, sat.y) - 1200)).toBeLessThanOrEqual(1);
    }
    for (const node of Object.values(stage1.nodes)) {
      expect(node.radius).toBeGreaterThan(0);
      expect(node.x !== 0 || node.y !== 0).toBe(true);
    }
    expect(() => computeStageLayout(6)).toThrow(/stage/);

    // Stage 2: 4 layers -> 4 rings, both backends on Ring 1's left arc.
    const stage2 = computeStageLayout(2, 5);
    expect(stage2.rings.map((r) => r.radius)).toEqual([400, 800, 1200, 1600]);
    expect(stage2.rings.map((r) => r.id)).toEqual([
      'ring-compute',
      'ring-lb',
      'ring-network',
      'ring-clients',
    ]);
    expect(stage2.nodes['node-webserver']).toMatchObject({
      x: -346,
      y: -200,
      radius: 400,
      ring: 'ring-compute',
    });
    expect(stage2.nodes['node-webserver-2']).toMatchObject({
      x: -346,
      y: 200,
      radius: 400,
      ring: 'ring-compute',
    });
    expect(stage2.nodes['node-lb']).toMatchObject({
      x: -800,
      y: 0,
      radius: 800,
      ring: 'ring-lb',
    });
    expect(stage2.nodes['node-network']).toMatchObject({
      x: -1200,
      y: 0,
      radius: 1200,
      ring: 'ring-network',
    });
    expect(stage2.nodes['node-browser']).toMatchObject({
      x: -1600,
      y: 0,
      radius: 1600,
      ring: 'ring-clients',
    });
    for (const node of Object.values(stage2.nodes)) {
      expect(node.radius).toBeGreaterThan(0);
      expect(node.x !== 0 || node.y !== 0).toBe(true);
    }
    expect(stage2.wires.map((w) => w.id)).toEqual([
      'wire-browser-network',
      'wire-network-lb',
      'wire-lb-webserver',
      'wire-lb-webserver-2',
    ]);
    expect(stage2.bounds).toEqual({ minX: -1780, maxX: 120, minY: -540, maxY: 540 });

    // Stage 3: 5 layers -> 5 rings, cache-aside Cache 10.20 on the innermost
    // ring behind both backends, backends rotated to 200°/160°.
    const stage3 = computeStageLayout(3, 5);
    expect(stage3.rings.map((r) => r.radius)).toEqual([400, 800, 1200, 1600, 2000]);
    expect(stage3.rings.map((r) => r.id)).toEqual([
      'ring-cache',
      'ring-compute',
      'ring-lb',
      'ring-network',
      'ring-clients',
    ]);
    expect(stage3.nodes['node-cache']).toMatchObject({
      x: -400,
      y: 0,
      radius: 400,
      ring: 'ring-cache',
    });
    expect(stage3.nodes['node-webserver']).toMatchObject({
      x: -752,
      y: -274,
      radius: 800,
      ring: 'ring-compute',
    });
    expect(stage3.nodes['node-webserver-2']).toMatchObject({
      x: -752,
      y: 274,
      radius: 800,
      ring: 'ring-compute',
    });
    expect(stage3.nodes['node-lb']).toMatchObject({
      x: -1200,
      y: 0,
      radius: 1200,
      ring: 'ring-lb',
    });
    expect(stage3.nodes['node-network']).toMatchObject({
      x: -1600,
      y: 0,
      radius: 1600,
      ring: 'ring-network',
    });
    expect(stage3.nodes['node-browser']).toMatchObject({
      x: -2000,
      y: 0,
      radius: 2000,
      ring: 'ring-clients',
    });
    for (const node of Object.values(stage3.nodes)) {
      expect(node.radius).toBeGreaterThan(0);
      expect(node.x !== 0 || node.y !== 0).toBe(true);
    }
    expect(stage3.wires.map((w) => w.id)).toEqual([
      'wire-browser-network',
      'wire-network-lb',
      'wire-lb-webserver',
      'wire-lb-webserver-2',
      'wire-webserver-cache',
      'wire-webserver-2-cache',
    ]);
    // Each cache wire points from a backend at r=800 into the shared Cache
    // at (-400, 0) on Ring 1.
    expect(stage3.wires.at(-2)).toMatchObject({ x2: -400, y2: 0 });
    expect(stage3.wires.at(-1)).toMatchObject({ x2: -400, y2: 0 });
    expect(stage3.bounds).toEqual({ minX: -2180, maxX: 120, minY: -540, maxY: 540 });

    // Fit: bounds land inside the padded viewport with the camera centered.
    const fit = fitCameraToBounds(stage1.bounds, 1150, 448, 48);
    expect(fit.x).toBe(-630);
    expect(fit.y).toBe(0);
    expect(fit.zoom).toBeCloseTo(Math.min((1150 - 96) / 1500, (448 - 96) / 1080), 6);
    expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);

    // A tuned ring gap rescales every ring as r_k = k * ringGap (k = stage's
    // layer count), moving nodes, satellites, and bounds with it.
    expect(DEFAULT_RING_GAP).toBe(400);
    const tuned = computeStageLayout(1, 5, { ringGap: 300 });
    expect(tuned.rings.map((r) => r.radius)).toEqual([300, 600, 900]);
    expect(tuned.nodes['node-webserver']).toMatchObject({ x: -300, y: 0, radius: 300 });
    expect(tuned.nodes['node-browser']).toMatchObject({ x: -900, y: 0, radius: 900 });
    expect(tuned.nodes['node-network']).toMatchObject({ x: -600, y: 0, radius: 600 });
    expect(tuned.satellites).toHaveLength(5);
    for (const sat of tuned.satellites) {
      expect(Math.abs(Math.hypot(sat.x, sat.y) - 900)).toBeLessThanOrEqual(1);
    }
    expect(tuned.bounds).toEqual({ minX: -1080, maxX: 120, minY: -440, maxY: 440 });
  });

  it('lays out the six-ring Stage 4 database orrery from ring-db out to the clients', () => {
    // Stage 4: 6 layers -> 6 rings; the Database primary/replica takes the
    // innermost ring in front of the Cache ring.
    const stage4 = computeStageLayout(4, 5);
    expect(stage4.rings.map((r) => r.radius)).toEqual([400, 800, 1200, 1600, 2000, 2400]);
    expect(stage4.rings.map((r) => r.id)).toEqual([
      'ring-db',
      'ring-cache',
      'ring-compute',
      'ring-lb',
      'ring-network',
      'ring-clients',
    ]);
    expect(stage4.nodes['node-db']).toMatchObject({
      x: -400,
      y: 0,
      radius: 400,
      ring: 'ring-db',
    });
    expect(stage4.nodes['node-cache']).toMatchObject({
      x: -800,
      y: 0,
      radius: 800,
      ring: 'ring-cache',
    });
    expect(stage4.nodes['node-webserver']).toMatchObject({
      x: -1128,
      y: -410,
      radius: 1200,
      ring: 'ring-compute',
    });
    expect(stage4.nodes['node-webserver-2']).toMatchObject({
      x: -1128,
      y: 410,
      radius: 1200,
      ring: 'ring-compute',
    });
    expect(stage4.nodes['node-lb']).toMatchObject({ x: -1600, y: 0, ring: 'ring-lb' });
    expect(stage4.nodes['node-network']).toMatchObject({ x: -2000, y: 0, ring: 'ring-network' });
    expect(stage4.nodes['node-browser']).toMatchObject({ x: -2400, y: 0, ring: 'ring-clients' });
    for (const node of Object.values(stage4.nodes)) {
      expect(node.radius).toBeGreaterThan(0);
      expect(node.x !== 0 || node.y !== 0).toBe(true);
    }
    expect(stage4.wires.map((w) => w.id)).toEqual([
      'wire-browser-network',
      'wire-network-lb',
      'wire-lb-webserver',
      'wire-lb-webserver-2',
      'wire-webserver-cache',
      'wire-webserver-2-cache',
      'wire-cache-db',
    ]);
    // CHECKS: the write/read wire runs from the Cache (-800, 0) down into the
    // Database (-400, 0), and the stage bounds clear the outer 2400 ring.
    expect(stage4.wires.at(-1)).toMatchObject({ x1: -800, y1: 0, x2: -400, y2: 0 });
    expect(stage4.bounds).toEqual({ minX: -2580, maxX: 120, minY: -540, maxY: 540 });

    // A tuned ring gap rescales the six rings as r_k = k * ringGap.
    const tuned = computeStageLayout(4, 5, { ringGap: 300 });
    expect(tuned.rings.map((r) => r.radius)).toEqual([300, 600, 900, 1200, 1500, 1800]);
    expect(tuned.nodes['node-db']).toMatchObject({ x: -300, y: 0, radius: 300 });
    expect(tuned.nodes['node-browser']).toMatchObject({ x: -1800, y: 0, radius: 1800 });

    // Fit above the Stage 4 bounds stays inside the widened world frame.
    const fit = fitCameraToBounds(stage4.bounds, 1150, 448, 48);
    expect(fit.x).toBe(-1230);
    expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);
    expect(createCamera(fit).x).toBeGreaterThanOrEqual(WORLD_BOUNDS.minX);
  });

  it('maps every simulated browser to an addressable Ring 3 slot around the expanded one', () => {
    const layout = computeStageLayout(1, 5);
    expect(layout.browserSlots.map((slot) => slot.address)).toEqual([
      '10.2',
      '10.3',
      '10.4',
      '10.5',
      '10.6',
    ]);
    // CHECKS: the default expanded browser 10.2 owns the 180° slot, so the
    // default card position and wire midpoints match the pinned layout.
    expect(layout.browserSlots[0]).toMatchObject({ index: 0, x: -1200, y: 0, angleDeg: 180 });
    for (const slot of layout.browserSlots.slice(1)) {
      expect(Math.abs(Math.hypot(slot.x, slot.y) - 1200)).toBeLessThanOrEqual(1);
      expect(Math.abs(slot.angleDeg - 180)).toBeGreaterThan(8);
    }
    // Expanding another browser re-anchors #node-browser (and its wires) on
    // that slot's orbital coordinate instead of the default 180° spot.
    const flipped = computeStageLayout(1, 5, { activeBrowser: '10.3' });
    expect(flipped.nodes['node-browser']).toMatchObject({
      x: layout.browserSlots[1].x,
      y: layout.browserSlots[1].y,
      address: '10.3',
    });
  });
});
