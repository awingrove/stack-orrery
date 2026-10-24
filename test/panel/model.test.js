import { describe, it, expect } from 'vitest';
import { describeSnapshot, orderJourneyEntries, TICK_MS } from '../../js/panel/model.js';
import { componentTitle, formatComponentState } from '../../js/panel/inspector-state.js';

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

  // PINS: the inspector headline derives from the live snapshot, and the
  // named counter-example — stage 1 keeps "WebServer — mini-IP 10.1" while
  // the state side shows "address": "10.1" — is pinned explicitly: the
  // headline must not read the static "10.11 / 10.12" entry.
  it('stage 1 webserver headline derives mini-IP 10.1 from the live snapshot, not from the static 10.11 / 10.12 entry', () => {
    const snapshot = {
      stage: 1,
      serverAddress: '10.1',
      servers: [{ address: '10.1', queueDepth: 0, served: 0, queue: [] }],
    };
    // The state side shows one 10.1 address; the headline must agree with it.
    const state = JSON.parse(formatComponentState(snapshot, 'webserver'));
    expect(state.address).toBe('10.1');

    const headline = componentTitle(snapshot, 'webserver');
    expect(headline).toBe('WebServer — mini-IP 10.1');
    expect(headline).not.toContain('10.11 / 10.12');
  });

  it('stages 2-5 webserver headline derives the snapshot backends as mini-IP 10.11 / 10.12', () => {
    const snapshot = {
      stage: 2,
      serverAddress: '10.1',
      servers: [
        { address: '10.11', queueDepth: 0, served: 0, queue: [] },
        { address: '10.12', queueDepth: 0, served: 0, queue: [] },
      ],
    };
    expect(componentTitle(snapshot, 'webserver')).toBe('WebServer — mini-IP 10.11 / 10.12');
  });

  it('derives every inspector tab title from the snapshot instead of static per-stage pins', () => {
    const snapshot = {
      stage: 5,
      serverAddress: '10.1',
      loadBalancer: { address: '10.1' },
      cache: { address: '10.20' },
      database: { primaryAddress: '10.30', replicaAddress: '10.31' },
      workerQueue: { address: '10.40', workerAddress: '10.41' },
    };
    expect(componentTitle(snapshot, 'browser')).toBe('Browser (You) — mini-IP 10.2');
    // A compact Ring 3 browser keeps its own address in the headline.
    expect(componentTitle(snapshot, 'browser', '10.3')).toBe('Browser-2 — mini-IP 10.3');
    expect(componentTitle(snapshot, 'network')).toBe('Network — routing fabric');
    expect(componentTitle(snapshot, 'loadbalancer')).toBe('LoadBalancer — mini-IP 10.1');
    expect(componentTitle(snapshot, 'cache')).toBe('Cache — mini-IP 10.20');
    expect(componentTitle(snapshot, 'database')).toBe('Database — Primary 10.30 / Replica 10.31');
    expect(componentTitle(snapshot, 'workerqueue')).toBe(
      'Worker Queue — Queue 10.40 / Worker 10.41',
    );
    expect(() => componentTitle(snapshot, 'nope')).toThrow(/unknown component/);
  });

  it('journey entries order by run key then ascending hop, keeping labels whole', () => {
    // Emission order scrambled within one run: the label strings ride along
    // untouched; only the sort key (run, hop) drives the position.
    const entry = (run, hop, label) => ({ run, hop, label, text: `${label} frame` });
    const ordered = [
      [4, 3, 'hop 3/4'],
      [4, 1, 'hop 1/4'],
      [4, 4, 'hop 4/4'],
      [4, 2, 'hop 2/4'],
    ].reduce((acc, [run, hop, label]) => orderJourneyEntries(acc, entry(run, hop, label)), []);
    expect(ordered.map((e) => e.label)).toEqual(['hop 1/4', 'hop 2/4', 'hop 3/4', 'hop 4/4']);
  });
});
