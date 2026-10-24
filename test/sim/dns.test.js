import { describe, it, expect } from 'vitest';
import { createDns } from '../../js/sim/dns.js';
import { createEngine } from '../../js/sim/engine.js';

describe('createDns', () => {
  it('answers the authoritative table on a miss, the ledger inside ttlTicks, and evicts on expiry', () => {
    // CHECKS: the constructor rejects a non-mini-IP address and a
    // non-positive or non-integer ttlTicks (fail-loud over silent misconfig).
    expect(() => createDns({ address: '1060' })).toThrow(/invalid mini-IP/);
    expect(() => createDns({ ttlTicks: 0 })).toThrow(/ttlTicks/);
    expect(() => createDns({ ttlTicks: 1.5 })).toThrow(/ttlTicks/);

    const dns = createDns({ address: '10.60', ttlTicks: 5 });

    // Cold lookup: a real Map miss against the authoritative table, which
    // writes the ledger entry (writtenAtTick 5, expiresAtTick 10).
    expect(dns.lookup('example.com', 5)).toEqual({
      status: 'OK',
      target: '10.1',
      source: 'authoritative',
    });
    expect(dns.snapshot(5).cache).toEqual([
      { name: 'example.com', target: '10.1', expiresAtTick: 10, ttlRemaining: 5 },
    ]);
    expect(dns.snapshot(5)).toMatchObject({ lookups: 1, authoritative: 1, cachedHits: 0 });

    // PINS: a hit inside the TTL window is served from the ledger with ZERO
    // authoritative consults — the counter and the ledger entry carry the proof.
    expect(dns.lookup('example.com', 9)).toEqual({ status: 'OK', target: '10.1', source: 'cache' });
    let snap = dns.snapshot(9);
    expect(snap).toMatchObject({ lookups: 2, cachedHits: 1, authoritative: 1 });
    expect(snap.lastLookup).toEqual({
      name: 'example.com',
      status: 'HIT',
      target: '10.1',
      atTick: 9,
    });
    expect(snap.cache[0].ttlRemaining).toBe(1);

    // CHECKS: cached at tick T with ttlTicks 5 is responsive THROUGH tick
    // T + 4 (the cache.js alive-through-ticks rule), and tick T + 5 is the
    // first tick the entry is gone — the expired entry must NOT be answered
    // from the ledger: eviction deletes it and the fresh authoritative
    // consult re-writes it.
    expect(dns.lookup('example.com', 9).source).toBe('cache');
    const expired = dns.lookup('example.com', 10);
    expect(expired).toEqual({ status: 'OK', target: '10.1', source: 'authoritative' });
    snap = dns.snapshot(10);
    expect(snap).toMatchObject({ cachedHits: 2, authoritative: 2 });
    expect(snap.cache[0].expiresAtTick).toBe(15);

    // CHECKS: an unknown name answers NX — the DNS layer never throws on a
    // name (the throw rule belongs to cross-subnet addresses), and an NX
    // lookup writes no ledger entry.
    expect(dns.lookup('nope.example', 10)).toEqual({
      status: 'NX',
      name: 'nope.example',
      source: 'authoritative',
    });
    expect(dns.snapshot(10)).toMatchObject({ authoritative: 2 });
    expect(dns.snapshot(10).cache.map((e) => e.name)).toEqual(['example.com']);
    expect(dns.snapshot(10).lastLookup.name).toBe('nope.example');
  });

  // PINS: the engine wires the DNS at 10.60 with the 300t default TTL and
  // exposes snapshot.dns; stages 1-5 expose no DNS at all.
  it('stage 6 engine exposes DNS 10.60 and resolves example.com through the trace', () => {
    const engine = createEngine({ stage: 6 });
    let snap = engine.snapshot();
    expect(snap.dns).not.toBe(null);
    expect(snap.dns.address).toBe('10.60');
    expect(snap.dns.ttlTicks).toBe(300);

    // The hosted trace really runs the ledger: the ask hop answers
    // authoritatively and writes the entry; counting the lookup is the
    // component's own state, not a faked aggregate.
    for (let hop = 0; hop < 3; hop++) {
      engine.traceHop({ method: 'GET', path: 'example.com/about' });
    }
    snap = engine.snapshot();
    expect(snap.trace.host).toBe('example.com');
    expect(snap.trace.dnsTarget).toBe('10.1');
    expect(snap.dns.authoritative).toBe(1);
    expect(snap.dns.cache[0]).toMatchObject({ name: 'example.com', target: '10.1' });

    // Stages 1-5 expose no DNS.
    expect(createEngine({ stage: 1 }).snapshot().dns).toBe(null);
    expect(createEngine({ stage: 5 }).snapshot().dns).toBe(null);
  });
});
