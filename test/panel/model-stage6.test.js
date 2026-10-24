import { describe, it, expect } from 'vitest';
import { describeSnapshot } from '../../js/panel/model.js';
import { formatComponentState, componentTitle } from '../../js/panel/inspector-state.js';

// Stage-boundary extraction from model.test.js (guard-file-size): the Stage
// 6 DNS labels and the dns/router inspector state live here so model.test.js
// stays inside the 450-line test cap.
const baseSnapshot = {
  stage: 6,
  tick: 1,
  users: 5,
  serverAddress: '10.1',
  queueDepth: 0,
  served: 1,
  avgLatencyTicks: 1,
  dns: {
    address: '10.60',
    ttlTicks: 300,
    lookups: 1,
    cachedHits: 0,
    authoritative: 1,
    lastLookup: { name: 'example.com', status: 'AUTH', target: '10.1', atTick: 1 },
    cache: [{ name: 'example.com', target: '10.1', expiresAtTick: 301, ttlRemaining: 300 }],
  },
  router: { address: '10.65', rightAddress: '20.1', routed: 0, lastCross: null },
  workerQueue: {
    address: '10.40',
    workerAddress: '10.41',
    jobDurationTicks: 2,
    enqueued: 0,
    completed: 0,
    activeJob: null,
    pendingJobs: [],
    lastJobResult: null,
  },
  trace: {
    hop: 2,
    method: 'GET',
    path: 'example.com/about',
    host: 'example.com',
    dnsTarget: '10.1',
    nx: false,
    request: 'GET example.com/about',
    targetServer: '10.11',
    asyncJob: false,
    cacheStatus: 'MISS',
    dbOp: null,
    dbStale: false,
    response: '200 This is the about page',
    status: 200,
    body: 'This is the about page',
    routeId: 'about',
  },
};

describe('describeSnapshot stage 6', () => {
  it('describes the hosted 10-hop trace with the DNS ask/answer prelude and ledger labels', () => {
    const labels = describeSnapshot(baseSnapshot);
    expect(labels.stage).toBe(6);
    expect(labels.totalHops).toBe(10);
    expect(labels.hopStatus).toBe('Hop 2/10: Browser (10.2) -> DNS (10.60): who is example.com?');

    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...baseSnapshot, trace: { ...baseSnapshot.trace, hop, ...over } })
        .hopStatus;
    expect(hopLabels(1)).toBe('Hop 1/10: Browser (10.2) emits "GET example.com/about"');
    expect(hopLabels(3)).toBe('Hop 3/10: DNS (10.60) -> Browser (10.2) answers 10.1');
    // Hops 4-10 replay the stage-5 chain renumbered behind the prelude; the
    // re-pointed GET reads its plain path exactly as the real trace carries
    // it after hop 3.
    expect(hopLabels(4, { request: 'GET /about' })).toBe(
      'Hop 4/10: Network (10.x) routes to LoadBalancer (10.1)',
    );
    expect(hopLabels(5, { request: 'GET /about' })).toBe(
      'Hop 5/10: LoadBalancer (10.1) -> 10.11 queue',
    );
    expect(hopLabels(6, { request: 'GET /about' })).toBe(
      'Hop 6/10: Database SKIP — warm cache HIT (10.20)',
    );
    expect(hopLabels(7, { request: 'GET /about' })).toBe(
      'Hop 7/10: WebServer (10.11) -> "200 This is the about page" (cache MISS)',
    );
    expect(hopLabels(10, { request: 'GET /about' })).toBe(
      'Hop 10/10: Worker (10.41) idle — no async jobs in this trace',
    );
    expect(hopLabels(11)).toBe('Idle — type a path and click Go or Step 1 Hop ->');

    // The DNS HUD labels mirror the ledger counters and the TTL, and the
    // entry rows come straight off the snapshot's live Map.
    expect(labels.dnsStatsLabel).toBe('Lookups: 1 · Cached: 0 · Authoritative: 1 · TTL: 300t');
    expect(labels.dnsEntries).toEqual(baseSnapshot.dns.cache);
    expect(labels.routerStatsLabel).toBe('Router 10.65 ⇄ 20.1 · Routed: 0');
  });

  // CHECKS: named counter-example — the host-less shape keeps the stage-5
  // story byte-identical (8 hops, no DNS hop, no cross-subnet hop).
  it('keeps a host-less /about trace at the byte-identical stage-5 sentences', () => {
    const snap = {
      ...baseSnapshot,
      trace: {
        ...baseSnapshot.trace,
        hop: 1,
        host: null,
        dnsTarget: null,
      },
    };
    const labels = describeSnapshot(snap);
    // totalHops stays the stage-6 map value (10); the trace-aware final hop
    // for the host-less shape (8) is panel.js's traceFinalHop contract.
    expect(labels.totalHops).toBe(10);
    expect(labels.hopStatus).toBe('Hop 1/8: Browser (10.2) emits "GET example.com/about"');
    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...snap, trace: { ...snap.trace, hop, ...over } }).hopStatus;
    expect(hopLabels(2)).toBe('Hop 2/8: Network (10.x) routes to LoadBalancer (10.1)');
    expect(hopLabels(8)).toBe('Hop 8/8: Worker (10.41) idle — no async jobs in this trace');
  });

  // PINS: negative case — an NX answer ends the trace at hop 3 and the
  // narrative never names a GET anywhere downstream: no hop 4, no served
  // sentence — the browser renders the refusal card instead.
  it('ends the NX narrative at the answer hop with no GET emitted', () => {
    const snap = {
      ...baseSnapshot,
      trace: {
        ...baseSnapshot.trace,
        hop: 3,
        host: 'nope.example',
        dnsTarget: null,
        nx: true,
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.hopStatus).toBe(
      'Hop 3/3: DNS (10.60) -> Browser (10.2): NX no record — no GET emitted',
    );
    const after = describeSnapshot({ ...snap, trace: { ...snap.trace, hop: 4 } });
    expect(after.hopStatus).toBe('Idle — type a path and click Go or Step 1 Hop ->');
    expect(JSON.stringify(after.hopStatus + after.exchangeSummary)).not.toContain('GET /about');

    // The dns inspector state carries the ledger and both counters; the
    // router inspector exposes the gateway pair and its cross-subnet tally;
    // the network table names all three new interfaces.
    const dnsState = JSON.parse(formatComponentState(snap, 'dns'));
    expect(dnsState).toEqual({
      address: '10.60',
      role: 'authoritative name server',
      ttlTicks: 300,
      lookups: 1,
      cachedHits: 0,
      authoritative: 1,
      lastLookup: baseSnapshot.dns.lastLookup,
      ledger: baseSnapshot.dns.cache,
    });
    expect(componentTitle(snap, 'dns')).toBe('DNS — mini-IP 10.60');
    const routerState = JSON.parse(formatComponentState(snap, 'router'));
    expect(routerState).toEqual({
      address: '10.65',
      rightAddress: '20.1',
      routedTotal: 0,
      lastCross: null,
    });
    expect(componentTitle(snap, 'router')).toBe('Router — mini-IP 10.65 ⇄ 20.1');
    const networkState = JSON.parse(formatComponentState(snap, 'network'));
    expect(networkState.interfaces['10.60']).toBe('DNS');
    expect(networkState.interfaces['10.65']).toBe('Router (left)');
    expect(networkState.interfaces['20.1']).toBe('Router (right)');
  });
});
