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
    code: `createWebServer({ address = '10.1', serviceRate = 4 }) {
  let queue = [];      // FIFO; served up to serviceRate per step()
  let served = 0;
  // the whole HTTP contract at this stage: method gate, then paths
  function matchRoute(request = 'GET /') {
    const [method, ...rest] = String(request).trim().split(' ');
    const path = rest[0] ?? '';
    let response;
    let routeId;
    if (method !== 'GET') { response = '405 Only GET requests are supported'; routeId = 'route-405'; }
    else if (path === '/') { response = '200 Welcome to the home page'; routeId = 'route-home'; }
    else if (path === '/about') { response = '200 This is the about page'; routeId = 'route-about'; }
    else { response = '404 Page not found'; routeId = 'route-404'; }
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
};

// The live-state side of the inspector: one builder per selectable
// component, all derived from the engine snapshot (nothing faked).
const STATE_BUILDERS = {
  browser: (snapshot) => ({
    name: 'Browser (You)',
    address: '10.2',
    lastDisplay: snapshot.browserDisplay ?? null,
  }),
  network: (snapshot) => ({
    subnet: '10.x',
    interfaces:
      snapshot.stage === 2
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
    if (snapshot.stage === 2 && Array.isArray(snapshot.servers)) {
      base.instances = snapshot.servers.map((s) => ({
        address: s.address,
        queueDepth: s.queueDepth,
        served: s.served,
      }));
    }
    return base;
  },
};

export function formatComponentState(snapshot, component) {
  const build = STATE_BUILDERS[component];
  if (!build) throw new Error(`inspector-source: unknown component ${component}`);
  return JSON.stringify(build(snapshot), null, 2);
}
