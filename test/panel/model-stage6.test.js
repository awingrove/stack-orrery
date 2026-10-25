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
  router: { address: '10.65', rightAddress: '20.254', routed: 0, lastCross: null },
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
  it('describes the hosted 9-hop trace with the DNS ask/answer prelude and ledger labels', () => {
    const labels = describeSnapshot(baseSnapshot);
    expect(labels.stage).toBe(6);
    expect(labels.totalHops).toBe(9);
    expect(labels.hopStatus).toBe('Hop 2/9: DNS (10.60) -> Browser (10.2) answers 10.1');

    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...baseSnapshot, trace: { ...baseSnapshot.trace, hop, ...over } })
        .hopStatus;
    // Hop 1 is the DNS ask — the browser's composure of the GET is not a
    // wire hop, so no emission sentence exists on a hosted path.
    expect(hopLabels(1)).toBe('Hop 1/9: Browser (10.2) -> DNS (10.60): who is example.com?');
    expect(hopLabels(2)).toBe('Hop 2/9: DNS (10.60) -> Browser (10.2) answers 10.1');
    // Hops 3-9 replay the stage-5 wire chain renumbered behind the prelude;
    // the re-pointed GET reads its plain path exactly as the real trace
    // carries it after hop 2.
    expect(hopLabels(3, { request: 'GET /about' })).toBe(
      'Hop 3/9: Network (10.x) routes to LoadBalancer (10.1)',
    );
    expect(hopLabels(4, { request: 'GET /about' })).toBe(
      'Hop 4/9: LoadBalancer (10.1) -> 10.11 queue',
    );
    expect(hopLabels(5, { request: 'GET /about' })).toBe(
      'Hop 5/9: Database SKIP — warm cache HIT (10.20)',
    );
    expect(hopLabels(6, { request: 'GET /about' })).toBe(
      'Hop 6/9: WebServer (10.11) -> "200 This is the about page" (cache MISS)',
    );
    expect(hopLabels(9, { request: 'GET /about' })).toBe(
      'Hop 9/9: Worker (10.41) idle — no async jobs in this trace',
    );
    expect(hopLabels(10)).toBe('Idle — type a path and click Go or Step 1 Hop ->');

    // The DNS HUD labels mirror the ledger counters and the TTL, and the
    // entry rows come straight off the snapshot's live Map.
    expect(labels.dnsStatsLabel).toBe('Lookups: 1 · Cached: 0 · Authoritative: 1 · TTL: 300t');
    expect(labels.dnsEntries).toEqual(baseSnapshot.dns.cache);
    // Stage 6b: the Router's HUD line reports the re-seated right seat (the
    // CDN edge took 20.1).
    expect(labels.routerStatsLabel).toBe('Router 10.65 ⇄ 20.254 · Routed: 0');
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
    // totalHops stays the stage-6 map value (9); the trace-aware final hop
    // for the host-less shape (8) is panel.js's traceFinalHop contract.
    expect(labels.totalHops).toBe(9);
    expect(labels.hopStatus).toBe('Hop 1/8: Browser (10.2) emits "GET example.com/about"');
    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...snap, trace: { ...snap.trace, hop, ...over } }).hopStatus;
    expect(hopLabels(2)).toBe('Hop 2/8: Network (10.x) routes to LoadBalancer (10.1)');
    expect(hopLabels(8)).toBe('Hop 8/8: Worker (10.41) idle — no async jobs in this trace');
  });

  // PINS: negative case — an NX answer ends the trace at hop 2 and the
  // narrative never names a GET anywhere downstream: no hop 3, no served
  // sentence — the browser renders the refusal card instead.
  it('ends the NX narrative at the answer hop with no GET emitted', () => {
    const snap = {
      ...baseSnapshot,
      trace: {
        ...baseSnapshot.trace,
        hop: 2,
        host: 'nope.example',
        dnsTarget: null,
        nx: true,
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.hopStatus).toBe(
      'Hop 2/2: DNS (10.60) -> Browser (10.2): NX no record — no GET emitted',
    );
    const after = describeSnapshot({ ...snap, trace: { ...snap.trace, hop: 3 } });
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
      rightAddress: '20.254',
      routedTotal: 0,
      lastCross: null,
    });
    expect(componentTitle(snap, 'router')).toBe('Router — mini-IP 10.65 ⇄ 20.254');
    const networkState = JSON.parse(formatComponentState(snap, 'network'));
    expect(networkState.interfaces['10.60']).toBe('DNS');
    expect(networkState.interfaces['10.65']).toBe('Router (left)');
    expect(networkState.interfaces['20.254']).toBe('Router (right)');
    expect(networkState.interfaces['20.1']).toBe('CDN edge');
  });

  describe('stage 6b CDN trace sentences', () => {
    const cdnSnapshot = {
      ...baseSnapshot,
      cdn: {
        address: '20.1',
        originAddress: '10.1',
        ttlTicks: 10,
        hits: 0,
        misses: 1,
        fills: 1,
        lastPull: { path: '/about', atTick: 1 },
        ledger: [
          { path: '/about', body: 'This is the about page', expiresAtTick: 11, ttlRemaining: 9 },
        ],
      },
      trace: {
        ...baseSnapshot.trace,
        hop: 8,
        method: 'GET',
        path: '/about',
        host: 'cd.example.com',
        dnsTarget: '20.1',
        cdn: true,
        edgeStatus: 'MISS',
        request: 'GET /about',
        targetServer: '10.11',
        cacheStatus: 'MISS',
      },
    };

    const hopLabels = (over = {}) =>
      describeSnapshot({ ...cdnSnapshot, trace: { ...cdnSnapshot.trace, ...over } }).hopStatus;

    // PINS: the MISS shape — 9 sentences whose prelude names the resolved
    // edge and whose legs name the Router's real crossings.
    it('narrates the 9-hop MISS shape through the Router with the ledger fill', () => {
      expect(hopLabels({ hop: 1 })).toBe(
        'Hop 1/9: Browser (10.2) -> DNS (10.60): who is cd.example.com?',
      );
      expect(hopLabels({ hop: 2 })).toBe('Hop 2/9: DNS (10.60) -> Browser (10.2) answers 20.1');
      expect(hopLabels({ hop: 3 })).toBe(
        'Hop 3/9: Browser (10.2) -> Router (10.65): GET /about to 20.1 (one router hop)',
      );
      expect(hopLabels({ hop: 4 })).toBe(
        'Hop 4/9: CDN edge (20.1): MISS on /about — pulling origin 10.1 via the Router',
      );
      expect(hopLabels({ hop: 5 })).toBe(
        'Hop 5/9: CDN edge (20.1) -> LoadBalancer (10.1): GET /about (edge pull via router)',
      );
      expect(hopLabels({ hop: 6 })).toBe('Hop 6/9: LoadBalancer (10.1) -> 10.11 queue');
      expect(hopLabels({ hop: 7 })).toBe(
        'Hop 7/9: WebServer (10.11) -> Router (10.65): "200 This is the about page" (cache MISS)',
      );
      expect(hopLabels({ hop: 8 })).toBe(
        'Hop 8/9: CDN edge (20.1) filled /about (ttl 9t) and delivered "200 This is the about page" to Browser (10.2)',
      );
      expect(hopLabels({ hop: 9 })).toBe('Hop 9/9: Browser (10.2) received and displayed 200');

      // The edge HUD labels mirror the fill ledger (counters and the row's
      // own TTL, the Map on screen).
      const labels = describeSnapshot(cdnSnapshot);
      expect(labels.cdnStatsLabel).toBe('Hits: 0 · Misses: 1 · Fills: 1 · TTL: 10t');
      expect(labels.cdnEntries).toEqual(cdnSnapshot.cdn.ledger);
    });

    // CHECKS: named counter-example — a HIT never replays the 9-hop shape
    // and never mentions a fill: the ledger bytes arrive via the reverse
    // Router hop and the run ends at 6.
    it('narrates the 6-hop HIT shape from the ledger with no origin traffic', () => {
      const hit = {
        ...cdnSnapshot,
        trace: { ...cdnSnapshot.trace, edgeStatus: 'HIT' },
        cdn: { ...cdnSnapshot.cdn, hits: 1, misses: 1, fills: 1 },
      };
      expect(describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 4 } }).hopStatus).toBe(
        'Hop 4/6: CDN edge (20.1) -> Router (10.65): "200 This is the about page" (edge HIT — ledger bytes, no origin traffic)',
      );
      expect(describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 5 } }).hopStatus).toBe(
        'Hop 5/6: Router (10.65) -> Browser (10.2): "200 This is the about page" delivered (one router hop)',
      );
      expect(describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 6 } }).hopStatus).toBe(
        'Hop 6/6: Browser (10.2) received and displayed 200',
      );
      expect(describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 7 } }).hopStatus).toContain(
        'Idle — type a path',
      );
      // No fill anywhere on the HIT shape.
      const all = [
        describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 1 } }).hopStatus,
        describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 4 } }).hopStatus,
        describeSnapshot({ ...hit, trace: { ...hit.trace, hop: 6 } }).hopStatus,
      ].join(' ');
      expect(all).not.toContain('fill');
      expect(all).not.toContain('Ledger');
    });

    // CHECKS: named counter-example — a non-GET on a CDN name rides the MISS
    // shape minus the fill: its announce names the pass-through and its
    // delivery sentence names why nothing entered the ledger.
    it('narrates a POST pass-through with no ledger write', () => {
      const post = {
        ...cdnSnapshot,
        trace: {
          ...cdnSnapshot.trace,
          hop: 4,
          method: 'POST',
          path: '/note',
          edgeStatus: 'PASS',
          request: 'POST /note',
          response: '200 Updated /note at tick 1',
        },
      };
      expect(describeSnapshot({ ...post, trace: { ...post.trace, hop: 4 } }).hopStatus).toBe(
        'Hop 4/9: CDN edge (20.1): POST /note is not edge-cacheable — pulling origin 10.1',
      );
      expect(describeSnapshot({ ...post, trace: { ...post.trace, hop: 5 } }).hopStatus).toBe(
        'Hop 5/9: CDN edge (20.1) -> LoadBalancer (10.1): POST /note (edge pull via router)',
      );
      expect(describeSnapshot({ ...post, trace: { ...post.trace, hop: 8 } }).hopStatus).toBe(
        'Hop 8/9: CDN edge (20.1) passed "200 Updated /note at tick 1" through to Browser (10.2) — no fill (non-GET)',
      );
      expect(describeSnapshot({ ...post, trace: { ...post.trace, hop: 8 } })).toBeDefined();
    });

    // CHECKS: the edge inspector state is the snapshot's own ledger and
    // counters, and the cdn headline derives from the live snapshot.
    it('exposes the cdn inspector state and headline from the snapshot', () => {
      const state = JSON.parse(formatComponentState(cdnSnapshot, 'cdn'));
      expect(state).toEqual({
        address: '20.1',
        originAddress: '10.1',
        strategy: 'pull-through, GET-only',
        ttlTicks: 10,
        hits: 0,
        misses: 1,
        fills: 1,
        lastPull: { path: '/about', atTick: 1 },
        ledger: cdnSnapshot.cdn.ledger,
      });
      expect(componentTitle(cdnSnapshot, 'cdn')).toBe('CDN Edge — mini-IP 20.1 / origin 10.1');
    });
  });
});
