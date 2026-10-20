import { describe, it, expect } from 'vitest';
import { describeSnapshot, TICK_MS } from '../../js/panel/model.js';
import { formatComponentState } from '../../js/panel/inspector-source.js';

describe('describeSnapshot', () => {
  it('snapshot exposes queue depth and latency as UI state', () => {
    const labels = describeSnapshot({
      tick: 3,
      users: 20,
      queueDepth: 7,
      served: 12,
      avgLatencyTicks: 2.5,
    });
    expect(labels.queueDepth).toBe('7');
    expect(labels.latency).toBe(`${Math.round(2.5 * TICK_MS)} ms`);
    expect(labels.tick).toBe('3');
    expect(labels.users).toBe('20');
    expect(labels.served).toBe('12');
  });

  it('queue bar saturates at the configured depth instead of overflowing', () => {
    const base = { tick: 1, users: 5, served: 0, avgLatencyTicks: 0 };
    expect(describeSnapshot({ ...base, queueDepth: 0 }).queueFill).toBe('0%');
    expect(describeSnapshot({ ...base, queueDepth: 10 }).queueFill).toBe('50%');
    expect(describeSnapshot({ ...base, queueDepth: 20 }).queueFill).toBe('100%');
    expect(describeSnapshot({ ...base, queueDepth: 999 }).queueFill).toBe('100%');
  });

  it('an idle snapshot reads zero latency, not a fabricated number', () => {
    const labels = describeSnapshot({
      tick: 0,
      users: 5,
      queueDepth: 0,
      served: 0,
      avgLatencyTicks: 0,
    });
    expect(labels.latency).toBe('0 ms');
  });

  it('formats the latest HTTP exchange across mini-IPs for the inspector', () => {
    const labels = describeSnapshot({
      tick: 4,
      users: 5,
      queueDepth: 0,
      served: 1,
      avgLatencyTicks: 1,
      serverAddress: '10.1',
      lastExchange: {
        id: '4:1',
        from: '10.2',
        to: '10.1',
        request: 'GET /about',
        response: '200 This is the about page',
        status: 200,
        body: 'This is the about page',
        latencyTicks: 1,
      },
    });
    expect(labels.serverAddress).toBe('10.1');
    expect(labels.exchangeSummary).toBe('10.2 -> 10.1 GET /about => 200 This is the about page');

    const idle = describeSnapshot({
      tick: 0,
      users: 5,
      queueDepth: 0,
      served: 0,
      avgLatencyTicks: 0,
    });
    expect(idle.exchangeSummary).toBe('No requests served yet');
  });

  it('describes hop-by-hop trace labels and component inspector state', () => {
    const labels = describeSnapshot({
      tick: 2,
      users: 5,
      queueDepth: 1,
      served: 0,
      avgLatencyTicks: 0,
      serverAddress: '10.1',
      lastFrame: 'routed 10.2 -> 10.1 (GET /about) into queue',
      lastMatchedRoute: 'route-about',
      browserDisplay: {
        from: '10.2',
        to: '10.1',
        request: 'GET /about',
        response: '200 This is the about page',
        status: 200,
        body: 'This is the about page',
      },
      trace: {
        hop: 2,
        method: 'GET',
        path: '/about',
        request: 'GET /about',
        response: null,
        status: null,
        body: null,
        routeId: null,
      },
      queue: [{ id: 'you:2', from: '10.2', to: '10.1', request: 'GET /about', isYou: true }],
    });
    expect(labels.hop).toBe(2);
    expect(labels.hopStatus).toBe('Hop 2/4: Network (10.x) routes to 10.1 queue');
    expect(labels.browserStatus).toBe('200 (GET /about)');
    expect(labels.browserBody).toBe('This is the about page');
    expect(labels.networkLastFrame).toBe('routed 10.2 -> 10.1 (GET /about) into queue');
    expect(labels.matchedRouteId).toBe('route-about');

    const idle = describeSnapshot({
      tick: 0,
      users: 5,
      queueDepth: 0,
      served: 0,
      avgLatencyTicks: 0,
    });
    expect(idle.hop).toBe(0);
    expect(idle.hopStatus).toBe('Idle — type a path and click Go or Step 1 Hop ->');
    expect(idle.browserStatus).toBe('No response yet');
    expect(idle.browserBody).toBe('Send a request or step a hop to render a response.');
    expect(idle.networkLastFrame).toBe('No frames routed yet');
    expect(idle.matchedRouteId).toBe(null);
  });

  it('maps a live snapshot to the webserver inspector state as JSON', () => {
    expect(() => formatComponentState({ unknown: true }, 'nope')).toThrow(/unknown component/);
    const state = JSON.parse(
      formatComponentState(
        {
          serverAddress: '10.1',
          queueDepth: 1,
          served: 1,
          lastMatchedRoute: 'route-about',
          users: 5,
          queue: [{ id: 'you:2', from: '10.2', to: '10.1', request: 'GET /about', isYou: true }],
        },
        'webserver',
      ),
    );
    expect(state).toEqual({
      address: '10.1',
      serviceRatePerTick: 4,
      queueDepth: 1,
      queuedRequests: ['10.2 -> GET /about'],
      servedTotal: 1,
      lastMatchedRoute: 'route-about',
    });
  });

  it('describes Stage 2 5-hop load-balancer trace labels and loadbalancer inspector state', () => {
    const snap = {
      stage: 2,
      tick: 3,
      users: 5,
      serverAddress: '10.1',
      queueDepth: 1,
      served: 1,
      avgLatencyTicks: 1,
      loadBalancer: {
        address: '10.1',
        algorithm: 'round-robin',
        backends: ['10.11', '10.12'],
        nextBackend: '10.12',
        forwarded: 1,
        lastTarget: '10.11',
        perBackend: { 10.11: 1, 10.12: 0 },
      },
      servers: [
        { address: '10.11', queueDepth: 1, served: 1, queue: [] },
        { address: '10.12', queueDepth: 0, served: 0, queue: [] },
      ],
      trace: {
        hop: 3,
        method: 'GET',
        path: '/about',
        request: 'GET /about',
        targetServer: '10.11',
        response: null,
        status: null,
        body: null,
        routeId: null,
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.stage).toBe(2);
    expect(labels.totalHops).toBe(5);
    expect(labels.hopStatus).toBe('Hop 3/5: LoadBalancer (10.1) -> 10.11 queue');
    expect(labels.lbNextBackend).toBe('Next -> 10.12');
    expect(labels.lbBackend1Label).toBe('10.11 WebServer-1 (1)');
    expect(labels.lbBackend2Label).toBe('10.12 WebServer-2 (0)');

    const lbState = JSON.parse(formatComponentState(snap, 'loadbalancer'));
    expect(lbState).toEqual({
      address: '10.1',
      algorithm: 'round-robin',
      backends: ['10.11', '10.12'],
      nextBackend: '10.12',
      forwardedTotal: 1,
      lastTarget: '10.11',
      perBackend: { 10.11: 1, 10.12: 0 },
    });
  });

  it('describes Stage 3 6-hop cache-aside trace labels and cache inspector state', () => {
    const cache = {
      address: '10.20',
      ttlTicks: 10,
      hits: 1,
      misses: 1,
      sets: 1,
      evictions: 0,
      lastLookup: { key: '/about', status: 'HIT', atTick: 2 },
      entries: [
        {
          key: '/about',
          value: 'This is the about page',
          cachedAtTick: 1,
          expiresAtTick: 11,
          ttlRemaining: 9,
        },
      ],
    };
    const snap = {
      stage: 3,
      tick: 2,
      users: 5,
      serverAddress: '10.1',
      queueDepth: 0,
      served: 2,
      avgLatencyTicks: 1,
      cache,
      loadBalancer: {
        address: '10.1',
        algorithm: 'round-robin',
        backends: ['10.11', '10.12'],
        nextBackend: '10.11',
        forwarded: 2,
        lastTarget: '10.12',
        perBackend: { 10.11: 1, 10.12: 1 },
      },
      servers: [
        { address: '10.11', queueDepth: 0, served: 1, queue: [] },
        { address: '10.12', queueDepth: 0, served: 1, queue: [] },
      ],
      trace: {
        hop: 5,
        method: 'GET',
        path: '/about',
        request: 'GET /about',
        targetServer: '10.12',
        cacheStatus: 'HIT',
        response: '200 This is the about page',
        status: 200,
        body: 'This is the about page',
        routeId: 'route-about',
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.stage).toBe(3);
    expect(labels.totalHops).toBe(6);
    expect(labels.hop).toBe(5);
    expect(labels.hopStatus).toBe(
      'Hop 5/6: WebServer (10.12) -> "200 This is the about page" (cache HIT)',
    );
    expect(labels.cacheStatsLabel).toBe('Hits: 1 · Misses: 1 · TTL: 10t');
    expect(labels.cacheEntries).toEqual(cache.entries);

    // The other six hops read as their own sentence, miss included.
    const missLabels = (hop, over) =>
      describeSnapshot({
        ...snap,
        trace: { ...snap.trace, hop, cacheStatus: over ? undefined : 'MISS', response: null },
      }).hopStatus;
    expect(missLabels(1)).toBe('Hop 1/6: Browser (10.2) emits "GET /about"');
    expect(missLabels(2)).toBe('Hop 2/6: Network (10.x) routes to LoadBalancer (10.1)');
    expect(missLabels(3)).toBe('Hop 3/6: LoadBalancer (10.1) -> 10.12 queue');
    expect(missLabels(4)).toBe('Hop 4/6: WebServer (10.12) checks Cache (10.20) — MISS');
    expect(missLabels(6)).toBe('Hop 6/6: Browser (10.2) rendered 200');
    expect(missLabels(7)).toBe('Idle — type a path and click Go or Step 1 Hop ->');

    // The cache inspector shows the live Map and counters; the network
    // interface table names Cache 10.20 in Stage 3.
    const cacheState = JSON.parse(formatComponentState(snap, 'cache'));
    expect(cacheState).toEqual({
      address: '10.20',
      strategy: 'cache-aside',
      ttlTicks: 10,
      hits: 1,
      misses: 1,
      sets: 1,
      evictions: 0,
      lastLookup: { key: '/about', status: 'HIT', atTick: 2 },
      entries: cache.entries,
    });
    const networkState = JSON.parse(formatComponentState(snap, 'network'));
    expect(networkState.interfaces['10.20']).toBe('Cache');
  });
});
