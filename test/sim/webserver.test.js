import { describe, it, expect } from 'vitest';
import { createWebServer } from '../../js/sim/webserver.js';
import { createCache } from '../../js/sim/cache.js';

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

  // The plan (Stage 1 interactive UI) extends the wire record with
  // routeId + isYou; this pin pins the full record, not fewer fields.
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
        isYou: false,
        response: '200 This is the about page',
        status: 200,
        body: 'This is the about page',
        routeId: 'route-about',
        latencyTicks: 1,
      },
    ]);
  });

  it('serves files from its local filesystem Map and leaves 404/405 routeId null', () => {
    const server = createWebServer({
      address: '10.1',
      files: { '/': 'Custom root', '/status': 'All green' },
    });
    expect(server.filesSnapshot()).toEqual({ '/': 'Custom root', '/status': 'All green' });
    expect(server.matchRoute('GET /status')).toEqual({
      response: '200 All green',
      status: 200,
      body: 'All green',
      routeId: 'route-status',
    });
    expect(server.matchRoute('GET /missing').routeId).toBe(null);
    expect(server.matchRoute('POST /status').routeId).toBe(null);
  });
});

// The editable filesystem (editable-fs brief): writeFile mutates the fs
// Map an existing key with a non-empty string body and throws otherwise; an
// edit is NOT a POST — the cache keeps its old bytes until the TTL expires.
describe('writeFile (editable WebServer filesystem)', () => {
  it('writes an existing fs key so GET serves the new body from the Map', () => {
    const server = createWebServer({ address: '10.1' });
    server.writeFile('/about', 'New body');

    // The Map mutates in place: new bytes on the wire, insertion order kept.
    expect(server.filesSnapshot()).toEqual({
      '/': 'Welcome to the home page',
      '/about': 'New body',
    });
    expect(Object.keys(server.filesSnapshot())).toEqual(['/', '/about']);
    expect(server.handleRequest('GET /about')).toBe('200 New body');
    expect(server.matchRoute('GET /about').routeId).toBe('route-about');
  });

  it('throws on an unknown fs path and on an empty or non-string body (fail loud)', () => {
    const server = createWebServer({ address: '10.1' });
    expect(() => server.writeFile('/missing', 'New body')).toThrow(/unknown fs path/);
    expect(() => server.writeFile('/about', '')).toThrow(/non-empty string/);
    expect(() => server.writeFile('/about', 42)).toThrow(/non-empty string/);
    // A throw is a no-op: the fs stays exactly as it was.
    expect(server.filesSnapshot()).toEqual({
      '/': 'Welcome to the home page',
      '/about': 'This is the about page',
    });
  });

  it('keeps a stage-3 cached copy stale until the TTL expires (no write-through invalidation)', () => {
    const cache = createCache({ address: '10.20', ttlTicks: 10 });
    const server = createWebServer({ address: '10.11', cache });
    server.enqueue({ id: '1:a', atTick: 1, request: 'GET /about' });
    server.step(1); // cold MISS warms the cache from the fs Map

    server.writeFile('/about', 'New body');
    // Inside the entry's TTL the lookup is a HIT serving the OLD body —
    // the edit did not invalidate anything (an edit is not a POST: no
    // write-through, no cache.del — the invalidation stays a POST path).
    server.enqueue({ id: '5:a', atTick: 5, request: 'GET /about' });
    const stale = server.step(5);
    expect(stale).toHaveLength(1);
    expect(stale[0].cacheStatus).toBe('HIT');
    expect(stale[0].body).toBe('This is the about page');
    expect(cache.has('/about', 5)).toBe(true);

    // After the TTL expires the next lookup misses and re-fills from the
    // edited Map: the NEW bytes serve only post-expiry.
    server.enqueue({ id: '15:a', atTick: 15, request: 'GET /about' });
    const fresh = server.step(15);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].cacheStatus).toBe('MISS');
    expect(fresh[0].body).toBe('New body');
  });
});
