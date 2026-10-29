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
