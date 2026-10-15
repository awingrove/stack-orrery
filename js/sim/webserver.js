// DOCUMENTS: the first real component — a single simulated web server.
// Fixed service capacity per tick, FIFO queue; latency = ticks waited plus
// service. Deterministic by construction: no clock, no RNG — time arrives
// as the `currentTick` argument. Requests arrive as wire records
// (from/to mini-IP + "GET /path"); responses leave as "<status> <body>".
//
// CHECKS: constructor rejects a non-positive/non-integer serviceRate
// (fail-loud over silent-slow).
//
// DOCUMENTS: handleRequest is the whole HTTP contract at this stage —
// method gate first (405), then path routing (200 home, 200 about,
// 404 everything else). It is the same handler the network invokes on
// every request, so unit tests pin the server exactly as the wire sees it.
export function createWebServer({ address = '10.1', serviceRate = 4 } = {}) {
  if (!Number.isInteger(serviceRate) || serviceRate < 1) {
    throw new Error(`webserver: serviceRate must be a positive integer, got ${serviceRate}`);
  }
  let queue = [];
  let served = 0;
  const latencyWindow = []; // rolling: last 50 response latencies, in ticks
  const WINDOW = 50;

  function handleRequest(request = 'GET /') {
    const trimmed = String(request).trim();
    const spaceAt = trimmed.indexOf(' ');
    const method = spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt);
    const path = spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1);
    if (method !== 'GET') return '405 Only GET requests are supported';
    if (path === '/') return '200 Welcome to the home page';
    if (path === '/about') return '200 This is the about page';
    return '404 Page not found';
  }

  return {
    get address() {
      return address;
    },

    handleRequest,

    enqueue({ id, atTick, from = '10.2', to = address, request = 'GET /' }) {
      queue.push({ id, atTick, from, to, request });
    },

    // Consume up to serviceRate requests FIFO; emit one full wire record
    // per response, keeping the fields the inspector needs on screen.
    step(currentTick) {
      const batch = queue.splice(0, serviceRate);
      const responses = batch.map((r) => {
        const response = handleRequest(r.request);
        const splitAt = response.indexOf(' ');
        const status = Number(response.slice(0, splitAt));
        const body = response.slice(splitAt + 1);
        return {
          id: r.id,
          from: r.from,
          to: r.to,
          request: r.request,
          response,
          status,
          body,
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
  };
}
