// DOCUMENTS: Stage-6 component code mirrors for the bottom inspector, split
// from inspector-source.js by responsibility (guard-file-size). js/sim/dns.js
// and js/sim/router.js are the executable truth; these entries render the
// same logic for learners.
export const STAGE6_SOURCE = {
  dns: {
    file: 'js/sim/dns.js',
    code: `createDns({ address = '10.60', ttlTicks = 300 } = {}) {
  const answers = new Map([['example.com', '10.1']]);  // authoritative table
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
    code: `createRouter({ leftAddress = '10.65', rightAddress = '20.1',
  leftNetwork = null, rightNetwork = null } = {}) {
  let routed = 0;
  let lastCross = null;
  // The router's own seat on the 20-side: subnet 20 stays empty in 6a
  // (stage 6b seats the CDN edge there), so 20.1 is the only target.
  rightNetwork.registerServer(rightAddress, {
    handleRequest: () => \`200 Router \${leftAddress} ⇄ \${rightAddress}\`,
    enqueue: (frame) => frame,
  });
  return {
    forward({ id, from, to, request, atTick, isYou = false } = {}) {
      const frame = { id, from, to, request, atTick, isYou };
      if (subnetOf(to) !== subnetOf(rightAddress)) {
        leftNetwork.deliverToQueue(frame);  // same subnet: untouched
        return { from, to, via: null };
      }
      routed += 1;   // exactly one router hop for a cross-subnet frame
      lastCross = { from, to, request, isYou };
      rightNetwork.deliverToQueue(frame); // unregistered 20.9 throws
      return { from, to, via: leftAddress };
    },
    snapshot() { return { address: leftAddress, rightAddress, routed, lastCross }; },
  };
}`,
  },
};
