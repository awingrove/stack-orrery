import { describe, it, expect } from 'vitest';
import { createCdnEdge } from '../../js/sim/cdn.js';

// DOCUMENTS: the Stage 6b edge component's contract pins. The edge mirrors
// dns.js's tick-TTL ledger pattern one layer higher — the byte-exact PINS
// here complement the trace-level pass-through counter-example in
// test/sim/engine.test.js.
describe('createCdnEdge', () => {
  // CHECKS: fail-loud construction (cache.js/dns.js precedent) — a
  // non-mini-IP address or originAddress, and a ttlTicks that is not a
  // positive integer, all throw instead of silently mis-serving.
  it('rejects invalid mini-IPs and a non-positive-integer TTL at construction', () => {
    expect(() => createCdnEdge({ address: '201' })).toThrow(/invalid mini-IP/);
    expect(() => createCdnEdge({ originAddress: '101' })).toThrow(/invalid mini-IP/);
    expect(() => createCdnEdge({ ttlTicks: 0 })).toThrow(/ttlTicks must be a positive integer/);
    expect(() => createCdnEdge({ ttlTicks: -3 })).toThrow(/ttlTicks must be a positive integer/);
    expect(() => createCdnEdge({ ttlTicks: 1.5 })).toThrow(/ttlTicks must be a positive integer/);
  });

  it('answers a HIT from the ledger inside ttlTicks and a MISS when absent', () => {
    const edge = createCdnEdge({ ttlTicks: 10 });
    expect(edge.lookup('/about', 1)).toEqual({ status: 'MISS' });
    edge.fill('/about', 'Origin body', 1);
    // Alive-through-ticks (dns.js/cache.js precedent): filled at tick 1,
    // responsive through tick 10; at tick 11 the entry is gone.
    expect(edge.lookup('/about', 1)).toEqual({ status: 'HIT' });
    expect(edge.lookup('/about', 10)).toEqual({ status: 'HIT' });
    const snap = edge.snapshot(2);
    expect(snap).toMatchObject({
      address: '20.1',
      originAddress: '10.1',
      ttlTicks: 10,
      hits: 2,
      misses: 1,
      fills: 1,
      lastPull: { path: '/about', atTick: 1 },
    });
    expect(snap.ledger).toEqual([
      { path: '/about', body: 'Origin body', expiresAtTick: 11, ttlRemaining: 9 },
    ]);
  });

  // CHECKS: named counter-example — the dns.js expired-entry mirror — an
  // entry past its expiry must NOT be served from the ledger: the lookup
  // evicts and answers MISS, and the ledger row is gone (a fresh pull is
  // then the machine's only path back to those bytes).
  it('evicts an expired entry and never answers from the ledger past expiry', () => {
    const edge = createCdnEdge({ ttlTicks: 10 });
    edge.fill('/about', 'Origin body', 1);
    expect(edge.lookup('/about', 11)).toEqual({ status: 'MISS' });
    expect(edge.snapshot(11)).toMatchObject({ hits: 0, misses: 1, ledger: [] });
    // A refill starts a fresh window from the current tick.
    edge.fill('/about', 'Newer body', 12);
    expect(edge.lookup('/about', 13)).toEqual({ status: 'HIT' });
    expect(edge.snapshot(13).ledger).toEqual([
      { path: '/about', body: 'Newer body', expiresAtTick: 22, ttlRemaining: 9 },
    ]);
  });

  // CHECKS: fill records ONLY pulled origin bytes — non-empty string path
  // and body, anything else throws (webserver.writeFile precedent) so a
  // fabricated entry can never sneak into the ledger.
  it('rejects an empty or non-string fill path/body (fail-loud)', () => {
    const edge = createCdnEdge();
    expect(() => edge.fill('', 'body', 0)).toThrow(/fill path must be a non-empty string/);
    expect(() => edge.fill(7, 'body', 0)).toThrow(/fill path must be a non-empty string/);
    expect(() => edge.fill('/about', '', 0)).toThrow(/fill body must be a non-empty string/);
    expect(() => edge.fill('/about', 42, 0)).toThrow(/fill body must be a non-empty string/);
    expect(edge.snapshot(0).fills).toBe(0);
    expect(edge.snapshot(0).ledger).toEqual([]);
  });

  // CHECKS: named counter-example — the edge is GET-only by contract. A
  // non-GET never reaches `lookup`: the component state stays at its
  // initial counters with an absent ledger row until the machine itself
  // calls lookup — nothing here can be nudged into serving a pass-through
  // (trace-level POST counter-example pinned in test/sim/engine.test.js).
  it('keeps a pass-through edge untouched — no lookup, no counters, no row', () => {
    const edge = createCdnEdge();
    expect(edge.snapshot(5)).toMatchObject({ hits: 0, misses: 0, fills: 0, ledger: [] });
    // Even an unrelated fill leaves the hit/miss counters untouched: only
    // lookup counts there, and the pass-through path skips lookup entirely.
    edge.fill('/note', 'Note body', 1);
    expect(edge.snapshot(5)).toMatchObject({ hits: 0, misses: 0, fills: 1 });
    expect(edge.lookup('/other', 5)).toEqual({ status: 'MISS' });
  });
});
