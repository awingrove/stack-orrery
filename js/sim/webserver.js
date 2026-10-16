// DOCUMENTS: the first real component — a single simulated web server.
// Fixed service capacity per tick, FIFO queue; latency = ticks waited plus
// service. Deterministic by construction: no clock, no RNG — time arrives
// as the `currentTick` argument. Requests arrive as wire records
// (from/to mini-IP + "GET /path"); responses leave as "<status> <body>".
//
// CHECKS: constructor rejects a non-positive/non-integer serviceRate
// (fail-loud over silent-slow).
//
// DOCUMENTS: matchRoute is the whole HTTP contract at this stage —
// method gate first (405), then path routing (200 home, 200 about,
// 404 everything else) — with a routeId so the panel can light up the
// matched entry in the server's visible route table. handleRequest stays
// the same handler the network invokes on every request, exactly as the
// wire sees it.
export function createWebServer({ address = '10.1', serviceRate = 4 } = {}) {
  if (!Number.isInteger(serviceRate) || serviceRate < 1) {
    throw new Error(`webserver: serviceRate must be a positive integer, got ${serviceRate}`);
  }
  let queue = [];
  let served = 0;
  const latencyWindow = []; // rolling: last 50 response latencies, in ticks
  const WINDOW = 50;

  function matchRoute(request = 'GET /') {
    const trimmed = String(request).trim();
    const spaceAt = trimmed.indexOf(' ');
    const method = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
    const path = spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1);
    let response;
    let routeId;
    if (method !== 'GET') {
      response = '405 Only GET requests are supported';
      routeId = 'route-405';
    } else if (path === '/') {
      response = '200 Welcome to the home page';
      routeId = 'route-home';
    } else if (path === '/about') {
      response = '200 This is the about page';
      routeId = 'route-about';
    } else {
      response = '404 Page not found';
      routeId = 'route-404';
    }
    const splitAt = response.indexOf(' ');
    const status = Number(response.slice(0, splitAt));
    const body = response.slice(splitAt + 1);
    return { response, status, body, routeId };
  }

  function handleRequest(request = 'GET /') {
    return matchRoute(request).response;
  }

  return {
    get address() {
      return address;
    },

    matchRoute,

    handleRequest,

    // `isYou` marks the learner's own interactive-browser request so
    // visible queue rows can highlight it (DESIGN.md queue-pill-you).
    enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /', isYou = false }) {
      queue.push({ id, atTick, from, to, request, isYou });
    },

    // Consume up to serviceRate requests FIFO; emit one full wire record
    // per response, keeping the fields the inspector needs on screen.
    step(currentTick) {
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
      served += responses.length;
      for (const r of responses) {
        latencyWindow.push(r.latencyTicks);
        if (latencyWindow.length > WINDOW) latencyWindow.shift();
      }
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
    // tokens (DESIGN.md: never only an opaque progress bar).
    queueSnapshot() {
      return queue.map((r) => ({ ...r }));
    },
  };
}
