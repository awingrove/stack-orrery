// DOCUMENTS: the bottom inspector's code side — a readable, hand-edited
// mirror of each sim component's real implementation (js/sim/* is the
// executable truth; this module renders the same logic for learners),
// plus the live-state JSON derived from an engine snapshot.
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
    title: 'WebServer — mini-IP 10.1',
    code: `createWebServer({ address = '10.1', serviceRate = 4, files = DEFAULT_FILES }) {
  const fs = new Map(Object.entries(files)); // '/' and '/about' on disk
  let queue = [];      // FIFO; served up to serviceRate per step()
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
  function step(currentTick) {
    return queue.splice(0, serviceRate).map((r) => ({ ...r, ...matchRoute(r.request),
      latencyTicks: currentTick - r.atTick + 1 }));
  }
  return { address, matchRoute, handleRequest, enqueue, step };
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
  function snapshot(currentTick = 0) {
    evictExpired(currentTick);
    return { address, ttlTicks, hits, misses, sets, evictions, lastLookup,
      entries: [...entries.values()].map((e) => ({ ...e,
        ttlRemaining: e.expiresAtTick - currentTick })) };
  }
  return { address, evictExpired, has, get, set, snapshot };
}`,
  },
};

// The live-state side of the inspector: one builder per selectable
// component, all derived from the engine snapshot (nothing faked).
const STATE_BUILDERS = {
  browser: (snapshot, browserAddress = '10.2') => {
    const browsers = Array.isArray(snapshot.browsers) ? snapshot.browsers : [];
    const slot = browsers.find((b) => b.address === browserAddress) ?? null;
    return {
      name:
        browserAddress === '10.2'
          ? 'Browser (You)'
          : `Browser-${Number(browserAddress.split('.')[1]) - 1}`,
      address: browserAddress,
      lastDisplay:
        (slot ? slot.lastDisplay : null) ??
        (browserAddress === '10.2' ? (snapshot.browserDisplay ?? null) : null),
    };
  },
  network: (snapshot) => ({
    subnet: '10.x',
    // CHECKS: mini-IP keys are quoted strings — a bare `10.20:` literal
    // collapses to the number 10.2 and collides with the browser's mini-IP.
    interfaces:
      snapshot.stage === 3
        ? {
            10.1: 'LoadBalancer',
            10.11: 'WebServer-1',
            10.12: 'WebServer-2',
            10.2: 'Browser (You)',
            '10.20': 'Cache',
            Crowd: `${snapshot.users} simulated browsers`,
          }
        : snapshot.stage === 2
          ? {
              10.1: 'LoadBalancer',
              10.11: 'WebServer-1',
              10.12: 'WebServer-2',
              10.2: 'Browser (You)',
              Crowd: `${snapshot.users} simulated browsers`,
            }
          : {
              10.1: 'WebServer',
              10.2: 'Browser (You)',
              Crowd: `${snapshot.users} simulated browsers`,
            },
    lastFrame: snapshot.lastFrame ?? null,
  }),
  loadbalancer: (snapshot) => ({
    address: snapshot.loadBalancer?.address ?? '10.1',
    algorithm: 'round-robin',
    backends: snapshot.loadBalancer?.backends ?? ['10.11', '10.12'],
    nextBackend: snapshot.loadBalancer?.nextBackend ?? '10.11',
    forwardedTotal: snapshot.loadBalancer?.forwarded ?? 0,
    lastTarget: snapshot.loadBalancer?.lastTarget ?? null,
    perBackend: snapshot.loadBalancer?.perBackend ?? { 10.11: 0, 10.12: 0 },
  }),
  webserver: (snapshot) => {
    const base = {
      address: snapshot.serverAddress ?? '10.1',
      serviceRatePerTick: 4,
      queueDepth: snapshot.queueDepth,
      queuedRequests: (snapshot.queue ?? []).slice(0, 8).map((q) => `${q.from} -> ${q.request}`),
      servedTotal: snapshot.served,
      lastMatchedRoute: snapshot.lastMatchedRoute ?? null,
    };
    if (snapshot.files) base.files = snapshot.files;
    if (snapshot.stage >= 2 && Array.isArray(snapshot.servers)) {
      base.instances = snapshot.servers.map((s) => ({
        address: s.address,
        queueDepth: s.queueDepth,
        served: s.served,
        files: s.files,
      }));
    }
    return base;
  },
  cache: (snapshot) => ({
    address: snapshot.cache?.address ?? '10.20',
    strategy: 'cache-aside',
    ttlTicks: snapshot.cache?.ttlTicks ?? 10,
    hits: snapshot.cache?.hits ?? 0,
    misses: snapshot.cache?.misses ?? 0,
    sets: snapshot.cache?.sets ?? 0,
    evictions: snapshot.cache?.evictions ?? 0,
    lastLookup: snapshot.cache?.lastLookup ?? null,
    entries: snapshot.cache?.entries ?? [],
  }),
};

export function formatComponentState(snapshot, component, browserAddress = '10.2') {
  const build = STATE_BUILDERS[component];
  if (!build) throw new Error(`inspector-source: unknown component ${component}`);
  return JSON.stringify(build(snapshot, browserAddress), null, 2);
}
