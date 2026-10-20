import { describe, it, expect } from 'vitest';
import { createCache } from '../../js/sim/cache.js';
import { createWebServer } from '../../js/sim/webserver.js';
import { createEngine } from '../../js/sim/engine.js';

describe('createCache', () => {
  it('serves cache hits before TTL expiry and evicts entries once ttlTicks elapse', () => {
    const cache = createCache({ address: '10.20', ttlTicks: 10 });

    // Cold lookup: a real Map miss, counted as one.
    expect(cache.get('/about', 1)).toBe(null);
    expect(cache.snapshot(1).lastLookup).toEqual({ key: '/about', status: 'MISS', atTick: 1 });

    // The cache-aside fill: set at tick 1 with ttlTicks 10 lives through
    // tick 10 (expiresAtTick = 11) and serves the exact stored value.
    cache.set('/about', 'This is the about page', 1);
    expect(cache.has('/about', 5)).toBe(true);
    expect(cache.get('/about', 5)).toBe('This is the about page');
    expect(cache.snapshot(5).lastLookup).toEqual({ key: '/about', status: 'HIT', atTick: 5 });
    expect(cache.snapshot(5).entries).toEqual([
      {
        key: '/about',
        value: 'This is the about page',
        cachedAtTick: 1,
        expiresAtTick: 11,
        ttlRemaining: 6,
      },
    ]);

    // CHECKS: the tick the TTL names is the first tick the entry is gone —
    // the lookup evicts it (evictions +1) and reports a miss rather than a stale hit.
    expect(cache.get('/about', 11)).toBe(null);
    expect(cache.has('/about', 11)).toBe(false);
    const snap = cache.snapshot(11);
    expect(snap).toMatchObject({ hits: 1, misses: 2, sets: 1, evictions: 1 });
    expect(snap.entries).toEqual([]);
    expect(snap.lastLookup).toEqual({ key: '/about', status: 'MISS', atTick: 11 });

    // CHECKS: an entry can outlive a re-set — the fill restarts the TTL.
    cache.set('/about', 'This is the about page', 20);
    expect(cache.get('/about', 29)).toBe('This is the about page');
    expect(cache.get('/about', 30)).toBe(null);
    expect(cache.snapshot(30).evictions).toBe(2);

    // CHECKS: the constructor rejects a non-mini-IP address and a
    // non-positive or non-integer ttlTicks (fail-loud over silent misconfig).
    expect(() => createCache({ address: '1020' })).toThrow(/invalid mini-IP/);
    expect(() => createCache({ ttlTicks: 0 })).toThrow(/ttlTicks/);
    expect(() => createCache({ ttlTicks: 2.5 })).toThrow(/ttlTicks/);
  });
});

describe('stage 3 cache-aside wiring', () => {
  // PINS: a warm GET cache hit costs 1 work unit and anything else costs 2,
  // so a warm server drains serviceRate * 2 requests per tick — 8 at the
  // default service rate of 4 — while a cold one stays at serviceRate.
  it('doubles warm capacity: hits cost 1 unit, misses and non-GETs cost 2', () => {
    const fill = () => {
      const cache = createCache({ address: '10.20', ttlTicks: 10 });
      // Pre-warm: the entry is live, so every queued GET prices at 1 unit.
      cache.set('/about', 'This is the about page', 0);
      const warm = createWebServer({ address: '10.11', serviceRate: 4, cache });
      for (let i = 0; i < 10; i++) {
        warm.enqueue({ id: `warm:${i}`, atTick: 1, request: 'GET /about' });
      }
      return warm.step(1);
    };

    // Warm: budget 8 units at 1 per hit serves 8 of the 10 queued GETs.
    const warmBatch = fill();
    expect(warmBatch).toHaveLength(8);
    expect(warmBatch.every((r) => r.cacheStatus === 'HIT')).toBe(true);

    // CHECKS: cold 404 paths do not fill the cache, so every request misses
    // and costs 2 units — budget 8 serves only 4 of the 10 queued.
    const cold = createWebServer({ address: '10.12', serviceRate: 4, cache: createCache() });
    for (let i = 0; i < 10; i++) {
      cold.enqueue({ id: `cold:${i}`, atTick: 1, request: 'GET /missing' });
    }
    const coldBatch = cold.step(1);
    expect(coldBatch).toHaveLength(4);
    expect(coldBatch.every((r) => r.cacheStatus === 'MISS' && r.status === 404)).toBe(true);

    // A cold 200 path fills on the first miss: the remaining lookups price
    // as 1-unit hits, so the same budget stretches to 7 of 10.
    const filler = createWebServer({ address: '10.12', serviceRate: 4, cache: createCache() });
    for (let i = 0; i < 10; i++) {
      filler.enqueue({ id: `mix:${i}`, atTick: 1, request: 'GET /about' });
    }
    const mixBatch = filler.step(1);
    expect(mixBatch.map((r) => r.cacheStatus)).toEqual([
      'MISS',
      'HIT',
      'HIT',
      'HIT',
      'HIT',
      'HIT',
      'HIT',
    ]);

    // Non-GET bypasses the cache at 2 units and still answers 405.
    const bypassCache = createCache();
    bypassCache.set('/', 'Welcome to the home page', 0);
    const bypass = createWebServer({ address: '10.11', serviceRate: 4, cache: bypassCache });
    bypass.enqueue({ id: 'p:0', atTick: 1, request: 'POST /' });
    bypass.enqueue({ id: 'g:0', atTick: 1, request: 'GET /' });
    const mixed = bypass.step(1);
    expect(mixed.map((r) => [r.status, r.cacheStatus])).toEqual([
      [405, 'BYPASS'],
      [200, 'HIT'],
    ]);
  });

  // PINS: both backends attach the same Cache instance, so a fill served
  // through 10.11 serves a warm HIT through 10.12 on the next trace — and
  // the engine snapshots the shared cache for the panel.
  it('stage 3 engine shares cache-aside entries across 10.11 and 10.12', () => {
    const engine = createEngine({ stage: 3, ttlTicks: 10 });
    let snap = engine.snapshot();
    expect(snap.cache).not.toBe(null);
    expect(snap.cache.address).toBe('10.20');
    expect(snap.cache.hits).toBe(0);

    // First 6-hop trace: round-robin picks 10.11; the cold lookup misses
    // and the 200 response warms the shared cache.
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.hop).toBe(6);
    expect(snap.trace.targetServer).toBe('10.11');
    expect(snap.trace.cacheStatus).toBe('MISS');
    expect(snap.cache.misses).toBe(1);
    expect(snap.cache.entries.map((e) => e.key)).toEqual(['/about']);
    expect(snap.browserDisplay.body).toBe('This is the about page');

    // Second trace: round-robin moves to 10.12; the shared entry is a HIT.
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.targetServer).toBe('10.12');
    expect(snap.trace.cacheStatus).toBe('HIT');
    expect(snap.cache.hits).toBe(1);
    expect(snap.cache.misses).toBe(1);

    // TTL eviction runs once per tick before anything is served: after
    // ttlTicks crowd ticks, the warmed entry is gone (evictions +1).
    for (let i = 0; i < 10; i++) engine.step();
    snap = engine.snapshot();
    expect(snap.cache.evictions).toBeGreaterThanOrEqual(1);
    expect(snap.cache.entries.every((e) => e.ttlRemaining > 0)).toBe(true);

    // Stages 1 and 2 expose no cache at all.
    expect(createEngine({ stage: 1 }).snapshot().cache).toBe(null);
    expect(createEngine({ stage: 2 }).snapshot().cache).toBe(null);
  });
});
