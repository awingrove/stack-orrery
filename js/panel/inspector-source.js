// DOCUMENTS: the bottom inspector's code side — a readable, hand-edited
// mirror of each sim component's real implementation (js/sim/* is the
// executable truth; this module renders the same logic for learners).
// The live-state builders and their JSON formatting live in
// inspector-state.js (split by responsibility, guard-file-size).
export const COMPONENT_SOURCE = {
  browser: {
    file: 'js/sim/browser.js',
    title: 'Browser (You) — mini-IP 10.2',
    code: `createBrowser({ name, address, network }) {
  // address must be "<net>.<host>" — a two-number mini-IP
  let lastDisplay = null;
  return {
    createRequest(path = '/', method = 'GET') { return \`\${method} \${path}\`; },
    parseResponse(raw) {  // slim HTTP: no version, no headers
      const [statusToken, ...body] = String(raw).trim().split(' ');
      return { status: Number(statusToken), body: body.join(' ') };
    },
    // render an arriving wire record: parse and store viewport state
    receiveResponse({ from, to, request, response }) {
      lastDisplay = { from, to, request, response, ...this.parseResponse(response) };
      return lastDisplay;
    },
    get(targetAddress, path = '/', method = 'GET') {
      const request = this.createRequest(path, method);
      const { response } = network.send({ from: address, to: targetAddress, request });
      return this.receiveResponse({ from: address, to: targetAddress, request, response });
    },
    last() { return lastDisplay; },
  };
}`,
  },
  network: {
    file: 'js/sim/network.js',
    title: 'Network — routing fabric',
    code: `createNetwork() {
  const servers = new Map();
  function resolve(address) {
    if (!/^\\d+\\.\\d+$/.test(address)) throw new Error(\`invalid mini-IP \${address}\`);
    const server = servers.get(address);
    if (!server) throw new Error(\`no server at \${address}\`);
    return server;
  }
  return {
    registerServer(address, server) { servers.set(address, server); },
    // the wire is synchronous at this stage: request in, response out
    send({ from, to, request }) {
      return { from, to, request, response: resolve(to).handleRequest(request) };
    },
    deliverToQueue({ id, from, to, request, atTick, isYou = false }) {
      resolve(to).enqueue({ id, from, to, request, atTick, isYou });
    },
  };
}`,
  },
  loadbalancer: {
    file: 'js/sim/loadbalancer.js',
    title: 'LoadBalancer — mini-IP 10.1',
    code: `createLoadBalancer({ address = '10.1', backends = ['10.11', '10.12'], network }) {
  const pool = [...backends];
  const perBackend = Object.fromEntries(pool.map((b) => [b, 0]));
  let nextIndex = 0;
  let forwarded = 0;
  let lastTarget = null;
  function selectBackend() {
    const target = pool[nextIndex];
    nextIndex = (nextIndex + 1) % pool.length;
    forwarded += 1;
    perBackend[target] += 1;
    lastTarget = target;
    return target;
  }
  return {
    nextBackend() { return pool[nextIndex]; },
    handleRequest(request = 'GET /') {
      return network.send({ from: address, to: selectBackend(), request }).response;
    },
    enqueue({ id, atTick, from = '10.2', request = 'GET /', isYou = false }) {
      const target = selectBackend();
      network.deliverToQueue({ id, from, to: target, request, atTick, isYou });
      return target;
    },
  };
}`,
  },
  webserver: {
    file: 'js/sim/webserver.js',
    title: 'WebServer — mini-IP 10.11 / 10.12',
    code: `createWebServer({ address = '10.1', serviceRate = 4, files = DEFAULT_FILES,
  cache = null, database = null } = {}) {
  const fs = new Map(Object.entries(files)); // '/' and '/about' on disk
  let queue = [];      // FIFO; work budget serviceRate * 2 per step()
  let served = 0;
  function matchRoute(request = 'GET /') {
    const [method, ...rest] = String(request).trim().split(' ');
    const path = rest[0] ?? '';
    let response;
    let routeId = null;
    if (method !== 'GET') response = '405 Only GET requests are supported';
    else if (fs.has(path)) {
      response = \`200 \${fs.get(path)}\`;
      routeId = path === '/' ? 'route-home' : \`route-\${path.slice(1)}\`;
    } else response = '404 Page not found';
    const [statusToken, ...body] = response.split(' ');
    return { response, status: Number(statusToken), body: body.join(' '), routeId };
  }
  function enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /', isYou = false }) {
    queue.push({ id, atTick, from, to, request, isYou });
  }
  function handleRequest(request = 'GET /') { return matchRoute(request).response; }
  function resolveRequest(request = 'GET /', currentTick = 0) {
    const { method, path } = parseRequest(request);
    if (method === 'GET' && cache) {
      const cached = cache.get(path, currentTick);
      if (cached) return { response: \`200 \${cached}\`, cacheStatus: 'HIT' };
    }
    if (database && method === 'POST') {
      const written = database.write(path, \`Updated \${path} at tick \${currentTick}\`, currentTick);
      cache?.del(path);  // write-through: drop the cached copy
      return { response: \`200 \${written.value}\`, cacheStatus: 'INVALIDATE',
        dbOp: 'WRITE', dbTarget: database.primaryAddress, dbStale: false };
    }
    // cache MISS: read the replica (Stage 4) or the filesystem (Stage 3).
    const row = database ? database.read(path, currentTick) : null;
    if (row && row.found) {
      if (!row.stale) cache?.set(path, row.value, currentTick);
      return { response: \`200 \${row.value}\`, cacheStatus: 'MISS',
        dbOp: 'SELECT', dbTarget: database.replicaAddress, dbStale: row.stale };
    }
    const matched = matchRoute(request);
    if (matched.status === 200) cache?.set(path, matched.body, currentTick);
    return { ...matched, cacheStatus: 'MISS' };
  }
  function step(currentTick) {
    const budget = cache || database ? serviceRate * 2 : serviceRate;
    // ... drain the queue up to the work budget, resolving each request
    return queue.splice(0, budget).map((r) => ({ ...r, ...resolveRequest(r.request, currentTick),
      latencyTicks: currentTick - r.atTick + 1 }));
  }
  return { address, matchRoute, handleRequest, resolveRequest, enqueue, step };
}`,
  },
  cache: {
    file: 'js/sim/cache.js',
    title: 'Cache — mini-IP 10.20',
    code: `createCache({ address = '10.20', ttlTicks = 10 } = {}) {
  // address must be "<net>.<host>" — a two-number mini-IP
  const entries = new Map(); // path -> { value, cachedAtTick, expiresAtTick }
  let hits = 0, misses = 0, sets = 0, evictions = 0, lastLookup = null;
  function evictExpired(currentTick = 0) {
    for (const entry of entries.values()) {
      if (currentTick >= entry.expiresAtTick) {  // TTL elapsed
        entries.delete(entry.key);
        evictions += 1;
      }
    }
  }
  function has(key, currentTick = 0) {
    evictExpired(currentTick);
    return entries.has(key);
  }
  function get(key, currentTick = 0) {
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
    entries.set(key, { key, value, cachedAtTick: currentTick,
      expiresAtTick: currentTick + ttlTicks });
    sets += 1;
  }
  function del(key) {  // Stage 4: write-through invalidation
    return entries.delete(key);
  }
  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return { address, ttlTicks, hits, misses, sets, evictions, lastLookup,
      entries: [...entries.values()].map((e) => ({ ...e,
        ttlRemaining: e.expiresAtTick - currentTick })) };
  }
  return { address, evictExpired, has, get, set, del, snapshot };
}`,
  },
  database: {
    file: 'js/sim/database.js',
    title: 'Database — Primary 10.30 / Replica 10.31',
    code: `createDatabase({ primaryAddress = '10.30', replicaAddress = '10.31',
  replicationLagTicks = 3, rows = DEFAULT_ROWS } = {}) {
  // addresses must be "<net>.<host>" — two-number mini-IPs
  const primary = new Map();   // key -> { key, value, version, updatedAtTick }
  const replica = new Map();   // same shape; serves all reads
  const replicationQueue = []; // FIFO { key, value, version, writtenAtTick, applyAtTick }
  let reads = 0, writes = 0, staleReads = 0, replicated = 0, lastOp = null;
  function stepReplication(currentTick = 0) {
    // oldest pending write first; applies once its applyAtTick arrives
    while (replicationQueue.length > 0 && currentTick >= replicationQueue[0].applyAtTick) {
      const entry = replicationQueue.shift();
      replica.set(entry.key, { key: entry.key, value: entry.value,
        version: entry.version, updatedAtTick: entry.applyAtTick });
      replicated += 1;
    }
  }
  function read(key, currentTick = 0) {   // always the replica
    stepReplication(currentTick);
    reads += 1;
    const replicaRow = replica.get(key) ?? null;
    const primaryRow = primary.get(key) ?? null;
    const stale = Boolean(primaryRow &&
      (!replicaRow || replicaRow.version < primaryRow.version));
    if (stale) staleReads += 1;
    lastOp = { op: 'SELECT', target: replicaAddress, key, found: Boolean(replicaRow),
      stale, atTick: currentTick };
    return { found: Boolean(replicaRow), value: replicaRow ? replicaRow.value : null,
      version: replicaRow ? replicaRow.version : 0, stale, source: replicaAddress };
  }
  function write(key, value, currentTick = 0) {  // always the primary
    stepReplication(currentTick);
    writes += 1;
    const version = (primary.get(key)?.version ?? 0) + 1;
    const applyAtTick = currentTick + replicationLagTicks;
    primary.set(key, { key, value, version, updatedAtTick: currentTick });
    replicationQueue.push({ key, value, version, writtenAtTick: currentTick, applyAtTick });
    lastOp = { op: 'WRITE', target: primaryAddress, key, version, applyAtTick, atTick: currentTick };
    return { key, value, version, applyAtTick, source: primaryAddress };
  }
  function snapshot(currentTick = 0) {
    stepReplication(currentTick);
    return { primaryAddress, replicaAddress, replicationLagTicks, reads, writes,
      staleReads, replicated, lastOp, pendingReplication: replicationQueue.length };
  }
  return { stepReplication, read, write, snapshot };
}`,
  },
};
