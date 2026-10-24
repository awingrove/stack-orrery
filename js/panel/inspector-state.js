// DOCUMENTS: the bottom inspector's live-state side — one builder per
// selectable component, all derived from the engine snapshot (nothing
// faked). Split from inspector-source.js by responsibility
// (guard-file-size); the code mirrors live in inspector-source.js.
export function formatComponentState(snapshot, component, browserAddress = '10.2') {
  const build = STATE_BUILDERS[component];
  if (!build) throw new Error(`inspector-source: unknown component ${component}`);
  return JSON.stringify(build(snapshot, browserAddress), null, 2);
}

// PINS: the rendered #inspector-title derives every per-stage address from
// the live snapshot, not from the static source entry — the named
// counter-example: on stage 1 the webserver headline reads
// "WebServer — mini-IP 10.1" while #inspector-state shows "address": "10.1",
// and reading "10.11 / 10.12" there would contradict the state side. Every
// inspector tab title follows the same derive-from-snapshot rule.
export function componentTitle(snapshot = null, component, browserAddress = '10.2') {
  switch (component) {
    case 'browser':
      return browserAddress === '10.2'
        ? 'Browser (You) — mini-IP 10.2'
        : `Browser-${Number(browserAddress.split('.')[1]) - 1} — mini-IP ${browserAddress}`;
    case 'network':
      return 'Network — routing fabric';
    case 'loadbalancer':
      return `LoadBalancer — mini-IP ${snapshot?.loadBalancer?.address ?? '10.1'}`;
    case 'webserver': {
      const addresses =
        snapshot?.stage >= 2 && Array.isArray(snapshot.servers)
          ? snapshot.servers.map((s) => s.address)
          : [snapshot?.serverAddress ?? '10.1'];
      return `WebServer — mini-IP ${addresses.join(' / ')}`;
    }
    case 'cache':
      return `Cache — mini-IP ${snapshot?.cache?.address ?? '10.20'}`;
    case 'database':
      return `Database — Primary ${snapshot?.database?.primaryAddress ?? '10.30'} / Replica ${
        snapshot?.database?.replicaAddress ?? '10.31'
      }`;
    case 'workerqueue':
      return `Worker Queue — Queue ${snapshot?.workerQueue?.address ?? '10.40'} / Worker ${
        snapshot?.workerQueue?.workerAddress ?? '10.41'
      }`;
    case 'dns':
      return `DNS — mini-IP ${snapshot?.dns?.address ?? '10.60'}`;
    case 'router':
      return `Router — mini-IP ${snapshot?.router?.address ?? '10.65'} ⇄ ${
        snapshot?.router?.rightAddress ?? '20.1'
      }`;
    default:
      throw new Error(`inspector-source: unknown component ${component}`);
  }
}

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
      snapshot.stage === 6
        ? {
            10.1: 'LoadBalancer',
            10.11: 'WebServer-1',
            10.12: 'WebServer-2',
            10.2: 'Browser (You)',
            '10.20': 'Cache',
            '10.30': 'Database (Primary)',
            10.31: 'Database (Replica)',
            '10.40': 'WorkerQueue',
            10.41: 'Worker',
            '10.60': 'DNS',
            10.65: 'Router (left)',
            20.1: 'Router (right)',
            Crowd: `${snapshot.users} simulated browsers`,
          }
        : snapshot.stage === 5
          ? {
              10.1: 'LoadBalancer',
              10.11: 'WebServer-1',
              10.12: 'WebServer-2',
              10.2: 'Browser (You)',
              '10.20': 'Cache',
              '10.30': 'Database (Primary)',
              10.31: 'Database (Replica)',
              '10.40': 'WorkerQueue',
              10.41: 'Worker',
              Crowd: `${snapshot.users} simulated browsers`,
            }
          : snapshot.stage === 4
            ? {
                10.1: 'LoadBalancer',
                10.11: 'WebServer-1',
                10.12: 'WebServer-2',
                10.2: 'Browser (You)',
                '10.20': 'Cache',
                '10.30': 'Database (Primary)',
                10.31: 'Database (Replica)',
                Crowd: `${snapshot.users} simulated browsers`,
              }
            : snapshot.stage === 3
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
  database: (snapshot) => ({
    primaryAddress: snapshot.database?.primaryAddress ?? '10.30',
    replicaAddress: snapshot.database?.replicaAddress ?? '10.31',
    replicationLagTicks: snapshot.database?.replicationLagTicks ?? 3,
    reads: snapshot.database?.reads ?? 0,
    writes: snapshot.database?.writes ?? 0,
    staleReads: snapshot.database?.staleReads ?? 0,
    replicated: snapshot.database?.replicated ?? 0,
    lastOp: snapshot.database?.lastOp ?? null,
    pendingReplication: snapshot.database?.pendingReplication ?? 0,
    rows: snapshot.database?.rows ?? [],
  }),
  workerqueue: (snapshot) => ({
    address: snapshot.workerQueue?.address ?? '10.40',
    workerAddress: snapshot.workerQueue?.workerAddress ?? '10.41',
    jobDurationTicks: snapshot.workerQueue?.jobDurationTicks ?? 2,
    enqueued: snapshot.workerQueue?.enqueued ?? 0,
    completed: snapshot.workerQueue?.completed ?? 0,
    activeJob: snapshot.workerQueue?.activeJob ?? null,
    pendingJobs: snapshot.workerQueue?.pendingJobs ?? [],
    lastJobResult: snapshot.workerQueue?.lastJobResult ?? null,
  }),
  dns: (snapshot) => ({
    address: snapshot.dns?.address ?? '10.60',
    role: 'authoritative name server',
    ttlTicks: snapshot.dns?.ttlTicks ?? 300,
    lookups: snapshot.dns?.lookups ?? 0,
    cachedHits: snapshot.dns?.cachedHits ?? 0,
    authoritative: snapshot.dns?.authoritative ?? 0,
    lastLookup: snapshot.dns?.lastLookup ?? null,
    ledger: snapshot.dns?.cache ?? [],
  }),
  router: (snapshot) => ({
    address: snapshot.router?.address ?? '10.65',
    rightAddress: snapshot.router?.rightAddress ?? '20.1',
    routedTotal: snapshot.router?.routed ?? 0,
    lastCross: snapshot.router?.lastCross ?? null,
  }),
};
