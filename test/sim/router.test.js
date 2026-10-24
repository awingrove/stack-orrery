import { describe, it, expect } from 'vitest';
import { createNetwork } from '../../js/sim/network.js';
import { createRouter } from '../../js/sim/router.js';
import { createWebServer } from '../../js/sim/webserver.js';
import { createEngine } from '../../js/sim/engine.js';

describe('createRouter', () => {
  // CHECKS: both addresses validate as two-number mini-IPs and both network
  // instances must attach — a misconfigured topology fails at construction,
  // not at first traffic.
  it('rejects invalid mini-IPs and missing networks at construction', () => {
    expect(() => createRouter({ leftAddress: '1065' })).toThrow(/invalid mini-IP/);
    expect(() => createRouter({ rightAddress: '201' })).toThrow(/invalid mini-IP/);
    expect(() => createRouter({ leftNetwork: null, rightNetwork: createNetwork() })).toThrow(
      /router: leftNetwork and rightNetwork are required/,
    );
    expect(() => createRouter({ leftNetwork: createNetwork(), rightNetwork: null })).toThrow(
      /router: leftNetwork and rightNetwork are required/,
    );
  });

  it('passes same-subnet frames through untouched and takes exactly one hop across subnets', () => {
    const left = createNetwork();
    const right = createNetwork();
    const webserver = createWebServer({ address: '10.1' });
    left.registerServer('10.1', webserver);
    const router = createRouter({
      leftAddress: '10.65',
      rightAddress: '20.1',
      leftNetwork: left,
      rightNetwork: right,
    });

    // Same-subnet passthrough: the left network's existing enqueue contract
    // runs verbatim — the router's counters stay untouched.
    left.registerServer('10.11', {
      enqueue: (frame) => {
        enqueued = frame;
      },
    });
    let enqueued = null;
    router.forward({
      id: 'a',
      from: '10.2',
      to: '10.11',
      request: 'GET /',
      atTick: 1,
      isYou: true,
    });
    expect(enqueued).toEqual({
      id: 'a',
      from: '10.2',
      to: '10.11',
      request: 'GET /',
      atTick: 1,
      isYou: true,
    });
    expect(router.snapshot()).toMatchObject({ address: '10.65', rightAddress: '20.1', routed: 0 });

    // The router's own 20-side seat answers on the wire — subnet 20 holds
    // nothing else in 6a, so 20.1 is the only reachable cross-subnet target.
    expect(right.send({ from: '10.2', to: '20.1', request: 'GET /' }).response).toBe(
      '200 Router 10.65 ⇄ 20.1',
    );

    // PINS: a cross-subnet frame increments `routed` exactly once and hands
    // the frame to the right network; `isYou` rides through.
    let rightEnqueued = null;
    right.registerServer('20.2', {
      enqueue: (frame) => {
        rightEnqueued = frame;
      },
    });
    router.forward({
      id: 'b',
      from: '10.2',
      to: '20.2',
      request: 'GET /edge',
      atTick: 2,
      isYou: true,
    });
    expect(rightEnqueued).toEqual({
      id: 'b',
      from: '10.2',
      to: '20.2',
      request: 'GET /edge',
      atTick: 2,
      isYou: true,
    });
    expect(router.snapshot().routed).toBe(1);
    expect(router.snapshot().lastCross).toEqual({
      from: '10.2',
      to: '20.2',
      request: 'GET /edge',
      isYou: true,
    });

    // CHECKS: an unregistered 20.x host throws at the wire, fail-loud
    // (mirroring network.js's own resolve), and the failed frame does not
    // count as routed.
    expect(() => right.send({ from: '10.2', to: '20.9', request: 'GET /' })).toThrow(
      /no server at 20\.9/,
    );
    expect(router.snapshot().routed).toBe(1);
  });

  // PINS: the engine wires the Router at 10.65 ⇄ 20.1 and exposes
  // snapshot.router; stages 1-5 expose no router at all.
  it('stage 6 engine exposes the router; stages 1-5 do not', () => {
    const snap = createEngine({ stage: 6 }).snapshot();
    expect(snap.router).not.toBe(null);
    expect(snap.router).toMatchObject({ address: '10.65', rightAddress: '20.1', routed: 0 });
    expect(createEngine({ stage: 1 }).snapshot().router).toBe(null);
    expect(createEngine({ stage: 5 }).snapshot().router).toBe(null);
  });
});
