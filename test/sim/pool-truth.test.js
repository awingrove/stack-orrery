import { describe, it, expect } from 'vitest';
import { createEngine } from '../../js/sim/engine.js';

// CHECKS: R2c finding 1-06 — the top-level shape names the pool's primary
// backend (option b), not a merged aggregate; the named counter-example: a
// 10.12-side fs edit lands ONLY in servers[1].files while primaryFiles
// keeps the primary backend's own story.
describe('engine snapshot primary shape', () => {
  it("the primary shape names itself — 'primaryQueue' / 'primaryFiles' - the pool's primary-backend story, not an aggregate", () => {
    const stage2 = createEngine({ seed: 42, stage: 2 });
    stage2.setWebFile('10.12', '/about', 'New body');
    const snap = stage2.snapshot();
    expect(snap.primaryFiles['/about']).toBe('This is the about page');
    expect(snap.servers[1].files['/about']).toBe('New body');
    expect(snap.servers[0].files['/about']).toBe('This is the about page');
    expect(Array.isArray(snap.primaryQueue)).toBe(true);
    expect(snap.queue).toBeUndefined();
    expect(snap.files).toBeUndefined();

    const stage1 = createEngine({ seed: 42, stage: 1 });
    stage1.setWebFile('10.1', '/about', 'New body');
    const solo = stage1.snapshot();
    expect(solo.primaryFiles['/about']).toBe('New body');
    expect(solo.servers[0].files['/about']).toBe('New body');
  });
});

// CHECKS: R2e — the snapshot assembly moved verbatim into
// js/sim/engine-snapshot.js; the shape-stability rule: the returned
// record's key set AND order are part of the engine contract and evolve
// nowhere in this slice (pure extraction — the only change allowed behind
// this pin is a key-neutral delegate).
describe('engine snapshot shape stability', () => {
  it("the engine snapshot's key set is contract-stable across the engine-snapshot assembly extraction — no shape evolved in this slice", () => {
    const KEY_ORDER = [
      'stage',
      'registry',
      'tick',
      'users',
      'serverAddress',
      'queueDepth',
      'served',
      'avgLatencyTicks',
      'refusedCount',
      'skippedCount',
      'bypassedCount',
      'failedWrites',
      'primaryDown',
      'crashed',
      'redelivered',
      'lastExchange',
      'primaryQueue',
      'primaryFiles',
      'servers',
      'loadBalancer',
      'cache',
      'database',
      'workerQueue',
      'dns',
      'router',
      'cdn',
      'lastMatchedRoute',
      'lastFrame',
      'browserDisplay',
      'browsers',
      'trace',
    ];
    for (const stage of [1, 2]) {
      const engine = createEngine({ seed: 42, stage });
      engine.step();
      expect(Object.keys(engine.snapshot())).toEqual(KEY_ORDER);
    }
  });
});
