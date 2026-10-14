// DOCUMENTS: the first real component — a single simulated web server.
// Fixed service capacity per tick, FIFO queue; latency = ticks waited plus
// service. Deterministic by construction: no clock, no RNG — time arrives
// as the `currentTick` argument.
//
// CHECKS: constructor rejects a non-positive/non-integer serviceRate
// (fail-loud over silent-slow).
export function createWebServer({ serviceRate = 4 } = {}) {
  if (!Number.isInteger(serviceRate) || serviceRate < 1) {
    throw new Error(`webserver: serviceRate must be a positive integer, got ${serviceRate}`);
  }
  let queue = [];
  let served = 0;
  const latencyWindow = []; // rolling: last 50 response latencies, in ticks
  const WINDOW = 50;

  return {
    enqueue({ id, atTick }) {
      queue.push({ id, atTick });
    },

    // Consume up to serviceRate requests FIFO; emit one response event each.
    step(currentTick) {
      const batch = queue.splice(0, serviceRate);
      const responses = batch.map((r) => ({
        id: r.id,
        latencyTicks: currentTick - r.atTick + 1,
      }));
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
