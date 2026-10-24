import { describe, it, expect } from 'vitest';
import { createDatabase } from '../../js/sim/database.js';
import { createEngine } from '../../js/sim/engine.js';

describe('createDatabase', () => {
  it('replicates primary writes to the read replica after replicationLagTicks and tracks stale reads', () => {
    const db = createDatabase({ replicationLagTicks: 3 });

    // Seeded from the default rows: both maps start at version 1, tick 0.
    const snap0 = db.snapshot(0);
    expect(snap0).toMatchObject({
      primaryAddress: '10.30',
      replicaAddress: '10.31',
      replicationLagTicks: 3,
      reads: 0,
      writes: 0,
      staleReads: 0,
      replicated: 0,
      pendingReplication: 0,
    });
    expect(snap0.rows).toEqual([
      {
        key: '/',
        value: 'Welcome to the home page',
        primaryVersion: 1,
        replicaVersion: 1,
        updatedAtTick: 0,
        lagging: false,
      },
      {
        key: '/about',
        value: 'This is the about page',
        primaryVersion: 1,
        replicaVersion: 1,
        updatedAtTick: 0,
        lagging: false,
      },
    ]);

    // A read is a real Map lookup on the replica's row.
    const fresh = db.read('/about', 1);
    expect(fresh).toEqual({
      found: true,
      value: 'This is the about page',
      version: 1,
      stale: false,
      source: '10.31',
    });
    expect(db.snapshot(1)).toMatchObject({ reads: 1, staleReads: 0 });

    // A write lands on the primary at version 2 and queues replication with
    // applyAtTick = currentTick + replicationLagTicks.
    const written = db.write('/about', 'Updated /about at tick 2', 2);
    expect(written).toEqual({
      key: '/about',
      value: 'Updated /about at tick 2',
      version: 2,
      applyAtTick: 5,
      source: '10.30',
    });
    expect(db.snapshot(2).rows.find((r) => r.key === '/about')).toMatchObject({
      primaryVersion: 2,
      replicaVersion: 1,
      lagging: true,
    });

    // Reads inside the lag window come back stale (and staleReads climbs).
    const stale = db.read('/about', 4);
    expect(stale).toEqual({
      found: true,
      value: 'This is the about page',
      version: 1,
      stale: true,
      source: '10.31',
    });
    expect(db.snapshot(4)).toMatchObject({ reads: 2, staleReads: 1, replicated: 0 });

    // CHECKS: the tick an entry's applyAtTick names is the first tick it
    // applies — stepReplication drains the FIFO queue in order and both
    // queued writes reach the replica at once (both long past due).
    const caughtUp = db.read('/about', 5);
    expect(caughtUp).toEqual({
      found: true,
      value: 'Updated /about at tick 2',
      version: 2,
      stale: false,
      source: '10.31',
    });
    expect(db.snapshot(5)).toMatchObject({
      reads: 3,
      writes: 1,
      staleReads: 1,
      replicated: 1,
      pendingReplication: 0,
    });
    expect(db.snapshot(5).lastOp).toEqual({
      op: 'SELECT',
      target: '10.31',
      key: '/about',
      found: true,
      stale: false,
      atTick: 5,
    });

    // CHECKS: the constructor rejects anything that is not a two-number
    // mini-IP address or a positive-integer lag (fail-loud misconfig).
    expect(() => createDatabase({ primaryAddress: '1030' })).toThrow(/invalid mini-IP/);
    expect(() => createDatabase({ replicaAddress: '10.31x' })).toThrow(/invalid mini-IP/);
    expect(() => createDatabase({ replicationLagTicks: 0 })).toThrow(/replicationLagTicks/);
    expect(() => createDatabase({ replicationLagTicks: 2.5 })).toThrow(/replicationLagTicks/);
  });
});

describe('stage 4 database wiring', () => {
  it('stage 4 engine writes to Primary 10.30, invalidates Cache 10.20, serves stale replica reads during lag, and catches up', () => {
    // arrivalProb 0: the crowd is silent, so every counter below belongs to
    // the trace (and to nothing else).
    const engine = createEngine({ stage: 4, arrivalProb: 0, replicationLagTicks: 3 });
    let snap = engine.snapshot();
    expect(snap.database).not.toBe(null);
    expect(snap.database).toMatchObject({
      primaryAddress: '10.30',
      replicaAddress: '10.31',
      replicationLagTicks: 3,
    });
    expect(snap.cache).not.toBe(null);
    expect(snap.cache.address).toBe('10.20');

    // A 7-hop POST: WRITE through to Primary 10.30, cache invalidated.
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'POST', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.hop).toBe(7);
    expect(snap.trace.targetServer).toBe('10.11');
    expect(snap.trace.cacheStatus).toBe('INVALIDATE');
    expect(snap.trace.dbOp).toBe('WRITE');
    expect(snap.database.writes).toBe(1);
    expect(snap.database.rows.find((r) => r.key === '/about')).toMatchObject({
      primaryVersion: 2,
      replicaVersion: 1,
      lagging: true,
    });
    expect(snap.cache.entries).toEqual([]); // write-through invalidation
    expect(snap.browserDisplay.body).toBe('Updated /about at tick 1');
    expect(snap.lastExchange).toMatchObject({
      dbOp: 'WRITE',
      dbTarget: '10.30',
      dbStale: false,
    });

    // A 7-hop GET inside the lag window (tick 2 < applyAtTick 4): the read
    // replica still serves the old row, and the stale read is NOT cached.
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.hop).toBe(7);
    expect(snap.trace.dbOp).toBe('SELECT');
    expect(snap.trace.dbStale).toBe(true);
    expect(snap.database.reads).toBe(1);
    expect(snap.database.staleReads).toBe(1);
    expect(snap.cache.entries).toEqual([]);
    expect(snap.browserDisplay.body).toBe('This is the about page');

    // Three crowd ticks advance the clock past applyAtTick 4: the queued
    // write reaches the replica, and the next GET read is fresh and warms
    // the cache at last.
    engine.step();
    engine.step();
    engine.step();
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.dbStale).toBe(false);
    expect(snap.database.reads).toBe(2);
    expect(snap.database.staleReads).toBe(1);
    expect(snap.database.replicated).toBe(1);
    expect(snap.browserDisplay.body).toBe('Updated /about at tick 1');
    expect(snap.cache.entries.map((e) => e.key)).toEqual(['/about']);

    // Stages 1–3 expose no database at all.
    expect(createEngine({ stage: 1, arrivalProb: 0 }).snapshot().database).toBe(null);
    expect(createEngine({ stage: 2, arrivalProb: 0 }).snapshot().database).toBe(null);
    expect(createEngine({ stage: 3, arrivalProb: 0 }).snapshot().database).toBe(null);

    // CHECKS: an out-of-range stage fails loud at construction (6 became
    // valid with Stage 6a; 7 is not a shipped stage).
    expect(() => createEngine({ stage: 7 })).toThrow(/stage/);
  });
});
