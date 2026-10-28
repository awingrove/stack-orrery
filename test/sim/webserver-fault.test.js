import { describe, it, expect } from 'vitest';
import { createWebServer } from '../../js/sim/webserver.js';
import { createNetwork } from '../../js/sim/network.js';
import { createBrowser } from '../../js/sim/browser.js';
import { createEngine } from '../../js/sim/engine.js';

// B-6 fault console — slice 1: WebServer down (docs/plans/
// 2026-10-27-b6-fault-console.md). The down flag is real component state;
// the transport (createNetwork) is the single refusal choke point consulted
// on BOTH entry points BEFORE dispatch. Titles are manifest refs (SIM
// slice tests) — do not reword.

const downServer = () => {
  const network = createNetwork();
  const server = createWebServer({ address: '10.1' });
  network.registerServer('10.1', server);
  server.setDown(true);
  return { network, server };
};

describe('createWebServer down flag', () => {
  it('setDown validates a boolean off/on flag and isDown reads it back (fail loud)', () => {
    const server = createWebServer({ address: '10.1' });
    expect(server.isDown()).toBe(false);
    server.setDown(true);
    expect(server.isDown()).toBe(true);
    server.setDown(false);
    expect(server.isDown()).toBe(false);
    for (const bad of ['yes', 1, null, undefined, {}]) {
      expect(() => server.setDown(bad)).toThrow(/boolean/);
    }
    expect(server.isDown()).toBe(false); // a rejected flip left the flag alone
  });

  // CHECKS: the down flag does NOT change the component's own methods — the
  // transport refuses first, so a down server answers nothing ON THE WIRE;
  // a direct in-process caller still reaches handleRequest/enqueue.
  it("a down server's handleRequest and enqueue answer a direct caller unchanged", () => {
    const { server } = downServer();
    expect(server.handleRequest('GET /')).toBe('200 Welcome to the home page');
    server.enqueue({ id: '1:1', atTick: 1, from: '10.2', to: '10.1', request: 'GET /' });
    expect(server.metrics().queueDepth).toBe(1);
    expect(server.step(1)[0]).toMatchObject({
      request: 'GET /',
      response: '200 Welcome to the home page',
      status: 200,
    });
  });
});

describe('createNetwork refusal choke point', () => {
  const REFUSAL = {
    from: '10.2',
    to: '10.1',
    request: 'GET /about',
    response: null,
    refused: true,
  };

  it('network send and deliverToQueue both refuse a registered-but-down host with the refusal-record shape', () => {
    const { network } = downServer();
    expect(network.send({ from: '10.2', to: '10.1', request: 'GET /about' })).toEqual(REFUSAL);
    expect(
      network.deliverToQueue({
        id: '1:1',
        from: '10.2',
        to: '10.1',
        request: 'GET /about',
        atTick: 1,
      }),
    ).toEqual(REFUSAL);
    // The count lives at the choke point, counting both entry points.
    expect(network.refusedCount()).toBe(2);
  });

  it('unregistered addresses still fail loud under the down check', () => {
    const { network } = downServer();
    expect(() => network.send({ from: '10.2', to: '11.1', request: 'GET /' })).toThrow(
      /no server at 11\.1/,
    );
  });

  it('a refused send hands the browser its refusal card, not a parsed status', () => {
    const { network } = downServer();
    const browser = createBrowser({ name: 'Browser (You)', address: '10.2', network });
    browser.get('10.1', '/about');
    expect(browser.last()).toMatchObject({
      status: 'REFUSED',
      response: null,
      body: 'connection refused — the browser shows its error page',
    });
  });

  // CHECKS: a refused delivery never reaches enqueue (the host's methods
  // are not consulted while it is down), so a down host's queue depth
  // cannot grow from refusals — named counter-example for the queue state.
  it('refused deliveries never enqueue — the down host queue depth stays flat and refusals tally', () => {
    const { network, server } = downServer();
    for (let i = 1; i <= 20; i += 1) {
      network.deliverToQueue({
        id: `1:${i}`,
        from: '10.2',
        to: '10.1',
        request: 'GET /',
        atTick: 1,
      });
    }
    expect(server.queueSnapshot()).toEqual([]);
    expect(server.metrics().queueDepth).toBe(0);
    expect(network.refusedCount()).toBe(20);
  });
});

