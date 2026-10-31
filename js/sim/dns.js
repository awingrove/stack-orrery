// DOCUMENTS: the Stage 6a component — an authoritative name server with a
// tick-TTL resolver ledger. It mirrors the cache-aside Cache's determinism
// contract: no clock, no RNG — time arrives as the `currentTick` argument.
// The authoritative table maps names to mini-IPs (stage 6a ships exactly one
// answer, `example.com -> 10.1`; stage 6b adds the CDN edge's second static
// entry, `cd.example.com -> 20.1` — the answer whose subnet keys the 6b
// trace branch). Every
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
// B-6f: the record the fault drops (`example.com -> 10.1`) and its CDN
// sibling named in the ledger purge — cd.example.com's RECORD stays in the
// answers table, only its cached ledger entry goes with the drop.
const DROPPED_NAME = 'example.com';
const DROPPED_TARGET = '10.1';
const CD_NAME = 'cd.example.com';
const MINI_IP = /^\d+\.\d+$/;

export function createDns({ address = '10.60', ttlTicks = 300 } = {}) {
  if (!MINI_IP.test(address)) {
    throw new Error(`dns: invalid mini-IP address ${address}`);
  }
  if (!Number.isInteger(ttlTicks) || ttlTicks < 1) {
    throw new Error(`dns: ttlTicks must be a positive integer, got ${ttlTicks}`);
  }
  const answers = new Map([
    [DROPPED_NAME, DROPPED_TARGET],
    [CD_NAME, '20.1'],
  ]); // authoritative table
  const ledger = new Map(); // name -> { name, target, writtenAtTick, expiresAtTick }
  let lookups = 0;
  let cachedHits = 0;
  let authoritative = 0;
  let lastLookup = null;
  // B-6f fault state — component-owned, like webserver.setDown /
  // cache.setBypass. `pendingReResolve` is the drop-era flag: it opens on
  // the true flip and pays out once.
  let dropped = false;
  let droppedLookups = 0;
  let reResolveAfterDrop = 0;
  let pendingReResolve = false;

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
  //
  // CHECKS (B-6f era semantics): reResolveAfterDrop counts the FIRST OK
  // for the dropped name after a drop era opens (the true flip sets the
  // pendingReResolve era flag); the flag clears on that first OK, so
  // repeated OKs add nothing and a second drop era adds at most one more.
  // An OK before any drop finds no era flag open and adds nothing; an OK
  // for any other name (cd.example.com) pays the era flag nothing.
  function countReResolve(name) {
    if (!pendingReResolve || name !== DROPPED_NAME) return;
    pendingReResolve = false;
    reResolveAfterDrop += 1;
  }

  function lookup(name, currentTick = 0) {
    lookups += 1;
    evictExpired(currentTick);
    const cached = ledger.get(name);
    if (cached) {
      // Alive-through-ticks rule (cache.js precedent): cached at tick T with
      // ttlTicks = 300 means responsive through T + 299.
      cachedHits += 1;
      countReResolve(name);
      lastLookup = { name, status: 'HIT', target: cached.target, atTick: currentTick };
      return { status: 'OK', target: cached.target, source: 'cache' };
    }
    const target = answers.get(name);
    if (target === undefined) {
      // B-6f evidence: only an NX for the dropped name moves the counter —
      // an unknown-host NX reads the same branch and leaves it flat.
      if (dropped && name === DROPPED_NAME) droppedLookups += 1;
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
    countReResolve(name);
    lastLookup = { name, status: 'AUTH', target, atTick: currentTick };
    return { status: 'OK', target, source: 'authoritative' };
  }

  // CHECKS (B-6f): setDropped validates a boolean (fail-loud over a
  // silently mis-read flip). ON the true flip the component purges BOTH
  // tables — the dropped record leaves the authoritative table and every
  // ledger entry naming either zone name is deleted by exact stored name,
  // so a stale ttlTicks window cannot keep serving the deleted record —
  // and the drop-era flag opens. While dropped the EXISTING NX branch
  // answers the name ({ status: 'NX', source: 'authoritative' }); the
  // flip narrates nothing new. ON the false flip the record is re-added;
  // the ledger stays empty for that name, so the next lookup is a fresh
  // authoritative answer. A flip to the state already held is a no-op.
  function setDropped(next) {
    if (typeof next !== 'boolean') {
      throw new Error(`dns: dropped must be a boolean, got ${next}`);
    }
    if (next === dropped) return;
    dropped = next;
    if (dropped) {
      answers.delete(DROPPED_NAME);
      for (const entry of ledger.values()) {
        if (entry.name === DROPPED_NAME || entry.name === CD_NAME) ledger.delete(entry.name);
      }
      pendingReResolve = true;
    } else {
      answers.set(DROPPED_NAME, DROPPED_TARGET);
    }
  }

  function isDropped() {
    return dropped;
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
      // B-6f: the fault flag and its two mission-evidence counters ride the
      // component's own snapshot (panel mission detectors read them here).
      dropped,
      droppedLookups,
      reResolveAfterDrop,
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
    setDropped,
    isDropped,
  };
}
