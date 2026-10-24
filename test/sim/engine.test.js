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

  it('rejects a stage outside 1..6', () => {
    expect(() => createEngine({ stage: 7 })).toThrow(
      /engine: stage must be 1, 2, 3, 4, 5, or 6, got 7/,
    );
  });

  // PINS: the stage-6 trace machine — hosted paths get the DNS ask/answer
  // prelude (+2 hops, 10 total), then the byte-identical stage-5 chain.
  it('traces example.com/about through the DNS ask/answer prelude into the stage-5 chain', () => {
    const engine = createEngine({ stage: 6 });
    const frames = [];
    for (let hop = 1; hop <= 10; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: 'example.com/about' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    expect(frames).toEqual([
      '10.2 -> example.com | GET example.com/about',
      '10.2 -> 10.60 | who is example.com?',
      '10.60 -> 10.2 | 10.1',
      // Hops 4-10: the stage-5 chain shifted +2, request re-pointed by the
      // answer — no DNS tokens appear again after hop 3.
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      'Database SELECT /about @ 10.31 (fresh)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
      'Network delivered 200 response to 10.2',
      'Browser 10.2 received and displayed 200',
      'Worker 10.41 idle — no async jobs in this trace',
    ]);
    const snap = engine.snapshot();
    expect(snap.trace.hop).toBe(10);
    expect(snap.trace.request).toBe('GET /about');
    expect(snap.trace.dnsTarget).toBe('10.1');
    // The rendered response landed on the browser exactly once.
    expect(snap.browserDisplay.body).toBe('This is the about page');
  });

  // CHECKS: named counter-example — a plain /about path keeps the stage-5
  // trace shape on stage 6 too: 8 hops, no DNS hop, no cross-subnet hop.
  it('keeps a host-less /about trace at the stage-5 hop story on stage 6', () => {
    const engine = createEngine({ stage: 6 });
    const frames = [];
    for (let hop = 1; hop <= 8; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: '/about' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    // Byte-identical to the stage-5 machine's frames.
    expect(frames).toEqual([
      '10.2 -> 10.1 | GET /about',
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      'Database SELECT /about @ 10.31 (fresh)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
      'Network delivered 200 response to 10.2',
      'Browser 10.2 received and displayed 200',
      'Worker 10.41 idle — no async jobs in this trace',
    ]);
    const snap = engine.snapshot();
    expect(snap.trace.host).toBe(null);
    expect(snap.dns.lookups).toBe(0);
  });

  // CHECKS: named counter-example — an NX answer ends the trace at hop 3, no
  // GET is emitted (no onFinish, served stays 0), the browser renders the NX
  // card, and a following traceHop RESTARTS a fresh trace at hop 1 (it cannot
  // walk a phantom hop 4 of the dead NX trace).
  it('ends an NX trace at the DNS answer hop without ever emitting a GET', () => {
    const engine = createEngine({ stage: 6 });
    let snap = engine.traceHop({ method: 'GET', path: 'missing-host.example/about' });
    expect(snap.lastFrame).toBe('10.2 -> missing-host.example | GET missing-host.example/about');
    snap = engine.traceHop();
    expect(snap.lastFrame).toBe('10.2 -> 10.60 | who is missing-host.example?');
    snap = engine.traceHop();
    expect(snap.lastFrame).toBe('10.60 -> 10.2 | NX no record');
    expect(snap.trace.hop).toBe(3);
    expect(snap.trace.nx).toBe(true);
    expect(snap.browserDisplay).toMatchObject({
      status: 'NX',
      body: 'NX no record — no GET emitted',
    });
    expect(snap.cache.entries).toEqual([]); // no GET ever reached the pool
    expect(snap.queue).toEqual([]);

    // A fresh traceHop restarts cleanly — hop 1 of a new emission.
    snap = engine.traceHop({ method: 'GET', path: '/about' });
    expect(snap.trace.hop).toBe(1);
    expect(snap.trace.nx).toBe(false);
    expect(snap.lastFrame).toBe('10.2 -> 10.1 | GET /about');
    expect(engine.snapshot().served).toBe(0);
    // And the restarted trace walks the full stage-5 chain to its finish.
    for (let hop = 2; hop <= 8; hop++) snap = engine.traceHop();
    expect(snap.trace.hop).toBe(8);
    expect(snap.browserDisplay.status).toBe(200);
  });
});
