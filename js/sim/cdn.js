// DOCUMENTS: the Stage 6b component — a CDN edge at 20.1 with a tick-TTL
// fill ledger. It mirrors dns.js's tick-TTL ledger pattern one layer higher:
// no clock, no RNG — time arrives as the `currentTick` argument, and each
// ledger row carries an `expiresAtTick`. The edge is GET-only by contract:
// the trace machine calls `lookup` for GETs whose DNS answer landed in
// subnet 20 and consults the ledger for no other method (a POST
// passes through to the origin untouched). Bytes in the ledger are exactly
// the bodies a real origin pull produced and the machine handed to `fill` —
// a HIT serves ledger bytes and fabricates none.
//
// CHECKS: the constructor rejects a non-mini-IP address, a non-mini-IP
// originAddress, and a ttlTicks that is not a positive integer (fail-loud
// over silent mis-configuration, cache.js/dns.js precedent).
//
// PINS: the counter-examples pinned in test/sim/cdn.test.js — a lookup
// inside ttlTicks is a HIT with zero origin traffic (the trace machine
// stays off `fill`), an entry past its expiry is evicted and answered only
// by a fresh pull (the ledger serves nothing outside its tick window, the
// dns.js expired-entry mirror), and a POST on a CDN name leaves
// hits/misses/fills untouched with an absent ledger row — fill is only
// ever called with pulled origin bytes.
const MINI_IP = /^\d+\.\d+$/;

export function createCdnEdge({ address = '20.1', ttlTicks = 10, originAddress = '10.1' } = {}) {
  if (!MINI_IP.test(address)) {
    throw new Error(`cdn: invalid mini-IP address ${address}`);
  }
  if (!MINI_IP.test(originAddress)) {
    throw new Error(`cdn: invalid mini-IP originAddress ${originAddress}`);
  }
  if (!Number.isInteger(ttlTicks) || ttlTicks < 1) {
    throw new Error(`cdn: ttlTicks must be a positive integer, got ${ttlTicks}`);
  }
  const ledger = new Map(); // path -> { path, body, filledAtTick, expiresAtTick }
  let hits = 0;
  let misses = 0;
  let fills = 0;
  let lastPull = null;

  // Alive-through-ticks rule (dns.js / cache.js precedent): filled at tick T
  // with ttlTicks = 10 means responsive through tick T + 9; at T + 10 the
  // entry is gone before anything is served.
  function evictExpired(currentTick = 0) {
    for (const entry of ledger.values()) {
      if (currentTick >= entry.expiresAtTick) {
        ledger.delete(entry.path);
      }
    }
  }

  // One lookup, one branch: a ledger row inside the tick window answers HIT
  // (the trace machine reads its bytes via snapshot instead of pulling); a
  // missing or expired row answers MISS — the pull, the fill, and the
  // staleness timing all stay with the real origin machinery.
  function lookup(path, currentTick = 0) {
    evictExpired(currentTick);
    if (ledger.has(path)) {
      hits += 1;
      return { status: 'HIT' };
    }
    misses += 1;
    return { status: 'MISS' };
  }

  // CHECKS: fill records the origin pull's own bytes — non-empty string
  // path and body only (fail-loud, webserver.writeFile precedent). The
  // caller is always the trace machine after a real `lb.enqueue` +
  // `drainUntilYou` pull through the Router's left leg.
  function fill(path, body, currentTick = 0) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`cdn: fill path must be a non-empty string`);
    }
    if (typeof body !== 'string' || body.length === 0) {
      throw new Error(`cdn: fill body must be a non-empty string`);
    }
    ledger.set(path, {
      path,
      body,
      filledAtTick: currentTick,
      expiresAtTick: currentTick + ttlTicks,
    });
    fills += 1;
    lastPull = { path, atTick: currentTick };
  }

  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return {
      address,
      originAddress,
      ttlTicks,
      hits,
      misses,
      fills,
      lastPull,
      ledger: [...ledger.values()].map((entry) => ({
        path: entry.path,
        body: entry.body,
        expiresAtTick: entry.expiresAtTick,
        ttlRemaining: entry.expiresAtTick - currentTick,
      })),
    };
  }

  return {
    get address() {
      return address;
    },
    get ttlTicks() {
      return ttlTicks;
    },
    get originAddress() {
      return originAddress;
    },
    lookup,
    fill,
    snapshot,
  };
}
