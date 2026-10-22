import { describe, it, expect } from 'vitest';
import { describeSnapshot } from '../../js/panel/model.js';
import { formatComponentState } from '../../js/panel/inspector-state.js';

// Stage-boundary extraction from model.test.js (guard-file-size): the
// Stage 5 async-trace labels and the workerqueue inspector state are
// pinned here so model.test.js stays inside the 450-line test cap.
describe('describeSnapshot', () => {
  it('describes Stage 5 8-hop async queue trace labels and workerqueue inspector state', () => {
    const snap = {
      stage: 5,
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
        lastTarget: '10.11',
        perBackend: { 10.11: 1, 10.12: 1 },
      },
      cache: {
        address: '10.20',
        ttlTicks: 10,
        hits: 0,
        misses: 0,
        sets: 0,
        evictions: 0,
        lastLookup: null,
        entries: [],
      },
      database: {
        primaryAddress: '10.30',
        replicaAddress: '10.31',
        replicationLagTicks: 3,
        reads: 0,
        writes: 0,
        staleReads: 0,
        replicated: 0,
        lastOp: null,
        pendingReplication: 0,
        rows: [],
      },
      workerQueue: {
        address: '10.40',
        workerAddress: '10.41',
        jobDurationTicks: 2,
        enqueued: 1,
        completed: 0,
        activeJob: {
          jobId: 1,
          path: '/jobs',
          payload: 'Payload for /jobs at tick 1',
          status: 'active',
          queuedAtTick: 1,
          startedAtTick: 2,
          finishesAtTick: 4,
        },
        pendingJobs: [],
        lastJobResult: null,
      },
      servers: [
        { address: '10.11', queueDepth: 0, served: 1, queue: [] },
        { address: '10.12', queueDepth: 0, served: 1, queue: [] },
      ],
      trace: {
        hop: 4,
        method: 'POST',
        path: '/jobs',
        request: 'POST /jobs',
        targetServer: '10.11',
        asyncJob: true,
        cacheStatus: 'ASYNC',
        dbOp: null,
        dbStale: false,
        response: '202 {"jobId": 1, "status": "queued"}',
        status: 202,
        body: '{"jobId": 1, "status": "queued"}',
        routeId: 'jobs',
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.stage).toBe(5);
    expect(labels.totalHops).toBe(8);
    expect(labels.hop).toBe(4);
    expect(labels.hopStatus).toBe('Hop 4/8: WebServer (10.11) enqueues job to WorkerQueue (10.40)');
    // The queue/worker HUD labels mirror the workerQueue counters and the
    // active job; the pending-jobs list comes straight off the snapshot.
    expect(labels.queueStatsLabel).toBe('Enqueued: 1 · Completed: 0 · Active: #1 /jobs');
    expect(labels.workerStatsLabel).toBe('Worker 10.41 processing #1 (/jobs)');
    expect(describeSnapshot(snap).queueJobs).toEqual(snap.workerQueue.pendingJobs);

    // The other seven hops read as their own sentences.
    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...snap, trace: { ...snap.trace, hop, ...over } }).hopStatus;
    expect(hopLabels(1)).toBe('Hop 1/8: Browser (10.2) emits "POST /jobs"');
    expect(hopLabels(2)).toBe('Hop 2/8: Network (10.x) routes to LoadBalancer (10.1)');
    expect(hopLabels(3)).toBe('Hop 3/8: LoadBalancer (10.1) -> 10.11 queue');
    expect(hopLabels(5)).toBe('Hop 5/8: WebServer (10.11) -> "202 Accepted"');
    expect(hopLabels(6)).toBe('Hop 6/8: Network delivers 202 response to 10.2');
    expect(hopLabels(7)).toBe('Hop 7/8: Browser (10.2) received and displayed 202 Accepted');
    expect(hopLabels(8)).toBe(
      'Hop 8/8: Worker (10.41) processed job and committed to Database (10.30)',
    );
    expect(hopLabels(9)).toBe('Idle — type a path and click Go or Step 1 Hop ->');

    // A drained queue flips the worker HUD back to Idle with no active job.
    expect(
      describeSnapshot({ ...snap, workerQueue: { ...snap.workerQueue, activeJob: null } })
        .workerStatsLabel,
    ).toBe('Worker 10.41 Idle');

    // The workerqueue inspector carries the counters, the active job, and
    // the pending FIFO; the network table names both 10.40 and 10.41.
    const queueState = JSON.parse(formatComponentState(snap, 'workerqueue'));
    expect(queueState).toEqual({
      address: '10.40',
      workerAddress: '10.41',
      jobDurationTicks: 2,
      enqueued: 1,
      completed: 0,
      activeJob: snap.workerQueue.activeJob,
      pendingJobs: [],
      lastJobResult: null,
    });
    const networkState = JSON.parse(formatComponentState(snap, 'network'));
    expect(networkState.interfaces['10.40']).toBe('WorkerQueue');
    expect(networkState.interfaces['10.41']).toBe('Worker');
  });

  it('describes a Stage 5 sync GET trace with the Stage 4 cache/db story and an idle worker', () => {
    const snap = {
      stage: 5,
      tick: 1,
      users: 5,
      serverAddress: '10.1',
      queueDepth: 0,
      served: 1,
      avgLatencyTicks: 1,
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
        hop: 4,
        method: 'GET',
        path: '/about',
        request: 'GET /about',
        targetServer: '10.11',
        asyncJob: false,
        cacheStatus: 'MISS',
        dbOp: 'SELECT',
        dbStale: true,
        response: '200 This is the about page',
        status: 200,
        body: 'This is the about page',
        routeId: 'about',
      },
    };
    const labels = describeSnapshot(snap);
    expect(labels.hopStatus).toBe('Hop 4/8: Database SELECT @ Replica (10.31) — STALE (lag 3t)');

    const hopLabels = (hop, over = {}) =>
      describeSnapshot({ ...snap, trace: { ...snap.trace, hop, ...over } }).hopStatus;
    expect(hopLabels(5)).toBe(
      'Hop 5/8: WebServer (10.11) -> "200 This is the about page" (cache MISS)',
    );
    expect(hopLabels(6)).toBe('Hop 6/8: Network delivers 200 response to 10.2');
    expect(hopLabels(7)).toBe('Hop 7/8: Browser (10.2) received and displayed 200');
    expect(hopLabels(8)).toBe('Hop 8/8: Worker (10.41) idle — no async jobs in this trace');

    // The other Stage 4 database narratives carry over at their new hop.
    expect(
      describeSnapshot({ ...snap, trace: { ...snap.trace, dbOp: 'WRITE', dbStale: false } })
        .hopStatus,
    ).toBe('Hop 4/8: Database WRITE @ Primary (10.30) — replica lags 3t');
    expect(
      describeSnapshot({ ...snap, trace: { ...snap.trace, dbOp: 'SELECT', dbStale: false } })
        .hopStatus,
    ).toBe('Hop 4/8: Database SELECT @ Replica (10.31) — fresh');
    expect(
      describeSnapshot({ ...snap, trace: { ...snap.trace, dbOp: null, cacheStatus: 'HIT' } })
        .hopStatus,
    ).toBe('Hop 4/8: Database SKIP — warm cache HIT (10.20)');
  });
});
