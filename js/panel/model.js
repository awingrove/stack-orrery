// DOCUMENTS: pure presentation model — engine snapshot in, labels and bar
// geometry out. No DOM here: this is what the unit suite pins; panel.js and
// render.js own all DOM writes.
export const TICK_MS = 100;
const QUEUE_BAR_SATURATION = 20; // bar reads full at 20 queued requests

const HOP_START_SENTENCE = 'Idle — type a path and click Go or Step 1 Hop ->';

function fillPercent(depth) {
  return `${Math.min(100, Math.round((depth / QUEUE_BAR_SATURATION) * 100))}%`;
}

// One hop-status sentence per hop, in hop order, for each stage's trace
// shape: 4 hops in Stage 1 (emit, route, serve, render), 5 in Stage 2 (LB
// round-robin pick), 6 in Stage 3 (cache check, then response emit).
function hopSentences(stage, snapshot, from, serverAddress) {
  const t = snapshot.trace ?? {};
  const target = t.targetServer ?? '10.11';
  if (stage === 3) {
    return [
      `Hop 1/6: Browser (${from}) emits "${t.request}"`,
      `Hop 2/6: Network (10.x) routes to LoadBalancer (${serverAddress})`,
      `Hop 3/6: LoadBalancer (${serverAddress}) -> ${target} queue`,
      `Hop 4/6: WebServer (${target}) checks Cache (10.20) — ${t.cacheStatus}`,
      `Hop 5/6: WebServer (${target}) -> "${t.response}" (cache ${t.cacheStatus})`,
      `Hop 6/6: Browser (${from}) rendered ${t.status}`,
    ];
  }
  if (stage === 2) {
    return [
      `Hop 1/5: Browser (${from}) emits "${t.request}"`,
      `Hop 2/5: Network (10.x) routes to LoadBalancer (${serverAddress})`,
      `Hop 3/5: LoadBalancer (${serverAddress}) -> ${target} queue`,
      `Hop 4/5: WebServer (${target}) -> "${t.response}"`,
      `Hop 5/5: Browser (${from}) rendered ${t.status}`,
    ];
  }
  return [
    `Hop 1/4: Browser (${from}) emits "${t.request}"`,
    `Hop 2/4: Network (10.x) routes to ${serverAddress} queue`,
    `Hop 3/4: WebServer (${serverAddress}) -> "${t.response}"`,
    `Hop 4/4: Browser (${from}) rendered ${t.status}`,
  ];
}

function formatHopStatus(snapshot, serverAddress) {
  const hop = snapshot.trace?.hop ?? 0;
  const from = snapshot.trace?.from ?? '10.2';
  if (hop >= 1) {
    const sentences = hopSentences(snapshot.stage ?? 1, snapshot, from, serverAddress);
    if (hop <= sentences.length) return sentences[hop - 1];
  }
  return HOP_START_SENTENCE;
}

export function describeSnapshot(snapshot) {
  const stage = snapshot.stage ?? 1;
  const latencyMs = Math.round(snapshot.avgLatencyTicks * TICK_MS);
  const last = snapshot.lastExchange ?? null;
  const hop = snapshot.trace?.hop ?? 0;
  const serverAddress = snapshot.serverAddress ?? '10.1';
  const s1Depth = snapshot.servers?.[0]?.queueDepth ?? snapshot.queueDepth;
  const s2Depth = snapshot.servers?.[1]?.queueDepth ?? 0;
  const perBackend = snapshot.loadBalancer?.perBackend ?? {};
  return {
    stage,
    totalHops: stage === 3 ? 6 : stage === 2 ? 5 : 4,
    tick: String(snapshot.tick),
    users: String(snapshot.users),
    queueDepth: String(snapshot.queueDepth),
    served: String(snapshot.served),
    latency: `${latencyMs} ms`,
    queueFill: fillPercent(snapshot.queueDepth),
    queueFill1: fillPercent(s1Depth),
    queueFill2: fillPercent(s2Depth),
    serverAddress,
    server1Address: snapshot.servers?.[0]?.address ?? serverAddress,
    server2Address: snapshot.servers?.[1]?.address ?? '10.12',
    lbNextBackend: snapshot.loadBalancer
      ? `Next -> ${snapshot.loadBalancer.nextBackend}`
      : 'Next -> 10.11',
    lbBackend1Label: `10.11 WebServer-1 (${perBackend['10.11'] ?? 0})`,
    lbBackend2Label: `10.12 WebServer-2 (${perBackend['10.12'] ?? 0})`,
    cacheStatsLabel: `Hits: ${snapshot.cache?.hits ?? 0} · Misses: ${snapshot.cache?.misses ?? 0} · TTL: ${snapshot.cache?.ttlTicks ?? 10}t`,
    cacheEntries: snapshot.cache?.entries ?? [],
    exchangeSummary: last
      ? `${last.from} -> ${last.to} ${last.request} => ${last.response}`
      : 'No requests served yet',
    hop,
    hopStatus: formatHopStatus(snapshot, serverAddress),
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
