import { describe, it, expect } from 'vitest';
import { createDatabase } from '../../js/sim/database.js';
import { createEngine } from '../../js/sim/engine.js';

// B-6d primary down (docs/plans/2026-10-30-b6d-primary-down.md): the fault
// is real component state — the Database's own setPrimaryDown flag the
// WebServer's write branch consults before every write. While down, a POST
// answers a real 503 (nothing written, nothing invalidated), GETs keep the
// replica-SELECT story, and async /jobs still 202s. Titles are manifest
// refs (SIM slice tests) — do not reword.

describe('database primary down (B-6d)', () => {
  it('setPrimaryDown validates a boolean ON/OFF flag and isPrimaryDown reads it back (fail loud)', () => {
    const db = createDatabase({});
    expect(db.isPrimaryDown()).toBe(false);
    db.setPrimaryDown(true);
    expect(db.isPrimaryDown()).toBe(true);
    db.setPrimaryDown(false);
    expect(db.isPrimaryDown()).toBe(false);
    // Any non-boolean input throws with the flag's own message instead of
    // silently leaving the database in an unspecified consult state.
    expect(() => db.setPrimaryDown('yes')).toThrow(/primaryDown must be a boolean, got yes/);
    expect(() => db.setPrimaryDown(1)).toThrow(/primaryDown must be a boolean, got 1/);
    expect(() => db.setPrimaryDown(null)).toThrow(/primaryDown must be a boolean, got null/);
    // A rejected input changes nothing.
    expect(db.isPrimaryDown()).toBe(false);
  });

  // CHECKS: B-6d core contract — while down, write() does nothing to state:
  // no primary row, no version bump, no replication-queue push, no writes
  // counter, and no stepReplication drain. Only lastOp records the refusal
  // (op 'WRITE_DOWN' with its key and tick) and the failedWrites tally
  // moves; read() and stepReplication() do not consult the flag, so an
  // in-flight replication still applies on its own tick schedule.
  it('a downed write leaves the store untouched — reads and in-flight replication stay green', () => {
    const db = createDatabase({ replicationLagTicks: 3 });
    // A real in-flight write: version 2 queued for the replica at tick 5.
    db.write('/about', 'Updated /about at tick 2', 2);
    const before = db.snapshot(3); // inside the lag window: entry still queued
    expect(before).toMatchObject({
      reads: 0,
      writes: 1,
      failedWrites: 0,
      pendingReplication: 1,
      primaryDown: false,
    });
    db.setPrimaryDown(true);
    const refused = db.write('/about', 'Updated /about at tick 3', 3);
    expect(refused).toEqual({ refused: true, key: '/about', source: '10.30' });
    const after = db.snapshot(3);
    // Every projection but the refusal record compares byte-for-byte
    // against the pre-refusal snapshot — the write consumed nothing.
    expect(after.rows).toEqual(before.rows);
    expect([
      after.reads,
      after.writes,
      after.staleReads,
      after.replicated,
      after.pendingReplication,
    ]).toEqual([
      before.reads,
      before.writes,
      before.staleReads,
      before.replicated,
      before.pendingReplication,
    ]);
    expect(after).toMatchObject({ primaryDown: true, failedWrites: 1 });
    expect(after.lastOp).toEqual({
      op: 'WRITE_DOWN',
      target: '10.30',
      key: '/about',
      atTick: 3,
    });
    // Reads keep serving the replica: stale inside the lag window, exactly
    // as an unfaulted read of the same rows would report it.
    expect(db.read('/about', 3)).toEqual({
      found: true,
      value: 'This is the about page',
      version: 1,
      stale: true,
      source: '10.31',
    });
    // The in-flight write still replicates on schedule at tick 5.
    const caughtUp = db.snapshot(5);
    expect(caughtUp.rows.find((r) => r.key === '/about')).toMatchObject({
      primaryVersion: 2,
      replicaVersion: 2,
      lagging: false,
    });
    expect(caughtUp).toMatchObject({ replicated: 1, pendingReplication: 0 });
  });

  it('engine setDatabasePrimaryDown is fail-loud below stage 4 — no database exists there', () => {
    const stage3 = createEngine({ stage: 3, arrivalProb: 0 });
    expect(() => stage3.setDatabasePrimaryDown(true)).toThrow(/stage 3 has no Database/);
    // Flipping false on a stage that has no database fails loud too.
    const stage1 = createEngine({ stage: 1, arrivalProb: 0 });
    expect(() => stage1.setDatabasePrimaryDown(false)).toThrow(/stage 1 has no Database/);
  });

  // CHECKS: the consult rides the real stage-4 chain — a POST with the
  // primary down answers the real 503, keeps the cache's pre-fault copy
  // live (a failed write invalidates nothing), and leaves the primary row
  // at its pre-fault version with the writes counter unmoved. The next GET
  // still HITs the cached copy the failed write left behind.
  it('a primary-down POST answers a real 503 — the cache keeps serving the pre-fault body and the primary version holds', () => {
    const engine = createEngine({ stage: 4, arrivalProb: 0 });
    // Warm the cache with a real GET trace so a pre-fault body is live.
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    expect(engine.snapshot().cache.entries.map((e) => e.key)).toEqual(['/about']);
    engine.setDatabasePrimaryDown(true);
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'POST', path: '/about' });
    let snap = engine.snapshot();
    expect(snap.trace).toMatchObject({ status: 503, dbOp: 'WRITE_DOWN', hop: 7 });
    expect(snap.lastExchange).toMatchObject({
      status: 503,
      response: '503 Write unavailable (primary down)',
      body: 'Write unavailable (primary down)',
      cacheStatus: null,
      dbOp: 'WRITE_DOWN',
      dbTarget: '10.30',
    });
    // The failed write invalidated nothing and wrote nothing.
    expect(snap.cache.entries.map((e) => e.key)).toEqual(['/about']);
    expect(snap.database.rows.find((r) => r.key === '/about')).toMatchObject({
      primaryVersion: 1,
      lagging: false,
    });
    expect(snap.database.writes).toBe(0);
    expect(snap.failedWrites).toBe(1);
    // The follow-up GET still HITs the cached pre-fault copy.
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    snap = engine.snapshot();
    expect(snap.trace.cacheStatus).toBe('HIT');
    expect(snap.cache.hits).toBe(1);
    expect(snap.lastExchange.body).toBe('This is the about page');
  });

  // CHECKS: failedWrites is the pool-summed refusal tally (each webserver
  // counts its own share; the database's own tally does not move on the
  // consult-side refusal because write() is never called), so a refusal on
  // the second backend counts too — no server's share is privileged.
  it('failedWrites tallies pool-summed across the server pool', () => {
    const engine = createEngine({ stage: 4, arrivalProb: 0 });
    engine.setDatabasePrimaryDown(true);
    // Round-robin: the first POST lands on 10.11, the second on 10.12.
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'POST', path: '/about' });
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'POST', path: '/' });
    const snap = engine.snapshot();
    expect(snap.servers.map((s) => s.address)).toEqual(['10.11', '10.12']);
    expect(snap.servers.map((s) => s.down)).toEqual([false, false]);
    expect(snap.failedWrites).toBe(2);
    expect(snap.database.failedWrites).toBe(0);
    expect(snap.primaryDown).toBe(true);
  });

  // CHECKS: restore puts writes back — the first write after setPrimaryDown
  // (false) is a real 200 WRITE whose version continues from the pre-fault
  // history (the refused attempt bumped nothing), the replication queue
  // takes the entry, and the refusal tally survives the restore.
  it('restore puts writes back — the next write is a real 200 WRITE with the version continuing from history', () => {
    const engine = createEngine({ stage: 4, arrivalProb: 0 });
    engine.setDatabasePrimaryDown(true);
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'POST', path: '/about' });
    expect(engine.snapshot().lastExchange.status).toBe(503);
    engine.setDatabasePrimaryDown(false);
    expect(engine.snapshot().primaryDown).toBe(false);
    for (let hop = 0; hop < 7; hop++) engine.traceHop({ method: 'POST', path: '/about' });
    const snap = engine.snapshot();
    expect(snap.lastExchange).toMatchObject({
      status: 200,
      dbOp: 'WRITE',
      dbTarget: '10.30',
      cacheStatus: 'INVALIDATE',
    });
    expect(snap.database.writes).toBe(1);
    expect(snap.database.rows.find((r) => r.key === '/about')).toMatchObject({
      primaryVersion: 2,
    });
    expect(snap.database.pendingReplication).toBe(1);
    expect(snap.failedWrites).toBe(1);
  });

  // CHECKS: DL-3 named counter-example (1) — a primary-down write keeps the
  // full served-story arc: a real 503 rides the normal hops to the browser
  // (the browser renders it via receiveResponse's status parse), the trace
  // walks to its final hop, and the transport refusal counter does not
  // move — no refusal card, no receiveRefusal, no aborted hop.
  it('DL-3 counter-example — the failed write keeps the full served-story arc: a real 503 rides the normal hops, no refusal', () => {
    const engine = createEngine({ stage: 4, arrivalProb: 0 });
    engine.setDatabasePrimaryDown(true);
    const frames = [];
    for (let hop = 0; hop < 7; hop++) {
      frames.push(engine.traceHop({ method: 'POST', path: '/about' }).lastFrame);
    }
    const snap = engine.snapshot();
    expect(snap.trace.refused).toBe(false);
    expect(snap.trace.hop).toBe(7);
    expect(snap.trace.status).toBe(503);
    expect(snap.refusedCount).toBe(0);
    expect(snap.browserDisplay.body).toBe('Write unavailable (primary down)');
    expect(frames).toEqual([
      '10.2 -> 10.1 | POST /about',
      'routed 10.2 -> 10.1 (POST /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (POST /about) queued',
      '10.11 -> 10.20 | cache null (/about)', // cacheStatus null — the refused record consulted nothing
      'Database WRITE FAILED (/about) @ 10.30 — primary down, nothing written',
      '10.11 -> 10.2 | 503 Write unavailable (primary down) (cache null)',
      // The final hop (browser render) mints no frame — the engine keeps
      // the delivery frame, as in every unfaulted stage-4 story.
      '10.11 -> 10.2 | 503 Write unavailable (primary down) (cache null)',
    ]);
  });

  // CHECKS: DL-3 named counter-example (2) — a GET trace with the primary
  // down is byte-identical to the off-fault SELECT story, frame by frame:
  // the read path does not consult the flag, so the replica serves the same
  // fresh row through the same hops.
  it('DL-3 counter-example — same-fault GET frames stay byte-identical to the off-fault SELECT story', () => {
    const runFrames = (primaryDown) => {
      const engine = createEngine({ stage: 4, arrivalProb: 0 });
      if (primaryDown) engine.setDatabasePrimaryDown(true);
      const frames = [];
      for (let hop = 0; hop < 7; hop++) {
        frames.push(engine.traceHop({ method: 'GET', path: '/about' }).lastFrame);
      }
      return { frames, snap: engine.snapshot() };
    };
    const off = runFrames(false);
    const on = runFrames(true);
    expect(on.frames).toEqual(off.frames);
    expect(off.frames).toEqual([
      '10.2 -> 10.1 | GET /about',
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      '10.11 -> 10.20 | cache MISS (/about)',
      'Database SELECT /about @ 10.31 (fresh)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
    ]);
    expect(on.snap.lastExchange).toMatchObject({
      status: 200,
      dbOp: 'SELECT',
      dbTarget: '10.31',
    });
    expect(on.snap.database.reads).toBe(1);
  });

  // CHECKS: DL-3 named counter-example (3) — the async /jobs story is
  // immune: with the primary down the 202 frames run byte-identical to the
  // off-fault story (the write consult lives after the workerQueue
  // branch), the trace takes the 202, and the pool's refusal tally stays
  // at zero.
  it('DL-3 counter-example — the async /jobs story stays a byte-identical 202 with the primary down (stage 5)', () => {
    const runJobs = (primaryDown) => {
      const engine = createEngine({ stage: 5, arrivalProb: 0 });
      if (primaryDown) engine.setDatabasePrimaryDown(true);
      const frames = [];
      for (let hop = 0; hop < 8; hop++) {
        frames.push(engine.traceHop({ method: 'POST', path: '/jobs' }).lastFrame);
      }
      return { frames, snap: engine.snapshot() };
    };
    const off = runJobs(false);
    const on = runJobs(true);
    expect(on.frames).toEqual(off.frames);
    expect(on.snap.trace).toMatchObject({ status: 202, asyncJob: true });
    expect(on.snap.workerQueue.enqueued).toBe(1);
    expect(on.snap.failedWrites).toBe(0);
  });

  it('same seed replays the identical tick sequence with the fault off (stage 4)', () => {
    const run = () => {
      const engine = createEngine({ stage: 4, seed: 7, users: 8, arrivalProb: 0.6 });
      return Array.from({ length: 25 }, () => engine.step());
    };
    // Off-fault the primary-down wiring changes nothing observable:
    // identical sequences, byte for byte (PINS header rule).
    const first = run();
    expect(first).toEqual(run());
    // A toggle on and straight back off with no traffic in between leaves
    // no residue: the faulted-then-restored variant replays the same
    // sequence the untouched engine runs.
    const toggleRun = () => {
      const engine = createEngine({ stage: 4, seed: 7, users: 8, arrivalProb: 0.6 });
      engine.setDatabasePrimaryDown(true);
      engine.setDatabasePrimaryDown(false);
      return Array.from({ length: 25 }, () => engine.step());
    };
    expect(toggleRun()).toEqual(first);
  });
});