describe('createEngine refusals (stage 1)', () => {
  it('the engine counts refusals (refusedCount) and never enqueues crowd sends while down', () => {
    const engine = createEngine({ seed: 42, stage: 1, arrivalProb: 1, users: 10 });
    engine.setServerDown('10.1', true);
    for (let i = 0; i < 3; i += 1) engine.step();
    const snap = engine.snapshot();
    expect(snap.refusedCount).toBeGreaterThanOrEqual(3);
    expect(snap.queueDepth).toBe(0); // refused sends went unenqueued
    expect(snap.served).toBe(0);
    expect(snap.servers[0]).toMatchObject({ down: true, queueDepth: 0 });
  });

  it('rejects setServerDown for an unknown address and a non-boolean flag', () => {
    const engine = createEngine({ seed: 42, stage: 1 });
    expect(() => engine.setServerDown('10.99', true)).toThrow(/no server at mini-IP 10\.99/);
    expect(() => engine.setServerDown('10.1', 'yes')).toThrow(/boolean/);
  });

  it('refusal-then-restore ends with a served 200', () => {
    const engine = createEngine({ seed: 42, stage: 1 });
    engine.setServerDown('10.1', true);
    engine.traceHop(); // hop 1: emit
    let snap = engine.traceHop(); // hop 2: refused at the deliver hop
    expect(snap.trace.hop).toBe(2);
    expect(snap.trace.refused).toBe(true);
    expect(snap.lastFrame).toBe(
      '10.2 -> 10.1 | GET /about => connection refused (nothing enqueued)',
    );

    engine.setServerDown('10.1', false);
    // The next emission restarts cleanly and walks the restored 4-hop
    // served shape: route, serve (200), render.
    snap = engine.traceHop();
    expect(snap.trace.hop).toBe(1);
    expect(snap.trace.refused).toBe(false);
    for (let hop = 2; hop <= 4; hop += 1) snap = engine.traceHop();
    expect(snap.trace.hop).toBe(4);
    expect(snap.trace.status).toBe(200);
    expect(snap.browserDisplay).toMatchObject({ status: 200, body: 'This is the about page' });
    expect(snap.refusedCount).toBe(1); // the earlier refusal is real history
  });

  // CHECKS (DL-3 counter-example): a refusal trace is NOT a clone of the
  // 4-hop 200 story — no served record for the request exists, so the
  // sim's lastStatus (snapshot.lastExchange.status) stays null and no
  // existing mission detector (m1-404: lastStatus === 404; m1-405: 405)
  // can be satisfied by a refusal.
  it('DL-3 counter-example — lastStatus stays null across a refusal, no mission detector can be satisfied', () => {
    const engine = createEngine({ seed: 42, stage: 1, arrivalProb: 1 });
    engine.setServerDown('10.1', true);
    for (let i = 0; i < 5; i += 1) engine.step(); // refused crowd sends only
    engine.traceHop(); // hop 1: emit
    const snap = engine.traceHop(); // deliver hop refused
    expect(snap.trace.refused).toBe(true);
    expect(snap.lastExchange).toBe(null);
    expect(snap.trace.status).toBe(null);
    expect(snap.trace.response).toBe(null);
    expect(snap.lastMatchedRoute).toBe(null);
    expect(snap.browserDisplay).toMatchObject({
      status: 'REFUSED',
      response: null,
    });
  });
});

describe('determinism with the fault off', () => {
  // PINS: a fixed seed with a fixed action sequence replays the identical
  // tick sequence while the fault machinery is installed but never turned
  // on — refusal state adds no randomness and no clock reads.
  it('same seed replays the identical tick sequence with the fault off', () => {
    const run = () => {
      const engine = createEngine({ seed: 7, users: 12, serviceRate: 4, arrivalProb: 0.6 });
      const out = Array.from({ length: 50 }, () => engine.step());
      out.push(
        ...Array.from({ length: 4 }, () => engine.traceHop({ method: 'GET', path: '/about' })),
      );
      out.push(engine.snapshot());
      return out;
    };
    const first = run();
    const second = run();
    expect(first).toEqual(second);
    const other = createEngine({ seed: 8, users: 12, serviceRate: 4, arrivalProb: 0.6 });
    const otherRun = Array.from({ length: 50 }, () => other.step());
    expect(otherRun).not.toEqual(first.slice(0, 50));
  });
});
