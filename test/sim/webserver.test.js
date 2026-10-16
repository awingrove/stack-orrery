import { describe, it, expect } from 'vitest';
import { createWebServer } from '../../js/sim/webserver.js';

describe('createWebServer', () => {
  it('queue depth climbs when arrival rate exceeds service rate', () => {
    const server = createWebServer({ serviceRate: 4 });
    // 10 arrivals per tick against a service rate of 4: net +6 per tick.
    let depth = 0;
    for (let tick = 1; tick <= 5; tick++) {
      for (let i = 0; i < 10; i++) server.enqueue({ id: `${tick}:${i}`, atTick: tick });
      server.step(tick);
      depth = server.metrics().queueDepth;
    }
    expect(depth).toBe(30); // 5 * (10 - 4)
  });

  it('drains FIFO, never more than serviceRate per tick, and latency rises with the wait', () => {
    const server = createWebServer({ serviceRate: 2 });
    server.enqueue({ id: 'a', atTick: 1 });
    server.enqueue({ id: 'b', atTick: 1 });
    server.enqueue({ id: 'c', atTick: 1 });

    const first = server.step(1);
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
    expect(server.metrics().queueDepth).toBe(1);

    const second = server.step(5); // 'c' waited ticks 1..5
    expect(second.map((r) => r.id)).toEqual(['c']);
    expect(second[0].latencyTicks).toBe(5);
    expect(server.metrics().served).toBe(3);
  });

  it('rejects a non-positive service rate (fail loud, not silent-slow)', () => {
    expect(() => createWebServer({ serviceRate: 0 })).toThrow(/serviceRate/);
    expect(() => createWebServer({ serviceRate: 2.5 })).toThrow(/serviceRate/);
  });

  it('handleRequest routes slim GET paths to 200 or 404 and rejects non-GET with 405', () => {
    const server = createWebServer({ address: '10.1' });
    expect(server.handleRequest('GET /')).toBe('200 Welcome to the home page');
    expect(server.handleRequest('GET /about')).toBe('200 This is the about page');
    expect(server.handleRequest('GET /missing')).toBe('404 Page not found');
    expect(server.handleRequest('POST /')).toBe('405 Only GET requests are supported');
    expect(server.handleRequest('DELETE /about')).toBe('405 Only GET requests are supported');
  });

  it('serves the full wire record: the queued request comes back with its response', () => {
    const server = createWebServer({ address: '10.1' });
    server.enqueue({
      id: '3:1',
      atTick: 3,
      from: '10.2',
      to: '10.1',
      request: 'GET /about',
    });
    const out = server.step(3);
    expect(out).toEqual([
      {
        id: '3:1',
        from: '10.2',
        to: '10.1',
        request: 'GET /about',
        response: '200 This is the about page',
        status: 200,
        body: 'This is the about page',
        latencyTicks: 1,
      },
    ]);
  });
});
