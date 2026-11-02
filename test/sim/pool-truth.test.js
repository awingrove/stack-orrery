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
