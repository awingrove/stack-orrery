// DOCUMENTS: Stage-6 component code mirrors for the bottom inspector, split
// from inspector-source.js by responsibility (guard-file-size). js/sim/dns.js
// and js/sim/router.js are the executable truth; these entries render the
// same logic for learners.
export const STAGE6_SOURCE = {
  dns: {
    file: 'js/sim/dns.js',
    code: `createDns({ address = '10.60', ttlTicks = 300 } = {}) {
  const answers = new Map([
    ['example.com', '10.1'],
    ['cd.example.com', '20.1'],   // Stage 6b: the CDN edge's name
  ]);  // authoritative table
  const ledger = new Map(); // name -> { name, target, writtenAtTick, expiresAtTick }
  let lookups = 0, cachedHits = 0, authoritative = 0, lastLookup = null;
  function evictExpired(currentTick = 0) {
    for (const entry of ledger.values()) {
      if (currentTick >= entry.expiresAtTick) ledger.delete(entry.name);
    }
  }
  function lookup(name, currentTick = 0) {
    lookups += 1;
    evictExpired(currentTick);
    const cached = ledger.get(name);
    if (cached) {  // alive inside the tick window: no table consult
      cachedHits += 1;
      return { status: 'OK', target: cached.target, source: 'cache' };
    }
    const target = answers.get(name);
    if (target === undefined) {   // NX: never a throw at this layer
      lastLookup = { name, status: 'NX', target: null, atTick: currentTick };
      return { status: 'NX', name, source: 'authoritative' };
    }
    authoritative += 1;
    ledger.set(name, { name, target, writtenAtTick: currentTick,
      expiresAtTick: currentTick + ttlTicks });
    return { status: 'OK', target, source: 'authoritative' };
  }
  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return { address, ttlTicks, lookups, cachedHits, authoritative, lastLookup,
      cache: [...ledger.values()].map((e) => ({ ...e,
        ttlRemaining: e.expiresAtTick - currentTick })) };
  }
  return { get address() { return address; }, lookup, snapshot };
}`,
  },
  router: {
    file: 'js/sim/router.js',
    code: `createRouter({ leftAddress = '10.65', rightAddress = '20.254',
  leftNetwork = null, rightNetwork = null } = {}) {
  let routed = 0;
  let lastCross = null;
  // The router's own seat on the 20-side: since Stage 6b the CDN edge owns
  // 20.1, so the router re-seats to 20.254 and answers its identity there.
  rightNetwork.registerServer(rightAddress, {
    handleRequest: () => \`200 Router \${leftAddress} ⇄ \${rightAddress}\`,
    enqueue: (frame) => frame,
  });
  return {
    forward({ id, from, to, request, atTick, isYou = false } = {}) {
      const frame = { id, from, to, request, atTick, isYou };
      const toRight = subnetOf(to) === subnetOf(rightAddress);
      // Direction-aware: a frame into subnet 20 crosses rightward; a frame
      // whose source lives in subnet 20 (the edge's origin pull or its
      // response record returning to the browser) crosses leftward. Both
      // count exactly one router hop; both deliver on the destination side.
      const crosses = toRight || subnetOf(from) === subnetOf(rightAddress);
      if (!crosses) {
        leftNetwork.deliverToQueue(frame);  // same subnet: untouched
        return { from, to, via: null };
      }
      routed += 1;   // exactly one router hop per crossing, each direction
      lastCross = { from, to, request, isYou };
      (toRight ? rightNetwork : leftNetwork).deliverToQueue(frame);
      return { from, to, via: leftAddress };
    },
    snapshot() { return { address: leftAddress, rightAddress, routed, lastCross }; },
  };
}`,
  },
  cdn: {
    file: 'js/sim/cdn.js',
    code: `createCdnEdge({ address = '20.1', ttlTicks = 10, originAddress = '10.1' } = {}) {
  const ledger = new Map();  // path -> { path, body, filledAtTick, expiresAtTick }
  let hits = 0, misses = 0, fills = 0, lastPull = null;
  function evictExpired(currentTick = 0) {   // dns.js expired-entry mirror
    for (const entry of ledger.values()) {
      if (currentTick >= entry.expiresAtTick) ledger.delete(entry.path);
    }
  }
  function lookup(path, currentTick = 0) {
    evictExpired(currentTick);
    if (ledger.has(path)) {   // alive inside the tick window: ledger bytes
      hits += 1;
      return { status: 'HIT' };
    }
    misses += 1;
    return { status: 'MISS' };
  }
  function fill(path, body, currentTick = 0) {
    // Fail-loud on a non-string path/body: the fill records ONLY the real
    // origin pull's bytes (webserver.writeFile precedent).
    if (typeof path !== 'string' || path.length === 0)
      throw new Error('cdn: fill path must be a non-empty string');
    if (typeof body !== 'string' || body.length === 0)
      throw new Error('cdn: fill body must be a non-empty string');
    ledger.set(path, { path, body, filledAtTick: currentTick,
      expiresAtTick: currentTick + ttlTicks });
    fills += 1;
    lastPull = { path, atTick: currentTick };
  }
  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return { address, originAddress, ttlTicks, hits, misses, fills, lastPull,
      ledger: [...ledger.values()].map((e) => ({ ...e,
        ttlRemaining: e.expiresAtTick - currentTick })) };
  }
  return { get address() { return address; }, get ttlTicks() { return ttlTicks; },
    get originAddress() { return originAddress; }, lookup, fill, snapshot };
}`,
  },
};
