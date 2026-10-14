import { describe, it, expect } from 'vitest';
import { createEngine } from '../../js/sim/engine.js';
import { createRng } from '../../js/sim/rng.js';

describe('createRng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = Array.from({ length: 10 }, createRng(7));
    const b = Array.from({ length: 10 }, createRng(7));
    const c = Array.from({ length: 10 }, createRng(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('createEngine', () => {
  it('same seed replays the identical tick sequence', () => {
    const run = () => {
      const engine = createEngine({ seed: 7, users: 12, serviceRate: 4, arrivalProb: 0.6 });
      return Array.from({ length: 50 }, () => engine.step());
    };
    const first = run();
    const second = run();
    expect(first).toEqual(second);

    const other = createEngine({ seed: 8, users: 12, serviceRate: 4, arrivalProb: 0.6 });
    const otherRun = Array.from({ length: 50 }, () => other.step());
    expect(otherRun).not.toEqual(first);
  });

  it('advances exactly one tick per step and snapshots UI state', () => {
    const engine = createEngine({ seed: 1 });
    expect(engine.snapshot()).toMatchObject({ tick: 0, users: 5, queueDepth: 0, served: 0 });
    engine.step();
    expect(engine.snapshot().tick).toBe(1);
    engine.step();
    expect(engine.snapshot().tick).toBe(2);
    const snap = engine.snapshot();
    expect(typeof snap.avgLatencyTicks).toBe('number');
    expect(snap.avgLatencyTicks).toBeGreaterThanOrEqual(0);
  });

  it('setUsers changes the simulated user count', () => {
    const engine = createEngine({ seed: 1, users: 5 });
    engine.setUsers(30);
    expect(engine.snapshot().users).toBe(30);
  });

  it('rejects an arrivalProb outside [0, 1]', () => {
    expect(() => createEngine({ arrivalProb: 1.5 })).toThrow(/arrivalProb/);
  });
});
