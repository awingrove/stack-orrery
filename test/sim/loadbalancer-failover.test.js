import { describe, it, expect } from 'vitest';
import { createNetwork } from '../../js/sim/network.js';
import { createWebServer } from '../../js/sim/webserver.js';
import { createLoadBalancer } from '../../js/sim/loadbalancer.js';
import { createBrowser } from '../../js/sim/browser.js';
import { createEngine } from '../../js/sim/engine.js';

// B-6b fault console slice 2 (docs/plans/2026-10-28-b6b-backend-failover.md):
// the LB cursor is health-aware — it skips a down backend, tallies the
// skips, and hands an all-down pool to the slice-1 refusal funnel. Titles
// are manifest refs (SIM slice tests) — do not reword.

const healthyPair = () => {
  const network = createNetwork();
  const s1 = createWebServer({ address: '10.11', serviceRate: 4 });
  const s2 = createWebServer({ address: '10.12', serviceRate: 4 });
  network.registerServer('10.11', s1);
  network.registerServer('10.12', s2);
  const lb = createLoadBalancer({ address: '10.1', backends: ['10.11', '10.12'], network });
  network.registerServer('10.1', lb);
  return { network, s1, s2, lb };
};

describe('health-skip round-robin', () => {
  it('selectBackend skips a down backend — the cursor lands on the healthy backend, skips tally, rotation resumes', () => {
    const { s2, lb } = healthyPair();
    s2.setDown(true);
    // Cursor opens at 10.11, so the first pick takes no skip.
    expect(lb.enqueue({ id: '1:1', atTick: 1, request: 'GET /' })).toBe('10.11');
    expect(lb.enqueue({ id: '1:2', atTick: 1, request: 'GET /about' })).toBe('10.11');
    expect(lb.skippedCount()).toBe(1);
    expect(lb.lastSkip()).toBe('10.12');
    // The cursor landed where the skip left it — the down seat is retried
    // first, so the healthy pair's rotation pace is preserved.
    expect(lb.nextBackend()).toBe('10.12');
    expect(lb.snapshot()).toMatchObject({
      forwarded: 2,
      skippedCount: 1,
      lastTarget: '10.11',
      perBackend: { 10.11: 2, 10.12: 0 },
    });
    // Rotation resumes: restore and the skipped seat takes its next turn.
    s2.setDown(false);
    expect(lb.enqueue({ id: '1:3', atTick: 2, request: 'GET /' })).toBe('10.12');
    expect(lb.enqueue({ id: '1:4', atTick: 2, request: 'GET /' })).toBe('10.11');
    expect(lb.snapshot()).toMatchObject({
      forwarded: 4,
      skippedCount: 1,
      perBackend: { 10.11: 3, 10.12: 1 },
    });
  });

  it('the down address is never sent to or delivered to while the pool skips it', () => {
    // A network double records every addressed crossing — the contract is
    // that no wire attempt exists at the skipped seat at all (no refused
    // attempts either: the skip happens before any transport crossing).
    const attempts = [];
    const table = { 10.11: { isDown: () => false }, 10.12: { isDown: () => true } };
    const network = {
      resolve: (address) => table[address],
      send: ({ to }) => {
        attempts.push(`send ${to}`);
        return { to, response: '200 spied' };
      },
      deliverToQueue: ({ to }) => {
        attempts.push(`deliver ${to}`);
      },
    };
    const lb = createLoadBalancer({ address: '10.1', backends: ['10.11', '10.12'], network });
    expect(lb.enqueue({ id: '1:1', atTick: 1, request: 'GET /' })).toBe('10.11');
    expect(lb.handleRequest('GET /about')).toBe('200 spied');
    expect(lb.enqueue({ id: '1:2', atTick: 2, request: 'GET /' })).toBe('10.11');
    expect(attempts).toEqual(['deliver 10.11', 'send 10.11', 'deliver 10.11']);
  });

  it('all backends down hands back the slice-1 refusal record and refusals tally with nothing enqueued', () => {
    const { network, s1, s2, lb } = healthyPair();
    s1.setDown(true);
    s2.setDown(true);
    const seat = lb.nextBackend();
    const refused = lb.enqueue({ id: '1:1', atTick: 1, request: 'GET /about' });
    expect(refused).toEqual({
      from: '10.2',
      to: seat,
      request: 'GET /about',
      response: null,
      refused: true,
    });
    expect(network.refusedCount()).toBe(1);
    // The failed pass commits nothing: no forward, no skip, no cursor move.
    expect(lb.snapshot()).toMatchObject({
      forwarded: 0,
      skippedCount: 0,
      nextBackend: seat,
      perBackend: { 10.11: 0, 10.12: 0 },
    });
    // A second attempt tallies again; nothing was enqueued anywhere.
    expect(lb.enqueue({ id: '1:2', atTick: 1, request: 'GET /' }).refused).toBe(true);
    expect(s1.metrics().queueDepth).toBe(0);
    expect(s2.metrics().queueDepth).toBe(0);
    expect(network.refusedCount()).toBe(2);
    // The same funnel answers the browser path through the VIP.
    const browser = createBrowser({ name: 'Browser (You)', address: '10.2', network });
    browser.get('10.1', '/about');
    expect(browser.last()).toMatchObject({ status: 'REFUSED', response: null });
    expect(network.refusedCount()).toBe(3);
    // Restore: the untouched cursor seat takes the next selection.
    s1.setDown(false);
    s2.setDown(false);
    expect(lb.enqueue({ id: '1:3', atTick: 2, request: 'GET /' })).toBe(seat);
  });

  it('an all-down pool aborts the stage-2 trace at the LB hop with the refusal record', () => {
    const engine = createEngine({ seed: 42, stage: 2, users: 5, arrivalProb: 0 });
    engine.setServerDown('10.11', true);
    engine.setServerDown('10.12', true);
    engine.traceHop(); // hop 1 - the emit estimate
    engine.traceHop(); // hop 2 - routed to the LB
    const snap = engine.traceHop(); // hop 3 - the LB hop, all-down
    expect(snap.trace.hop).toBe(3);
    expect(snap.trace.refused).toBe(true);
    expect(snap.trace.targetServer).toBe(null);
    expect(snap.trace.status).toBe(null);
    expect(snap.lastFrame).toBe(
      'LB 10.1 -> 10.11 | GET /about => connection refused (nothing enqueued)',
    );
    expect(snap.browserDisplay).toMatchObject({ status: 'REFUSED', response: null });
    expect(snap.refusedCount).toBe(1);
    // Restore: the next emission restarts cleanly at hop 1.
    engine.setServerDown('10.11', false);
    engine.setServerDown('10.12', false);
    expect(engine.traceHop().trace.hop).toBe(1);
  });

  it('stage-2 engine snapshot carries skippedCount', () => {
    const engine = createEngine({ seed: 42, stage: 2, users: 10, arrivalProb: 1 });
    expect(engine.snapshot().skippedCount).toBe(0);
    engine.setServerDown('10.12', true);
    for (let i = 0; i < 4; i += 1) engine.step();
    const snap = engine.snapshot();
    expect(snap.skippedCount).toBeGreaterThanOrEqual(1);
    // Quotes the healthy-pool contract in one read: no refusals while one
    // backend is down, and the pool keeps serving.
    expect(snap.refusedCount).toBe(0);
    expect(snap.served).toBeGreaterThan(0);
    expect(snap.servers[1].down).toBe(true);
  });

  it('distribution lopsides while 10.12 is down and rejoins the rotation after restore (deterministic)', () => {
    const engine = createEngine({ seed: 42, stage: 2, users: 10, arrivalProb: 1 });
    for (let i = 0; i < 6; i += 1) engine.step();
    const warm = engine.snapshot().loadBalancer.perBackend;
    expect(warm['10.11']).toBeGreaterThanOrEqual(1);
    expect(warm['10.12']).toBeGreaterThanOrEqual(1);
    engine.setServerDown('10.12', true);
    const before = engine.snapshot().loadBalancer.perBackend['10.12'];
    for (let i = 0; i < 6; i += 1) engine.step();
    const downStats = engine.snapshot().loadBalancer.perBackend;
    expect(downStats['10.12']).toBe(before); // frozen while down
    expect(downStats['10.11']).toBeGreaterThan(warm['10.11']); // it took the whole load
    engine.setServerDown('10.12', false);
    for (let i = 0; i < 6; i += 1) engine.step();
    const rejoin = engine.snapshot().loadBalancer.perBackend;
    expect(rejoin['10.12']).toBeGreaterThan(before); // it rejoins and serves again
  });

  it('same seed replays the identical tick sequence with the fault off (stage 2)', () => {
    const run = () => {
      const engine = createEngine({
        seed: 7,
        stage: 2,
        users: 12,
        serviceRate: 4,
        arrivalProb: 0.6,
      });
      const out = Array.from({ length: 50 }, () => engine.step());
      out.push(
        ...Array.from({ length: 5 }, () => engine.traceHop({ method: 'GET', path: '/about' })),
      );
      out.push(engine.snapshot());
      return out;
    };
    expect(run()).toEqual(run());
  });
});
