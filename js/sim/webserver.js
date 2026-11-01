// DOCUMENTS: the first real component — a single simulated web server.
// Fixed service capacity per tick, FIFO queue, and an in-memory fs Map of
// path -> contents. Deterministic by construction: no clock, no RNG — time
// arrives as the `currentTick` argument. Requests arrive as wire records
// (from/to mini-IP + "GET /path"); responses leave as "<status> <body>".
//
// Stage 3: with a Cache attached, GETs resolve through cache-aside lookup
// (`resolveRequest`) and step() spends a work budget — a warm GET hit costs
// 1 unit, a miss or non-GET costs 2. Stage 4: POSTs write through to the
// primary and invalidate the cached path; a cache MISS fills from the read
// replica — stale replica reads are served but not cached.
//
// Editable fs: writeFile(path, body) mutates the fs Map. An edit is NOT a
// POST: it invalidates nothing — cached copies age out by their TTL only.
//
// B-6 fault state: setDown stores a real on/off flag (isDown() reads it
// back) and changes NOTHING about handleRequest, enqueue, or step — the
// transport consults isDown() before dispatch, so a down server answers
// no wire traffic at all. CHECKS: constructor rejects a non-positive
// serviceRate and a non-mini-IP address (assertWebServerOptions,
// webserver-helpers.js) and setDown rejects a non-boolean flag (fail-loud).
//
// B-6c: with the cache bypassed, GETs take the origin path (the same branch
// a MISS takes) and return cacheStatus 'BYPASSED' — nothing consults the
// cache while the flag holds, and the origin tally counts those routes.
import {
  parseRequest,
  matchFsRoute,
  routeIdFor,
  assertWebServerOptions,
  writeAcceptedRecord,
  writeDownRecord,
  DEFAULT_FILES,
} from './webserver-helpers.js';

export function createWebServer({
  address = '10.1',
  serviceRate = 4,
  files = DEFAULT_FILES,
  cache = null,
  database = null,
  workerQueue = null,
} = {}) {
  assertWebServerOptions({ address, serviceRate });
  const fs = new Map(Object.entries(files));
  let queue = [];
  let served = 0;
  let down = false;
  let bypassedRoutes = 0; // B-6c: routes that took the origin path while the cache is bypassed
  let refusedWrites = 0; // B-6d: writes refused while the database primary is down
  const latencyWindow = []; // rolling: last 50 response latencies, in ticks
  const WINDOW = 50;

  // The local fs is the only stateful part: the pure route helper carries
  // none (webserver-helpers.js).
  function matchRoute(request = 'GET /') {
    return matchFsRoute(fs, request);
  }

  function handleRequest(request = 'GET /') {
    return matchRoute(request).response;
  }

  // Cache-aside resolution: GETs consult the Cache first, fall through to
  // the filesystem on a miss, and fill from the 200 response. With a
  // Database (Stage 4), POSTs write through and invalidate the cached path;
  // a miss fills from the read replica (stale served, not cached).
  function resolveRequest(request = 'GET /', currentTick = 0) {
    if (!cache && !database && !workerQueue) return { ...matchRoute(request), cacheStatus: null };
    const { method, path } = parseRequest(request);
    if (method !== 'GET') {
      if (workerQueue && (path === '/jobs' || path === '/export')) {
        const job = workerQueue.enqueue(
          path,
          `Payload for ${path} at tick ${currentTick}`,
          currentTick,
        );
        return {
          response: `202 {"jobId": ${job.jobId}, "status": "queued"}`,
          status: 202,
          body: `{"jobId": ${job.jobId}, "status": "queued"}`,
          routeId: routeIdFor(path),
          cacheStatus: 'ASYNC',
          dbOp: null,
          dbTarget: null,
          dbStale: false,
          asyncJob: true,
          jobId: job.jobId,
        };
      }
      if (!database) return { ...matchRoute(request), cacheStatus: 'BYPASS' };
      // CHECKS: B-6d — the consult runs FIRST: a refused write invalidates
      // nothing (no write, no cache.del) and answers the real 503 — never a fake 200.
      if (database?.isPrimaryDown?.()) {
        refusedWrites += 1;
        return writeDownRecord(path, database.primaryAddress);
      }
      const written = database.write(path, `Updated ${path} at tick ${currentTick}`, currentTick);
      cache?.del(path);
      return writeAcceptedRecord(path, written, database.primaryAddress);
    }
    // CHECKS: B-6c — the bypass consult is the cache component's own
    // isBypass() state, checked before the lookup. While it holds, this
    // GET takes the origin path exactly the branch a MISS takes (Stage 4+:
    // the replica read; Stage 3: the filesystem), returns cacheStatus
    // 'BYPASSED', and never calls cache.get()/cache.set() — no fill while
    // bypassed, so no zombie warm entries. The origin tally increments in
    // this branch only; the method-level 'BYPASS' token a non-GET carries
    // is a different record and never strays into it.
    const bypassedCache = cache?.isBypass?.() === true;
    if (bypassedCache) bypassedRoutes += 1;
    if (cache && !bypassedCache) {
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
        if (!row.stale && !bypassedCache) cache?.set(path, row.value, currentTick);
        return {
          response: `200 ${row.value}`,
          status: 200,
          body: row.value,
          routeId: routeIdFor(path),
          cacheStatus: bypassedCache ? 'BYPASSED' : 'MISS',
          dbOp: 'SELECT',
          dbTarget: database.replicaAddress,
          dbStale: row.stale,
        };
      }
      const missing = matchRoute(request);
      return {
        ...missing,
        cacheStatus: bypassedCache ? 'BYPASSED' : 'MISS',
        dbOp: 'SELECT',
        dbTarget: database.replicaAddress,
        dbStale: false,
      };
    }
    const matched = matchRoute(request);
    if (matched.status === 200 && !bypassedCache) cache.set(path, matched.body, currentTick);
    return { ...matched, cacheStatus: bypassedCache ? 'BYPASSED' : 'MISS' };
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

    // CHECKS: writeFile mutates only this server's fs Map — an existing fs
    // key plus a non-empty string body; anything else throws (fail-loud
    // over a silent bogus write). Deliberately no cache invalidation and no
    // clock: cached copies age out by their TTL alone (the stage-3
    // stale-read branch), and the Map's insertion order survives a re-set.
    writeFile(path, body) {
      if (!fs.has(path)) {
        throw new Error(`webserver: writeFile — unknown fs path "${path}"`);
      }
      if (typeof body !== 'string' || body.length === 0) {
        throw new Error(`webserver: writeFile — body must be a non-empty string`);
      }
      fs.set(path, body);
    },

    // CHECKS: setDown validates its argument as a real boolean ON/OFF state
    // and throws otherwise; it flips only the component's own flag (the
    // transport refuses before dispatch — this method changes nothing else).
    setDown(nextDown) {
      if (typeof nextDown !== 'boolean') {
        throw new Error(`webserver: setDown — down must be a boolean, got ${nextDown}`);
      }
      down = nextDown;
    },

    isDown() {
      return down;
    },

    // The B-6c read-back: how many routes this server took the origin path
    // on because the cache is bypassed (the cache itself is not consulted,
    // so the tally cannot live there).
    bypassedCount() {
      return bypassedRoutes;
    },

    // B-6d read-back: writes this server refused while the primary is down.
    failedWrites: () => refusedWrites,

    // `isYou` marks the learner's own interactive-browser request.
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
        record.asyncJob = Boolean(matched.asyncJob);
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
