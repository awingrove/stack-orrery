// DOCUMENTS: pure presentation model — engine snapshot in, labels and bar
// geometry out. No DOM here: this is what the unit suite pins; panel.js
// owns all DOM writes.
export const TICK_MS = 100;
const QUEUE_BAR_SATURATION = 20; // bar reads full at 20 queued requests

const HOP_START_SENTENCE = 'Idle — type a path and click Go or Step 1 Hop ->';

export function describeSnapshot(snapshot) {
  const latencyMs = Math.round(snapshot.avgLatencyTicks * TICK_MS);
  const queueFill = Math.min(100, Math.round((snapshot.queueDepth / QUEUE_BAR_SATURATION) * 100));
  const last = snapshot.lastExchange ?? null;
  const hop = snapshot.trace?.hop ?? 0;
  const serverAddress = snapshot.serverAddress ?? '10.1';
  return {
    tick: String(snapshot.tick),
    users: String(snapshot.users),
    queueDepth: String(snapshot.queueDepth),
    served: String(snapshot.served),
    latency: `${latencyMs} ms`,
    queueFill: `${queueFill}%`,
    serverAddress,
    exchangeSummary: last
      ? `${last.from} -> ${last.to} ${last.request} => ${last.response}`
      : 'No requests served yet',
    hop,
    hopStatus:
      hop === 1
        ? `Hop 1/4: Browser (10.2) emits "${snapshot.trace.request}"`
        : hop === 2
          ? `Hop 2/4: Network (10.x) routes to ${serverAddress} queue`
          : hop === 3
            ? `Hop 3/4: WebServer (${serverAddress}) -> "${snapshot.trace.response}"`
            : hop === 4
              ? `Hop 4/4: Browser (10.2) rendered ${snapshot.trace.status}`
              : HOP_START_SENTENCE,
    browserStatus: snapshot.browserDisplay
      ? `${snapshot.browserDisplay.status} (${snapshot.browserDisplay.request})`
      : 'No response yet',
    browserBody: snapshot.browserDisplay
      ? snapshot.browserDisplay.body
      : 'Send a request or step a hop to render a response.',
    networkLastFrame: snapshot.lastFrame ?? 'No frames routed yet',
    matchedRouteId: snapshot.lastMatchedRoute ?? null,
  };
}
