// DOCUMENTS: the first real component — a single simulated web server.
// Fixed service capacity per tick, FIFO queue, and an in-memory filesystem
// (`fs`, a Map of URL path -> file contents). Deterministic by construction:
// no clock, no RNG — time arrives as the `currentTick` argument. Requests
// arrive as wire records (from/to mini-IP + "GET /path"); responses leave as
// "<status> <body>".
//
// Stage 3: with a Cache attached, GETs resolve through the cache-aside
// lookup (`resolveRequest`) and step() spends a per-tick work budget — a
// warm GET cache hit costs 1 unit, a miss or non-GET costs 2 — so a warm
// server serves up to serviceRate * 2 requests per tick. With no cache
// attached the component is unchanged Stage 1/2 behavior.
//
// Stage 4: with a Database attached, POSTs write through to the primary and
// invalidate the cached path, and a cache MISS fills from the read replica —
// a stale replica read is served but not cached, so the entry only warms
// from rows the replica has already caught up to.
//
// CHECKS: constructor rejects a non-positive/non-integer serviceRate
// (fail-loud over silent-slow).
const DEFAULT_FILES = {
  '/': 'Welcome to the home page',
  '/about': 'This is the about page',
};

function parseRequest(request = 'GET /') {
  const trimmed = String(request).trim();
  const spaceAt = trimmed.indexOf(' ');
  return {
    method: spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt),
    path: spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1),
  };
}

function routeIdFor(path) {
  return path === '/' ? 'route-home' : `route-${path.slice(1)}`;
}

