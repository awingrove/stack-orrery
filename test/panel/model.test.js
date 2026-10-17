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
});
