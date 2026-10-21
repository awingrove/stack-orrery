import { describe, it, expect } from 'vitest';
import { createNetwork } from '../../js/sim/network.js';
import { createWebServer } from '../../js/sim/webserver.js';
import { createLoadBalancer } from '../../js/sim/loadbalancer.js';
import { createBrowser } from '../../js/sim/browser.js';
import { createEngine } from '../../js/sim/engine.js';

describe('createLoadBalancer', () => {
  // PINS: the round-robin cursor cycles strictly through the backend pool
  // in order without randomness, both for synchronous sends and queued steps.
  it('distributes requests strictly round-robin across backend mini-IPs', () => {
    const network = createNetwork();
    const s1 = createWebServer({ address: '10.11', serviceRate: 4 });
    const s2 = createWebServer({ address: '10.12', serviceRate: 4 });
    network.registerServer('10.11', s1);
    network.registerServer('10.12', s2);

    const lb = createLoadBalancer({
      address: '10.1',
      backends: ['10.11', '10.12'],
      network,
    });
    network.registerServer('10.1', lb);

    expect(lb.nextBackend()).toBe('10.11');
    const t1 = lb.enqueue({ id: '1:0', atTick: 1, from: '10.2', request: 'GET /' });
    expect(t1).toBe('10.11');
    expect(lb.nextBackend()).toBe('10.12');

    const t2 = lb.enqueue({ id: '1:1', atTick: 1, from: '10.2', request: 'GET /about' });
    expect(t2).toBe('10.12');
    expect(lb.nextBackend()).toBe('10.11');

    const t3 = lb.enqueue({ id: '1:2', atTick: 1, from: '10.2', request: 'GET /missing' });
    expect(t3).toBe('10.11');

    expect(s1.metrics().queueDepth).toBe(2);
    expect(s2.metrics().queueDepth).toBe(1);
    expect(lb.snapshot()).toEqual({
      address: '10.1',
      algorithm: 'round-robin',
      backends: ['10.11', '10.12'],
      nextBackend: '10.12',
      forwarded: 3,
      lastTarget: '10.11',
      perBackend: { 10.11: 2, 10.12: 1 },
    });

    // Synchronous browser.get through 10.1 also forwards to the next backend (10.12).
    const browser = createBrowser({ address: '10.2', network });
    const res = browser.get('10.1', '/about');
    expect(res.status).toBe(200);
    expect(lb.snapshot().lastTarget).toBe('10.12');
    expect(lb.snapshot().forwarded).toBe(4);
  });

  // PINS: under identical seed and crowd arrival, Stage 2 (2 servers x 4/tick = 8/tick)
  // keeps queue depth lower than Stage 1 (1 server x 4/tick) and alternates
  // 5-hop interactive traces between 10.11 and 10.12.
  it('stage 2 engine splits load across 10.11 and 10.12 and doubles service capacity', () => {
    const stage1 = createEngine({
      seed: 42,
      users: 14,
      serviceRate: 4,
      arrivalProb: 0.5,
      stage: 1,
    });
    const stage2 = createEngine({
      seed: 42,
      users: 14,
      serviceRate: 4,
      arrivalProb: 0.5,
      stage: 2,
    });

    for (let i = 0; i < 15; i++) {
      stage1.step();
      stage2.step();
    }
    const snap1 = stage1.snapshot();
    const snap2 = stage2.snapshot();
    expect(snap1.queueDepth).toBeGreaterThan(snap2.queueDepth);
    expect(snap2.servers).toHaveLength(2);
    expect(snap2.servers[0].served).toBeGreaterThan(0);
    expect(snap2.servers[1].served).toBeGreaterThan(0);
    expect(snap2.loadBalancer.forwarded).toBeGreaterThan(0);

    // Interactive 5-hop trace alternates backends across consecutive requests.
    const traceEngine = createEngine({ seed: 42, users: 5, stage: 2 });
    for (let hop = 0; hop < 5; hop++) traceEngine.traceHop({ method: 'GET', path: '/about' });
    const firstTrace = traceEngine.snapshot();
    expect(firstTrace.trace.hop).toBe(5);
    expect(firstTrace.trace.targetServer).toBe('10.11');
    expect(firstTrace.browserDisplay.body).toBe('This is the about page');

    for (let hop = 0; hop < 5; hop++) traceEngine.traceHop({ method: 'GET', path: '/' });
    const secondTrace = traceEngine.snapshot();
    expect(secondTrace.trace.hop).toBe(5);
    expect(secondTrace.trace.targetServer).toBe('10.12');
    expect(secondTrace.browserDisplay.body).toBe('Welcome to the home page');
  });

  it('rejects invalid mini-IP addresses, empty backend pools, or missing network', () => {
    expect(() => createLoadBalancer({ address: 'bad' })).toThrow(/invalid mini-IP/);
    expect(() => createLoadBalancer({ backends: [] })).toThrow(/non-empty list/);
    expect(() => createLoadBalancer({ backends: ['10.11', 'bad'] })).toThrow(/non-empty list/);
    const detached = createLoadBalancer();
    expect(() => detached.handleRequest('GET /')).toThrow(/no network attached/);
    expect(() => detached.enqueue({ id: '1:0', atTick: 1 })).toThrow(/no network attached/);
    // CHECKS: an out-of-range stage fails loud (3 became valid with Stage 3;
    // 4 became valid with Stage 4; 5 is not a shipped stage and still rejects).
    expect(() => createEngine({ stage: 6 })).toThrow(/stage must be/);
  });
});
