import { describe, it, expect } from 'vitest';
import { createCache } from '../../js/sim/cache.js';
import { createEngine } from '../../js/sim/engine.js';

// B-6c cache bypass (docs/plans/2026-10-29-b6c-cache-bypass.md): the fault
// is real component state — the shared Cache's own setBypass/isBypass flag
// the WebServer consults before each lookup. While bypassed the origin
// serves every GET (cacheStatus 'BYPASSED'), the counters freeze (nothing
// consults them), TTL bookkeeping keeps its tick schedule, and the
// webserver tallies its origin-path routes. Titles are manifest refs
// (SIM slice tests) — do not reword.

describe('cache bypass (B-6c)', () => {
  it('setBypass validates a boolean ON/OFF flag and isBypass reads it back (fail loud)', () => {
    const cache = createCache({});
    expect(cache.isBypass()).toBe(false);
    cache.setBypass(true);
    expect(cache.isBypass()).toBe(true);
    cache.setBypass(false);
    expect(cache.isBypass()).toBe(false);
    // Any non-boolean input throws with the flag's own message instead of
    // silently leaving the cache in an unspecified consult state.
    expect(() => cache.setBypass('yes')).toThrow(/bypassed must be a boolean, got yes/);
    expect(() => cache.setBypass(1)).toThrow(/bypassed must be a boolean, got 1/);
    expect(() => cache.setBypass(null)).toThrow(/bypassed must be a boolean, got null/);
    // A rejected input changes nothing.
    expect(cache.isBypass()).toBe(false);
  });

  // CHECKS: B-6c core contract — while bypassed, get()/has() short-circuit
  // before the entry table; no eviction sweep runs inside the lookup, no
  // counter moves, and get() hands back null while its own lookup record
  // carries the BYPASSED status. TTL bookkeeping itself does NOT consult
  // the bypass: a direct evictExpired past expiry still evicts.
  it('a bypassed lookup leaves the entries and the counters untouched — get hands back null with a BYPASSED record and has peers nothing', () => {
    const cache = createCache({ address: '10.20', ttlTicks: 10 });
    cache.set('/about', 'This is the about page', 1);
    const before = cache.snapshot(5);
    expect(before.entries).toHaveLength(1);
    cache.setBypass(true);
    expect(cache.get('/about', 7)).toBe(null);
    expect(cache.has('/about', 7)).toBe(false);
    // Same-tick projections: the raw entry rows and every counter compare
    // byte-for-byte against the pre-bypass snapshot.
    const after = cache.snapshot(5);
    // The entry table and every counter are byte-identical to the
    // pre-bypass snapshot — the lookup consumed nothing.
    expect(after.entries).toEqual(before.entries);
    expect([after.hits, after.misses, after.sets, after.evictions]).toEqual([
      before.hits,
      before.misses,
      before.sets,
      before.evictions,
    ]);
    // The lookup record on the cache itself names what happened.
    expect(after.lastLookup).toEqual({ key: '/about', status: 'BYPASSED', atTick: 7 });
    expect(after.bypassed).toBe(true);
    // TTL bookkeeping is orthocritical to the lesson: expiry evicts on its
    // own schedule whether or not anyone consults the cache.
    cache.evictExpired(12);
    const expired = cache.snapshot(12);
    expect(expired.evictions).toBe(1);
    expect(expired.entries).toEqual([]);
    expect(cache.isBypass()).toBe(true);
  });

  it('engine setCacheBypassed is fail-loud below stage 3 — no cache exists there', () => {
    const stage1 = createEngine({ stage: 1 });
    expect(() => stage1.setCacheBypassed(true)).toThrow(/stage 1 has no Cache/);
    // Flipping false on a stage that has no cache fails loud too.
    const stage2 = createEngine({ stage: 2 });
    expect(() => stage2.setCacheBypassed(false)).toThrow(/stage 2 has no Cache/);
  });

  // CHECKS: the bypass consult rides the real stage-3 chain — the full
  // 6-hop story runs, the origin serves the route body, and the shared
  // cache answers nothing (no sets, no hits, no misses, no entries).
  // bypassedCount is the webserver's own tally of origin-path routes.
  it('a bypassed stage-3 GET takes the origin path — cacheStatus BYPASSED, the cache fills nothing, bypassedCount tallies', () => {
    const engine = createEngine({ stage: 3 });
    engine.setCacheBypassed(true);
    const frames = [];
    for (let hop = 0; hop < 6; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: '/about' });
      expect(snap.trace.hop).toBe(hop + 1);
      frames.push(snap.lastFrame);
    }
    expect(frames).toEqual([
      '10.2 -> 10.1 | GET /about',
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      '10.11 -> 10.20 | cache BYPASSED (/about)',
      '10.11 -> 10.2 | 200 This is the about page (BYPASSED)',
      '10.11 -> 10.2 | 200 This is the about page (BYPASSED)',
    ]);
    const snap = engine.snapshot();
    expect(snap.lastExchange).toMatchObject({
      status: 200,
      body: 'This is the about page',
      cacheStatus: 'BYPASSED',
    });
    expect(snap.bypassedCount).toBe(1);
    expect(snap.cache).toMatchObject({ bypassed: true, sets: 0, hits: 0, misses: 0, evictions: 0 });
    expect(snap.cache.entries).toEqual([]);
    // Round-robin lands the next trace on 10.12 — its bypass branch tallies
    // on the same shared cache consult.
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    expect(engine.snapshot().bypassedCount).toBe(2);
  });

  // CHECKS: teaching payoff — cold rejoin is deterministic; while the
  // fault is on the engine's per-tick eviction keeps running, so after a
  // TTL's worth of bypassed ticks the warmed entry is gone. Restoring does
  // not rebuild anything: the first traced GET is a fresh MISS that fills
  // anew, and the next one is the pool's first post-rejoin HIT.
  it('rejoin cold is deterministic — entries expiring while bypassed produce fresh MISSes that refill', () => {
    const engine = createEngine({ stage: 3 });
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    let snap = engine.snapshot();
    expect(snap.cache.sets).toBe(1);
    expect(snap.cache.entries.map((e) => e.key)).toEqual(['/about']);
    engine.setCacheBypassed(true);
    // 11 crowd ticks: the entry (cached at tick 1, dead at 11) evicts on
    // schedule mid-bypass, and bypassed GETs fill nothing (sets stays 1).
    for (let i = 0; i < 11; i++) engine.step();
    snap = engine.snapshot();
    expect(snap.cache.evictions).toBe(1);
    expect(snap.cache.sets).toBe(1);
    expect(snap.cache.entries).toEqual([]);
    expect(snap.bypassedCount).toBeGreaterThanOrEqual(1);
    // Rejoin: fresh MISS on the emptied cache — the miss came from the real
    // post-expiry Map lookup, not from a frozen counter state.
    engine.setCacheBypassed(false);
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.cacheStatus).toBe('MISS');
    expect(snap.cache.sets).toBe(2);
    expect(snap.cache.misses).toBe(2);
    expect(snap.bypassedCount).toBeGreaterThanOrEqual(1);
    // The next trace is a fresh HIT off the refill.
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.cacheStatus).toBe('HIT');
    expect(snap.cache.hits).toBe(1);
  });

  // CHECKS: DL-3 named counter-example — a bypassed exchange keeps the full
  // sourced stage-3 story — a real 200 from the origin, no refusal, and no
  // invented HIT/MISS status string anywhere on the trace. The NON-GET
  // frame is byte-identical to its unfaulted story: the method-level
  // 'BYPASS' token (already distinct from 'BYPASSED') and a real 405 answer,
  // and it does not stray into the webserver's origin-path tally.
  it('DL-3 counter-example — the bypassed story stays a full sourced 200; the non-GET frame keeps its own BYPASS token', () => {
    const engine = createEngine({ stage: 3 });
    engine.setCacheBypassed(true);
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    let snap = engine.snapshot();
    expect(snap.trace.refused).toBe(false);
    expect(snap.trace.cacheStatus).toBe('BYPASSED');
    expect(snap.trace.status).toBe(200);
    expect(snap.lastExchange.response).toBe('200 This is the about page');
    const bypassedTally = snap.bypassedCount;
    // A bypassed POST /about rides the unfaulted non-GET branch: 405 with
    // the 'BYPASS' token, and the origin tally does not move for it.
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ method: 'POST', path: '/about' });
    snap = engine.snapshot();
    expect(snap.lastExchange).toMatchObject({
      status: 405,
      response: '405 Only GET requests are supported',
    });
    expect(snap.trace.cacheStatus).toBe('BYPASS');
    expect(snap.bypassedCount).toBe(bypassedTally);
    expect(snap.cache.sets).toBe(0);
    // And a bypassing 404 GET fills nothing either — the same origin branch.
    for (let hop = 0; hop < 6; hop++) engine.traceHop({ path: '/missing' });
    snap = engine.snapshot();
    expect(snap.trace.status).toBe(404);
    expect(snap.trace.cacheStatus).toBe('BYPASSED');
    expect(snap.cache.sets).toBe(0);
    expect(snap.cache.misses).toBe(0);
  });

  it('same seed replays the identical tick sequence with the fault off (stage 3)', () => {
    const run = () => {
      const engine = createEngine({ stage: 3, seed: 7, users: 8, arrivalProb: 0.6 });
      return Array.from({ length: 25 }, () => engine.step());
    };
    // Off-fault the bypass wiring changes nothing observable: identical
    // sequences, byte for byte (PINS header rule).
    const first = run();
    expect(first).toEqual(run());
    // The faulted variant replays deterministically in its own right.
    const faultRun = () => {
      const engine = createEngine({ stage: 3, seed: 7, users: 8, arrivalProb: 0.6 });
      engine.setCacheBypassed(true);
      return Array.from({ length: 25 }, () => engine.step());
    };
    expect(faultRun()).toEqual(faultRun());
  });
});
