// DOCUMENTS: the Stage 3 component — a shared cache-aside Cache with
// tick-based TTL. It is a real Map lookup on the request path rather than a
// probability: entries carry cachedAtTick/expiresAtTick, lookups evict
// anything past its TTL first, and hit/miss counters record what actually
// happened. Deterministic by construction: no clock, no RNG — time arrives
// as the `currentTick` argument, the same way the WebServer keeps time.
//
// B-6c fault state: setBypass stores a real on/off flag (isBypass() reads it
// back). A bypassed lookup short-circuits at the component's own consult —
// the origin serves the GET instead, the counters freeze (nothing consults
// them), and TTL bookkeeping is untouched: evictExpired runs whenever it is
// called, so entries keep aging out on the engine's tick while the cache is
// off the path (the cold-rejoin lesson).
//
// CHECKS: the constructor rejects an address that is not a two-number
// mini-IP and a ttlTicks that is not a positive integer (fail-loud over
// silent mis-configuration).
export function createCache({ address = '10.20', ttlTicks = 10 } = {}) {
  if (!/^\d+\.\d+$/.test(address)) {
    throw new Error(`cache: invalid mini-IP address ${address}`);
  }
  if (!Number.isInteger(ttlTicks) || ttlTicks < 1) {
    throw new Error(`cache: ttlTicks must be a positive integer, got ${ttlTicks}`);
  }
  const entries = new Map(); // key -> { key, value, cachedAtTick, expiresAtTick }
  let hits = 0;
  let misses = 0;
  let sets = 0;
  let evictions = 0;
  let lastLookup = null;
  let bypassed = false;

  // An entry is stale the moment the current tick reaches its expiry:
  // cached at tick T with ttlTicks = 10 means alive through tick T + 9.
  function evictExpired(currentTick = 0) {
    for (const entry of entries.values()) {
      if (currentTick >= entry.expiresAtTick) {
        entries.delete(entry.key);
        evictions += 1;
      }
    }
  }

  // Pure membership on the live (post-eviction) entry set — the cheap
  // probe step() uses to price a request before serving it.
  function has(key, currentTick = 0) {
    // CHECKS: B-6c — while bypassed the probe consults nothing and returns
    // without touching the entry table (no eviction sweep, no counter
    // movement); a bypassed GET prices exactly like a miss (2 units).
    if (bypassed) return false;
    evictExpired(currentTick);
    return entries.has(key);
  }

  function get(key, currentTick = 0) {
    // CHECKS: B-6c — while bypassed the lookup short-circuits before the
    // entry table and before evictExpired; hits/misses never move (nothing
    // consults them), no fill can be served, and the lookup record itself
    // carries the BYPASSED status at its tick.
    if (bypassed) {
      lastLookup = { key, status: 'BYPASSED', atTick: currentTick };
      return null;
    }
    evictExpired(currentTick);
    const entry = entries.get(key);
    if (entry) {
      hits += 1;
      lastLookup = { key, status: 'HIT', atTick: currentTick };
      return entry.value;
    }
    misses += 1;
    lastLookup = { key, status: 'MISS', atTick: currentTick };
    return null;
  }

  function set(key, value, currentTick = 0) {
    entries.set(key, {
      key,
      value,
      cachedAtTick: currentTick,
      expiresAtTick: currentTick + ttlTicks,
    });
    sets += 1;
  }

  // Stage 4 invalidation: a write through the primary drops the cached copy
  // so the next read refills from the database row instead of serving the
  // now-outdated value.
  function del(key) {
    return entries.delete(key);
  }

  // CHECKS: setBypass validates a real boolean ON/OFF state and throws
  // otherwise; it flips only this component's own flag (the webserver
  // consults isBypass() before each lookup) — the entry table, the
  // counters, and the TTL bookkeeping are all untouched.
  function setBypass(nextBypassed) {
    if (typeof nextBypassed !== 'boolean') {
      throw new Error(`cache: setBypass — bypassed must be a boolean, got ${nextBypassed}`);
    }
    bypassed = nextBypassed;
  }

  function isBypass() {
    return bypassed;
  }

  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return {
      address,
      ttlTicks,
      bypassed,
      hits,
      misses,
      sets,
      evictions,
      lastLookup,
      entries: [...entries.values()].map((e) => ({
        key: e.key,
        value: e.value,
        cachedAtTick: e.cachedAtTick,
        expiresAtTick: e.expiresAtTick,
        ttlRemaining: e.expiresAtTick - currentTick,
      })),
    };
  }

  return {
    get address() {
      return address;
    },
    evictExpired,
    has,
    get,
    set,
    del,
    setBypass,
    isBypass,
    snapshot,
  };
}
