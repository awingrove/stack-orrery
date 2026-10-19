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
    expect(ORRERY_RINGS.map((r) => r.radius)).toEqual([210, 520, 840]);
    // CHECKS: the default ring gap returns the plan-pinned ORRERY_RINGS, and a
    // non-finite or non-positive gap is rejected instead of yielding NaN radii.
    expect(buildOrreryRings(315)).toBe(ORRERY_RINGS);
    expect(() => buildOrreryRings(0)).toThrow(/ringGap/);
    expect(() => buildOrreryRings(Number.NaN)).toThrow(/ringGap/);
    expect(polarToWorld(840, 180)).toEqual({ x: -840, y: 0 });
    // DOCUMENTS: the raw polar formula at -48° rounds to (141, -156); the
    // stage-2 nodes are pinned to the plan's (140, ±156) instead.
    expect(polarToWorld(210, -48)).toEqual({ x: 141, y: -156 });

    const stage1 = computeStageLayout(1, 5);
    expect(stage1.nodes['node-webserver']).toMatchObject({ x: 0, y: 0, radius: 0 });
    expect(stage1.nodes['node-browser']).toMatchObject({ x: -840, y: 0, ring: 'ring-clients' });
    expect(stage1.nodes['node-network']).toMatchObject({ x: -520, y: 0, ring: 'ring-network' });
    expect(stage1.wires.map((w) => w.id)).toEqual([
      'wire-browser-network',
      'wire-network-webserver',
    ]);
    expect(stage1.bounds).toEqual({ minX: -1020, maxX: 340, minY: -340, maxY: 340 });
    // 5 users split into satellite arcs which leave the browser's 180° clear.
    expect(stage1.satellites).toHaveLength(5);
    for (const sat of stage1.satellites) {
      expect(Math.abs(sat.angleDeg - 180)).toBeGreaterThan(8);
      expect(Math.abs(Math.hypot(sat.x, sat.y) - 840)).toBeLessThanOrEqual(1);
    }
    expect(() => computeStageLayout(3)).toThrow(/stage/);

    const stage2 = computeStageLayout(2, 5);
    expect(stage2.nodes['node-lb']).toMatchObject({ x: -210, y: 0 });
    expect(stage2.nodes['node-webserver']).toMatchObject({ x: 140, y: -156 });
    expect(stage2.nodes['node-webserver-2']).toMatchObject({ x: 140, y: 156 });
    expect(stage2.wires.map((w) => w.id)).toEqual([
      'wire-browser-network',
      'wire-network-lb',
      'wire-lb-webserver',
      'wire-lb-webserver-2',
    ]);
    expect(stage2.bounds).toEqual(stage1.bounds);

    // Fit: bounds land inside the padded viewport with the camera centered.
    const fit = fitCameraToBounds(stage1.bounds, 1150, 448, 48);
    expect(fit.x).toBe(-340);
    expect(fit.y).toBe(0);
    expect(fit.zoom).toBeCloseTo(Math.min((1150 - 96) / 1360, (448 - 96) / 680), 6);
    expect(fit.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(fit.zoom).toBeLessThanOrEqual(MAX_ZOOM);

    // A tuned ring gap scales rings, node positions, satellites, and bounds:
    // r1 = round(210·400/315) = 267, r2 = 267+400 = 667, r3 = 267+800 = 1067.
    expect(DEFAULT_RING_GAP).toBe(315);
    const tuned = computeStageLayout(1, 5, { ringGap: 400 });
    expect(tuned.rings.map((r) => r.radius)).toEqual([267, 667, 1067]);
    expect(tuned.nodes['node-browser']).toMatchObject({ x: -1067, y: 0, radius: 1067 });
    expect(tuned.nodes['node-network']).toMatchObject({ x: -667, y: 0, radius: 667 });
    expect(tuned.satellites).toHaveLength(5);
    for (const sat of tuned.satellites) {
      expect(Math.abs(Math.hypot(sat.x, sat.y) - 1067)).toBeLessThanOrEqual(1);
    }
    expect(tuned.bounds).toEqual({ minX: -1247, maxX: 397, minY: -397, maxY: 397 });
  });
});
