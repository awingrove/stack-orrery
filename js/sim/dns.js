// DOCUMENTS: the Stage 6a component — an authoritative name server with a
// tick-TTL resolver ledger. It mirrors the cache-aside Cache's determinism
// contract: no clock, no RNG — time arrives as the `currentTick` argument.
// The authoritative table maps names to mini-IPs (stage 6a ships exactly one
// answer, `example.com -> 10.1`; stage 6b adds the CDN edge name). Every
// miss writes a ledger entry with `expiresAtTick`; a lookup still inside the
// window is a ledger hit that does not consult the table again.
//
// CHECKS: the constructor rejects an address that is not a two-number
// mini-IP and a ttlTicks that is not a positive integer (fail-loud over
// silent mis-configuration, same as cache.js and loadbalancer.js).
// PINS: the ledger branch — a hit inside ttlTicks increments `cachedHits`
// and consults the authoritative table zero times; an expired entry is
// deleted and answered only by a fresh authoritative consult (it is never
// served from the ledger) — both counter-examples pinned in
// test/sim/dns.test.js. Unknown names answer `{ status: 'NX' }` — the DNS
// layer never throws on a name; the throw rule belongs to cross-subnet
// addresses (network.js / router.js).
const MINI_IP = /^\d+\.\d+$/;

export function createDns({ address = '10.60', ttlTicks = 300 } = {}) {
  if (!MINI_IP.test(address)) {
    throw new Error(`dns: invalid mini-IP address ${address}`);
  }
  if (!Number.isInteger(ttlTicks) || ttlTicks < 1) {
    throw new Error(`dns: ttlTicks must be a positive integer, got ${ttlTicks}`);
  }
  const answers = new Map([['example.com', '10.1']]); // authoritative table
  const ledger = new Map(); // name -> { name, target, writtenAtTick, expiresAtTick }
  let lookups = 0;
  let cachedHits = 0;
  let authoritative = 0;
  let lastLookup = null;

  function evictExpired(currentTick = 0) {
    for (const entry of ledger.values()) {
      if (currentTick >= entry.expiresAtTick) {
        ledger.delete(entry.name);
      }
    }
  }

  // One lookup, one branch: ledger hit inside the window, authoritative
  // miss (with a fresh ledger write), or NX. `source` says which branch
  // answered so the trace narrative consumes the real mechanism.
  function lookup(name, currentTick = 0) {
    lookups += 1;
    evictExpired(currentTick);
    const cached = ledger.get(name);
    if (cached) {
      // Alive-through-ticks rule (cache.js precedent): cached at tick T with
      // ttlTicks = 300 means responsive through T + 299.
      cachedHits += 1;
      lastLookup = { name, status: 'HIT', target: cached.target, atTick: currentTick };
      return { status: 'OK', target: cached.target, source: 'cache' };
    }
    const target = answers.get(name);
    if (target === undefined) {
      lastLookup = { name, status: 'NX', target: null, atTick: currentTick };
      return { status: 'NX', name, source: 'authoritative' };
    }
    authoritative += 1;
    ledger.set(name, {
      name,
      target,
      writtenAtTick: currentTick,
      expiresAtTick: currentTick + ttlTicks,
    });
    lastLookup = { name, status: 'AUTH', target, atTick: currentTick };
    return { status: 'OK', target, source: 'authoritative' };
  }

  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return {
      address,
      ttlTicks,
      lookups,
      cachedHits,
      authoritative,
      lastLookup,
      cache: [...ledger.values()].map((entry) => ({
        name: entry.name,
        target: entry.target,
        expiresAtTick: entry.expiresAtTick,
        ttlRemaining: entry.expiresAtTick - currentTick,
      })),
    };
  }

  return {
    get address() {
      return address;
    },
    lookup,
    snapshot,
  };
}