export function createWebServer({
  address = '10.1',
  serviceRate = 4,
  files = DEFAULT_FILES,
  cache = null,
  database = null,
} = {}) {
  if (!Number.isInteger(serviceRate) || serviceRate < 1) {
    throw new Error(`webserver: serviceRate must be a positive integer, got ${serviceRate}`);
  }
  const fs = new Map(Object.entries(files));
  let queue = [];
  let served = 0;
  const latencyWindow = []; // rolling: last 50 response latencies, in ticks
  const WINDOW = 50;

  function matchRoute(request = 'GET /') {
    const { method, path } = parseRequest(request);
    let response;
    let routeId = null;
    if (method !== 'GET') {
      response = '405 Only GET requests are supported';
    } else if (fs.has(path)) {
      response = `200 ${fs.get(path)}`;
      routeId = routeIdFor(path);
    } else {
      response = '404 Page not found';
    }
    const splitAt = response.indexOf(' ');
    const status = Number(response.slice(0, splitAt));
    const body = response.slice(splitAt + 1);
    return { response, status, body, routeId };
  }

  function handleRequest(request = 'GET /') {
    return matchRoute(request).response;
  }

  // Cache-aside resolution: GETs consult the Cache first and fall through to
  // the filesystem only on a miss, then fill the cache from the 200 response.
  // With a Database attached (Stage 4), POSTs write through to the primary
  // and invalidate the cached path, and a miss fills from the read replica —
  // stale rows are served but not cached, so the cache only warms from
  // replica rows that have already caught up. Everything else bypasses
  // untouched.
  function resolveRequest(request = 'GET /', currentTick = 0) {
    if (!cache && !database) return { ...matchRoute(request), cacheStatus: null };
    const { method, path } = parseRequest(request);
    if (method !== 'GET') {
      if (!database) return { ...matchRoute(request), cacheStatus: 'BYPASS' };
      const written = database.write(path, `Updated ${path} at tick ${currentTick}`, currentTick);
      cache?.del(path);
      return {
        response: `200 ${written.value}`,
        status: 200,
        body: written.value,
        routeId: routeIdFor(path),
        cacheStatus: 'INVALIDATE',
        dbOp: 'WRITE',
        dbTarget: database.primaryAddress,
        dbStale: false,
      };
    }
    if (cache) {
      const cached = cache.get(path, currentTick);
      if (cached !== null) {
        const hit = {
          response: `200 ${cached}`,
          status: 200,
          body: cached,
          routeId: routeIdFor(path),
          cacheStatus: 'HIT',
        };
        if (database) {
          hit.dbOp = null;
          hit.dbTarget = null;
          hit.dbStale = false;
        }
        return hit;
      }
    }
    if (database) {
      const row = database.read(path, currentTick);
      if (row.found) {
        if (!row.stale) cache?.set(path, row.value, currentTick);
        return {
          response: `200 ${row.value}`,
          status: 200,
          body: row.value,
          routeId: routeIdFor(path),
          cacheStatus: 'MISS',
          dbOp: 'SELECT',
          dbTarget: database.replicaAddress,
          dbStale: row.stale,
        };
      }
      const missing = matchRoute(request);
      return {
        ...missing,
        cacheStatus: 'MISS',
        dbOp: 'SELECT',
        dbTarget: database.replicaAddress,
        dbStale: false,
      };
    }
    const matched = matchRoute(request);
    if (matched.status === 200) cache.set(path, matched.body, currentTick);
    return { ...matched, cacheStatus: 'MISS' };
  }

  function pushLatency(responses) {
    served += responses.length;
    for (const r of responses) {
      latencyWindow.push(r.latencyTicks);
      if (latencyWindow.length > WINDOW) latencyWindow.shift();
    }
  }

  return {
    get address() {
      return address;
    },

    matchRoute,

    handleRequest,

    resolveRequest,

    filesSnapshot() {
      return Object.fromEntries(fs);
    },

    // `isYou` marks the learner's own interactive-browser request so
    // visible queue rows can highlight it (DESIGN.md queue-pill-you).
    enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /', isYou = false }) {
      queue.push({ id, atTick, from, to, request, isYou });
    },

    // No cache or database (Stages 1 and 2): consume up to serviceRate
    // requests FIFO. With a cache (Stage 3+): consume up to a work budget of
    // serviceRate * 2 units — a warm GET cache hit costs 1, a miss or
    // non-GET costs 2.
    step(currentTick) {
      if (!cache && !database) {
        const batch = queue.splice(0, serviceRate);
        const responses = batch.map((r) => {
          const matched = matchRoute(r.request);
          return {
            id: r.id,
            from: r.from,
            to: r.to,
            request: r.request,
            isYou: r.isYou,
            response: matched.response,
            status: matched.status,
            body: matched.body,
            routeId: matched.routeId,
            latencyTicks: currentTick - r.atTick + 1,
          };
        });
        pushLatency(responses);
        return responses;
      }
      const budget = serviceRate * 2;
      const responses = [];
      let used = 0;
      while (queue.length > 0) {
        const { method, path } = parseRequest(queue[0].request);
        const cost = method === 'GET' && (!cache || cache.has(path, currentTick)) ? 1 : 2;
        if (used + cost > budget) break;
        const r = queue.shift();
        used += cost;
        const matched = resolveRequest(r.request, currentTick);
        const record = {
          id: r.id,
          from: r.from,
          to: r.to,
          request: r.request,
          isYou: r.isYou,
          response: matched.response,
          status: matched.status,
          body: matched.body,
          routeId: matched.routeId,
          cacheStatus: matched.cacheStatus,
          latencyTicks: currentTick - r.atTick + 1,
        };
        if (database) {
          record.dbOp = matched.dbOp ?? null;
          record.dbTarget = matched.dbTarget ?? null;
          record.dbStale = Boolean(matched.dbStale);
        }
        responses.push(record);
      }
      pushLatency(responses);
      return responses;
    },

    metrics() {
      const avgLatencyTicks =
        latencyWindow.length === 0
          ? 0
          : latencyWindow.reduce((sum, t) => sum + t, 0) / latencyWindow.length;
      return { queueDepth: queue.length, served, avgLatencyTicks };
    },

    // The panel renders the waiting requests as individual visible
    // tokens (DESIGN.md: not only an opaque progress bar).
    queueSnapshot() {
      return queue.map((r) => ({ ...r }));
    },
  };
}
