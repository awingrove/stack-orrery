import { describe, it, expect } from 'vitest';
import { describeSnapshot } from '../../js/panel/model.js';
import { formatComponentState } from '../../js/panel/inspector-state.js';

// DOCUMENTS: Stage 3 and Stage 4 snapshot labels and inspector state, split
// from model.test.js by responsibility (guard-file-size); Stage 5 lives in
// model-stage5.test.js.
describe('describeSnapshot — Stage 3/4 traces', () => {
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

  it('describes Stage 4 7-hop database trace labels and database inspector state', () => {
    const snap = {
      stage: 4,
      tick: 2,
      users: 5,
      serverAddress: '10.1',
      queueDepth: 0,
      served: 2,
      avgLatencyTicks: 1,
      loadBalancer: {
        address: '10.1',
        algorithm: 'round-robin',
        backends: ['10.11', '10.12'],
        nextBackend: '10.11',
        forwarded: 2,
        lastTarget: '10.12',
        perBackend: { 10.11: 1, 10.12: 1 },
      },
      cache: {
        address: '10.20',
        ttlTicks: 10,
        hits: 0,
        misses: 1,
        sets: 0,
        evictions: 0,
        lastLookup: { key: '/about', status: 'MISS', atTick: 2 },
        entries: [],
      },
      database: {
        primaryAddress: '10.30',
        replicaAddress: '10.31',
        replicationLagTicks: 3,
        reads: 1,
        writes: 1,
        staleReads: 1,
        replicated: 0,
        lastOp: {
          op: 'SELECT',
          target: '10.31',
          key: '/about',
          found: true,
          stale: true,
          atTick: 2,
        },
        pendingReplication: 1,
        rows: [
          {
            key: '/about',
            value: 'Updated /about at tick 1',
            primaryVersion: 2,
            replicaVersion: 1,
            updatedAtTick: 1,
            lagging: true,
          },
        ],
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
        cacheStatus: 'MISS',
        dbOp: 'SELECT',
        dbStale: true,
        response: null,
        status: null,
        body: null,
        routeId: null,
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.stage).toBe(4);
    expect(labels.totalHops).toBe(7);
    expect(labels.hop).toBe(5);
    expect(labels.hopStatus).toBe('Hop 5/7: Database SELECT @ Replica (10.31) — STALE (lag 3t)');
    expect(labels.dbStatsLabel).toBe('Reads: 1 · Writes: 1 · Lag: 3t');
    expect(labels.dbRows).toEqual(snap.database.rows);

    // The other six hops read as their own sentences.
    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...snap, trace: { ...snap.trace, hop, ...over } }).hopStatus;
    expect(hopLabels(1)).toBe('Hop 1/7: Browser (10.2) emits "GET /about"');
    expect(hopLabels(2)).toBe('Hop 2/7: Network (10.x) routes to LoadBalancer (10.1)');
    expect(hopLabels(3)).toBe('Hop 3/7: LoadBalancer (10.1) -> 10.12 queue');
    expect(hopLabels(4)).toBe('Hop 4/7: WebServer (10.12) checks Cache (10.20) — MISS');
    expect(hopLabels(6, { response: '200 This is the about page', status: 200 })).toBe(
      'Hop 6/7: WebServer (10.12) -> "200 This is the about page" (cache MISS)',
    );
    expect(hopLabels(7, { response: '200 This is the about page', status: 200 })).toBe(
      'Hop 7/7: Browser (10.2) rendered 200',
    );
    expect(hopLabels(8)).toBe('Idle — type a path and click Go or Step 1 Hop ->');

    // WRITE and the warm-HIT skip read as their own sentences.
    expect(describeSnapshot({ ...snap, trace: { ...snap.trace, dbOp: 'WRITE' } }).hopStatus).toBe(
      'Hop 5/7: Database WRITE @ Primary (10.30) — replica lags 3t',
    );
    expect(
      describeSnapshot({
        ...snap,
        trace: { ...snap.trace, dbOp: null, cacheStatus: 'HIT', dbStale: false },
      }).hopStatus,
    ).toBe('Hop 5/7: Database SKIP — warm cache HIT (10.20)');

    // The database inspector carries the counters, the pending queue length,
    // and the live rows; the network table names both database interfaces.
    const dbState = JSON.parse(formatComponentState(snap, 'database'));
    expect(dbState).toEqual({
      primaryAddress: '10.30',
      replicaAddress: '10.31',
      replicationLagTicks: 3,
      reads: 1,
      writes: 1,
      staleReads: 1,
      replicated: 0,
      lastOp: snap.database.lastOp,
      pendingReplication: 1,
      rows: snap.database.rows,
    });
    const networkState = JSON.parse(formatComponentState(snap, 'network'));
    expect(networkState.interfaces['10.30']).toBe('Database (Primary)');
    expect(networkState.interfaces['10.31']).toBe('Database (Replica)');
  });
});
