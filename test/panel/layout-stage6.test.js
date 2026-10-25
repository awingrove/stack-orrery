import { describe, it, expect } from 'vitest';
import { buildOrreryRings, computeStageLayout, polarToWorld } from '../../js/panel/layout.js';
import { STAGE6_RINGS, buildStage6Extras } from '../../js/panel/layout-stage6.js';

// Stage-boundary extraction from camera.test.js (guard-file-size): the
// Stage 6 ring ladder, the DNS/router node seats, and the widete boundY are
// pinned here so camera.test.js stays inside the 450-line test cap.
describe('stage 6 layout', () => {
  it('inherits the stage-5 ring stack and seats the DNS and Router nodes on new spokes', () => {
    // CHECKS (Stage 6b): 9 rings — the stage-6a stack plus RING 8 · CDN EDGE,
    // with the client ring shifted out to RING 9 · BROWSERS; radii stay
    // k * ringGap.
    const rings = buildOrreryRings(400, 6);
    expect(rings.map((r) => r.id)).toEqual(STAGE6_RINGS.map(([id]) => id));
    expect(rings.map((r) => r.radius)).toEqual([
      400, 800, 1200, 1600, 2000, 2400, 2800, 3200, 3600,
    ]);
    expect(STAGE6_RINGS.map(([, label]) => label)).toEqual([
      'RING 1 · DATABASE',
      'RING 2 · WORKERS',
      'RING 3 · CACHE',
      'RING 4 · WEBSERVERS',
      'RING 5 · LOADBALANCER',
      'RING 6 · NETWORK',
      'RING 7 · DNS',
      'RING 8 · CDN EDGE',
      'RING 9 · BROWSERS',
    ]);

    const layout = computeStageLayout(6, 5);
    // The Router lives beside the 10.x hub (ring-network, 150°); the DNS
    // ledger sits on the DNS ring at 205°; the CDN edge on its own ring at
    // 155° (up-right of the hub, between DNS and the browser ring).
    expect(layout.nodes['node-router']).toEqual({
      id: 'node-router',
      ring: 'ring-network',
      radius: 2400,
      angleDeg: 150,
      ...polarToWorld(2400, 150),
    });
    expect(layout.nodes['node-dns']).toEqual({
      id: 'node-dns',
      ring: 'ring-dns',
      radius: 2800,
      angleDeg: 205,
      ...polarToWorld(2800, 205),
    });
    expect(layout.nodes['node-cdn']).toEqual({
      id: 'node-cdn',
      ring: 'ring-cdn',
      radius: 3200,
      angleDeg: 155,
      ...polarToWorld(3200, 155),
    });
    // The stage-5 nodes all survive: DB, workers, cache, backends, LB, hub.
    for (const id of [
      'node-db',
      'node-queue',
      'node-worker',
      'node-cache',
      'node-lb',
      'node-network',
      'node-browser',
    ]) {
      expect(layout.nodes[id]).toBeDefined();
    }
    // The new wires are spokes like every other stage's: hub -> router,
    // browser -> dns, and browser -> cdn (the Stage 6b edge lane), all
    // derived from the same stage-5 geometry.
    const wireIds = layout.wires.map((w) => w.id);
    expect(wireIds).toContain('wire-network-router');
    expect(wireIds).toContain('wire-browser-dns');
    expect(wireIds).toContain('wire-browser-cdn');
    const routerWire = layout.wires.find((w) => w.id === 'wire-network-router');
    expect(routerWire).toMatchObject({
      fromId: 'node-network',
      toId: 'node-router',
      x1: layout.nodes['node-network'].x,
      x2: layout.nodes['node-router'].x,
      y1: layout.nodes['node-network'].y,
      y2: layout.nodes['node-router'].y,
    });

    // CHECKS: the camera bounds widen vertically to the extra node reach
    // (+180 padding) and horizontally to the 9-ring outer radius; stages
    // 1-5 bounds stay unchanged by this slice.
    expect(layout.bounds).toEqual({ minX: -3780, maxX: 120, minY: -1532, maxY: 1532 });
    expect(computeStageLayout(5, 5).bounds).toEqual({
      minX: -2980,
      maxX: 120,
      minY: -540,
      maxY: 540,
    });

    // Unknown stages still fail loud: 7 is not a shipped stage.
    expect(() => computeStageLayout(7)).toThrow(/expected 1-6/);
  });

  it('buildStage6Extras derives the router/browser-reach bound and lane wires from real geometry', () => {
    // The extras builder is layout.js's only stage-6 seat of new nodes; the
    // reach covers wire endpoints too, so wide browser slots stay inside the
    // camera bounds.
    const browser = { x: -3200, y: 0 };
    const network = { x: -2400, y: 0 };
    const { nodes, wires, boundY } = buildStage6Extras(400, { network, browser });
    expect(nodes['node-router'].y).toBe(1200);
    expect(nodes['node-dns'].y).toBe(-1183);
    expect(nodes['node-cdn'].y).toBe(1352);
    expect(boundY).toBe(1532);
    expect(wires.map((w) => w.id)).toEqual([
      'wire-network-router',
      'wire-browser-dns',
      'wire-browser-cdn',
    ]);
    const dnsWire = wires[1];
    expect(dnsWire).toMatchObject({ fromId: 'node-browser', toId: 'node-dns', y1: 0, y2: -1183 });
    const cdnWire = wires[2];
    expect(cdnWire).toMatchObject({ fromId: 'node-browser', toId: 'node-cdn', y1: 0, y2: 1352 });
  });
});
