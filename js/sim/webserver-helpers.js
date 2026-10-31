// DOCUMENTS: the pure request-and-route helpers of the WebServer
// (extracted by responsibility, guard-file-size; the trace-helpers.js
// precedent — no behavior change, wiring identical). parseRequest splits
// the slim wire record into method/path; matchFsRoute applies the server's
// own route table (the server hands its live fs Map in — the helper carries
// no state); routeIdFor names the matched route. Nothing here consults a
// clock, a cache, or a database.

export function parseRequest(request = 'GET /') {
  const trimmed = String(request).trim();
  const spaceAt = trimmed.indexOf(' ');
  return {
    method: spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt),
    path: spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1),
  };
}

export function routeIdFor(path) {
  return path === '/' ? 'route-home' : `route-${path.slice(1)}`;
}

export function matchFsRoute(fs, request = 'GET /') {
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

// Stage-4 write-through records (extracted with the B-6d consult branch,
// guard-file-size): the accepted record carries the written value and the
// INVALIDATE cache verdict; the refused record is the real 503 the down
// primary answers — cacheStatus stays null because nothing was written, so
// the cached copy keeps serving (no cache.del happens on the consult side).
export function writeAcceptedRecord(path, written, primaryAddress) {
  return {
    response: `200 ${written.value}`,
    status: 200,
    body: written.value,
    routeId: routeIdFor(path),
    cacheStatus: 'INVALIDATE',
    dbOp: 'WRITE',
    dbTarget: primaryAddress,
    dbStale: false,
  };
}

export function writeDownRecord(path, primaryAddress) {
  return {
    response: '503 Write unavailable (primary down)',
    status: 503,
    body: 'Write unavailable (primary down)',
    routeId: routeIdFor(path),
    cacheStatus: null,
    dbOp: 'WRITE_DOWN',
    dbTarget: primaryAddress,
    dbStale: false,
  };
}
