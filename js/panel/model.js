// DOCUMENTS: pure presentation model — engine snapshot in, labels and bar
// geometry out. No DOM here: this is what the unit suite pins; panel.js
// owns all DOM writes.
export const TICK_MS = 100;
const QUEUE_BAR_SATURATION = 20; // bar reads full at 20 queued requests

export function describeSnapshot(snapshot) {
  const latencyMs = Math.round(snapshot.avgLatencyTicks * TICK_MS);
  const queueFill = Math.min(100, Math.round((snapshot.queueDepth / QUEUE_BAR_SATURATION) * 100));
  const last = snapshot.lastExchange ?? null;
  return {
    tick: String(snapshot.tick),
    users: String(snapshot.users),
    queueDepth: String(snapshot.queueDepth),
    served: String(snapshot.served),
    latency: `${latencyMs} ms`,
    queueFill: `${queueFill}%`,
    serverAddress: snapshot.serverAddress ?? '10.1',
    exchangeSummary: last
      ? `${last.from} -> ${last.to} ${last.request} => ${last.response}`
      : 'No requests served yet',
  };
}
