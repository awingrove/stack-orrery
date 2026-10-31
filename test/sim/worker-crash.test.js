import { describe, it, expect } from 'vitest';
import { createWorkerQueue } from '../../js/sim/queue.js';
import { createEngine } from '../../js/sim/engine.js';

// B-6e worker crash (docs/plans/2026-10-31-b6e-worker-crash.md): the crash
// is real component state — the queue's own setCrashed flag. While crashed
// `step()` drains nothing (the backlog grows), the 202 enqueue branch runs
// before any worker consult, and a job caught ACTIVE at the flip returns to
// the HEAD of the queue to re-deliver on restore, re-timed from scratch.
// Titles are manifest refs (SIM slice tests) — do not reword.

// A recording write sink standing in for the database: every commit the
// worker makes lands here exactly once.
const writeSink = () => {
  const calls = [];
  return {
    calls,
    write(path, payload, atTick) {
      calls.push({ path, payload, atTick });
    },
  };
};

describe('worker crash (B-6e)', () => {
  it('setCrashed validates a boolean ON/OFF flag and isCrashed reads it back (fail loud)', () => {
    const q = createWorkerQueue({});
    expect(q.isCrashed()).toBe(false);
    q.setCrashed(true);
    expect(q.isCrashed()).toBe(true);
    q.setCrashed(false);
    expect(q.isCrashed()).toBe(false);
    // Any non-boolean input throws with the flag's own message instead of
    // silently leaving the queue in an unspecified consult state.
    expect(() => q.setCrashed('yes')).toThrow(/crashed must be a boolean, got yes/);
    expect(() => q.setCrashed(1)).toThrow(/crashed must be a boolean, got 1/);
    expect(() => q.setCrashed(null)).toThrow(/crashed must be a boolean, got null/);
    // A rejected input changes nothing.
    expect(q.isCrashed()).toBe(false);
  });

  // CHECKS: while crashed, step() completes/drains NOTHING — the active
  // start branch and the completion branch are both behind the crash
  // consult, so the snapshot's completed/lastJobResult/activeJob are frozen
  // while `enqueue` (byte-unchanged) grows the pending backlog visibly.
  it('a crashed step drains nothing — the backlog grows and no commit is attempted', () => {
    const db = writeSink();
    const q = createWorkerQueue({ jobDurationTicks: 2 });
    q.enqueue('/a', 'payload-a', 1);
    q.step(db, 1); // job 1 becomes active, finishes at tick 3
    q.setCrashed(true);
    const before = q.snapshot(1);
    expect(before).toMatchObject({ crashed: true, redelivered: 1, completed: 0 });
    expect(before.activeJob).toBeNull(); // the in-flight job re-queued below
    // enqueue still works while crashed: the backlog grows visibly.
    q.enqueue('/b', 'payload-b', 2);
    for (let t = 2; t <= 5; t += 1) q.step(db, t);
    const after = q.snapshot(5);
    // Every drained-side projection is byte-frozen against pre-crash.
    expect(after.completed).toBe(before.completed);
    expect(after.lastJobResult).toEqual(before.lastJobResult);
    expect(after.activeJob).toEqual(before.activeJob);
    expect(after).toMatchObject({ crashed: true, enqueued: 2 });
    // Pending grew by exactly the enqueued job — the re-delivered head on
    // top of it, in the byte-identical queued shape.
    expect(after.pendingJobs).toEqual([
      { jobId: 1, path: '/a', payload: 'payload-a', status: 'queued', queuedAtTick: 1 },
      { jobId: 2, path: '/b', payload: 'payload-b', status: 'queued', queuedAtTick: 2 },
    ]);
    // No commit attempt ever reached the database while crashed.
    expect(db.calls).toEqual([]);
    expect(after.redeliveredCommits).toBe(0);
  });

  // CHECKS: ON the true flip WITH an active job, that job returns to the
  // HEAD of `jobs` stripped to the queued shape (no startedAtTick /
  // finishesAtTick / status fields survive), activeJob nulls, and
  // `redelivered` bumps by exactly one. A flip with NO active job moves
  // nothing — same byte queue, no tally.
  it('the crash flip re-queues an ACTIVE job to the head — byte-identical queued shape, redelivered bumps', () => {
    const q = createWorkerQueue({ jobDurationTicks: 2 });
    q.enqueue('/a', 'payload-a', 1);
    q.step(null, 1); // active: { jobId 1, finishesAtTick 3, startedAtTick 1 }
    q.enqueue('/b', 'payload-b', 2);
    q.setCrashed(true);
    let snap = q.snapshot(2);
    expect(snap.activeJob).toBeNull();
    expect(snap.redelivered).toBe(1);
    expect(snap.pendingJobs[0]).toEqual({
      jobId: 1,
      path: '/a',
      payload: 'payload-a',
      status: 'queued',
      queuedAtTick: 1,
    });
    expect(snap.pendingJobs).toHaveLength(2);
    // Restore (flip back) moves nothing on its own — the head job simply
    // becomes eligible for delivery again on the queue's own schedule.
    q.setCrashed(false);
    snap = q.snapshot(2);
    expect(snap).toMatchObject({ crashed: false, redelivered: 1, completed: 0 });
  });

  it('a crash flip with no active job moves nothing — redelivered stays flat, the queue byte-holds', () => {
    const q = createWorkerQueue({ jobDurationTicks: 2 });
    q.enqueue('/a', 'payload-a', 1);
    q.enqueue('/b', 'payload-b', 2);
    const before = q.snapshot(1);
    q.setCrashed(true);
    const after = q.snapshot(2);
    expect(after.redelivered).toBe(0);
    expect(after.pendingJobs).toEqual(before.pendingJobs);
    expect(after).toMatchObject({ crashed: true, enqueued: 2 });
    // A repeated false flip is a no-op as well.
    q.setCrashed(false);
    expect(q.snapshot(2).redelivered).toBe(0);
  });

  // CHECKS: restore re-delivers — the re-queued job RE-TIMES from scratch
  // (finishesAtTick recomputed from the current tick, not the pre-crash
  // schedule), commits for real exactly once, and no double completion
  // exists: the pre-crash active job never committed (completion and crash
  // are mutually exclusive).
  it('restore re-delivers the re-queued job — it re-times from scratch and commits exactly once', () => {
    const db = writeSink();
    const q = createWorkerQueue({ jobDurationTicks: 2 });
    q.enqueue('/a', 'payload-a', 1);
    q.step(db, 1); // active, old schedule said finishes at tick 3
    q.setCrashed(true); // re-queued to the head, old schedule dropped
    // Long crash: the ticks where it would have finished pass in silence.
    for (let t = 2; t <= 5; t += 1) q.step(db, t);
    q.setCrashed(false);
    // Tick 6: the re-delivery takes the head job and re-times it — it
    // finishes at 8, five ticks past the old schedule's 3.
    q.step(db, 6);
    let snap = q.snapshot(6);
    expect(snap).toMatchObject({ crashed: false, redelivered: 1, redeliveredCommits: 0 });
    expect(snap.activeJob).toEqual({
      jobId: 1,
      path: '/a',
      payload: 'payload-a',
      status: 'active',
      queuedAtTick: 1,
      startedAtTick: 6,
      finishesAtTick: 8,
    });
    expect(db.calls).toEqual([]); // no commit before the re-timed schedule
    q.step(db, 7);
    expect(db.calls).toEqual([]); // still running, exactly once pending
    q.step(db, 8);
    snap = q.snapshot(8);
    expect(snap).toMatchObject({ completed: 1, redelivered: 1, redeliveredCommits: 1 });
    expect(snap.lastJobResult).toEqual({
      jobId: 1,
      path: '/a',
      payload: 'payload-a',
      completedAtTick: 8,
      redelivered: true,
    });
    // The database saw the payload exactly once — no double completion.
    expect(db.calls).toEqual([{ path: '/a', payload: 'payload-a', atTick: 8 }]);
    // A second job that ran outside the crash window follows normally,
    // un-flagged: enqueued after the restore, started at tick 9, committed
    // at tick 11.
    q.enqueue('/b', 'payload-b', 8);
    q.step(db, 9);
    expect(q.snapshot(9).activeJob).toMatchObject({ jobId: 2 });
    q.step(db, 10);
    q.step(db, 11);
    snap = q.snapshot(11);
    expect(snap).toMatchObject({ completed: 2, redelivered: 1, redeliveredCommits: 1 });
    expect(snap.lastJobResult).toEqual({
      jobId: 2,
      path: '/b',
      payload: 'payload-b',
      completedAtTick: 11,
      redelivered: false,
    });
  });

  it('engine setWorkerCrashed is fail-loud below stage 5 — no worker queue exists there', () => {
    const stage4 = createEngine({ stage: 4, arrivalProb: 0 });
    expect(() => stage4.setWorkerCrashed(true)).toThrow(/stage 4 has no Worker Queue/);
    // Flipping false on a stage that has no queue fails loud too.
    const stage1 = createEngine({ stage: 1, arrivalProb: 0 });
    expect(() => stage1.setWorkerCrashed(false)).toThrow(/stage 1 has no Worker Queue/);
  });

  // CHECKS: the engine flip routes into the queue's own flag — snapshot
  // reads `crashed` and `redelivered` back from the component, and a job in
  // flight at the flip re-delivers on restore for real through the engine's
  // own tick loop, committing through database.write exactly once.
  it('engine setWorkerCrashed routes to the queue at stage 5 — the snapshot reads it back and re-delivery commits', () => {
    const engine = createEngine({ stage: 5, arrivalProb: 0 });
    expect(engine.snapshot().crashed).toBe(false);
    // A real async POST /jobs walks the 8-hop story (fault off): the job
    // sits queued (not active) — only an engine tick takes it in flight.
    for (let hop = 0; hop < 8; hop += 1) engine.traceHop({ method: 'POST', path: '/jobs' });
    expect(engine.snapshot()).toMatchObject({ crashed: false, redelivered: 0 });
    engine.step(); // the worker takes job 1 — it is now in flight
    expect(engine.snapshot().workerQueue).toMatchObject({
      activeJob: { jobId: 1, status: 'active' },
      pendingJobs: [],
    });
    // Crash mid-flight: the job returns to the HEAD of the queue, the
    // re-queued record byte-identical to the shape that ran (queued fields
    // carried over verbatim, the timing fields dropped).
    const inFlight = engine.snapshot().workerQueue.activeJob;
    engine.setWorkerCrashed(true);
    let snap = engine.snapshot();
    expect(snap).toMatchObject({ crashed: true, redelivered: 1 });
    expect(snap.workerQueue).toMatchObject({ activeJob: null, completed: 0 });
    expect(snap.workerQueue.pendingJobs[0]).toEqual({
      jobId: inFlight.jobId,
      path: inFlight.path,
      payload: inFlight.payload,
      status: 'queued',
      queuedAtTick: inFlight.queuedAtTick,
    });
    // Ticks while crashed drain nothing.
    engine.step();
    engine.step();
    expect(engine.snapshot().workerQueue).toMatchObject({ completed: 0, activeJob: null });
    // Restore: the re-delivered job re-times and commits for real.
    engine.setWorkerCrashed(false);
    engine.step(); // re-delivery starts, re-timed
    for (let i = 0; i < 2; i += 1) engine.step();
    snap = engine.snapshot();
    expect(snap).toMatchObject({ crashed: false, redelivered: 1 });
    expect(snap.workerQueue).toMatchObject({
      completed: 1,
      redeliveredCommits: 1,
      lastJobResult: { jobId: 1, path: '/jobs', redelivered: true },
    });
    expect(snap.database.writes).toBe(1);
  });

  // CHECKS: DL-3 named counter-example (1) — a crashed worker NEVER
  // fake-commits: the async trace's tail (hop 8/8) reads the live queue
  // state and names the crash with the waiting count, while the 202 enqueue
  // frames before it stay byte-identical to the off-fault story and no
  // "finished job" frame exists anywhere in the crashed run.
  it('DL-3 counter-example — a crashed worker tail narrates the crash, never a fake commit, and the 202 enqueue frames stay byte-identical', () => {
    const runTrace = (crashed) => {
      const engine = createEngine({ stage: 5, arrivalProb: 0 });
      if (crashed) engine.setWorkerCrashed(true);
      const frames = [];
      for (let hop = 0; hop < 8; hop += 1) {
        frames.push(engine.traceHop({ method: 'POST', path: '/jobs' }).lastFrame);
      }
      return { frames, snap: engine.snapshot() };
    };
    const off = runTrace(false);
    const on = runTrace(true);
    // Hops 1-7 are byte-identical — the enqueue ran before any worker
    // consult.
    expect(on.frames.slice(0, 7)).toEqual(off.frames.slice(0, 7));
    expect(off.frames).toEqual([
      '10.2 -> 10.1 | POST /jobs',
      'routed 10.2 -> 10.1 (POST /jobs) to LoadBalancer',
      'LB 10.1 -> 10.11 (POST /jobs) queued',
      '10.11 -> 10.40 | enqueued async job (/jobs)',
      '10.11 -> 10.2 | 202 {"jobId": 1, "status": "queued"}',
      'Network delivered 202 response to 10.2',
      'Browser 10.2 received and displayed 202',
      'Worker 10.41 finished job and committed to Database 10.30',
    ]);
    // The crashed tail names the crash from the queue's live state; the
    // commit sentence a healthy tail carries does not appear anywhere.
    expect(on.frames[7]).toBe(
      'Worker 10.41 crashed — 1 job(s) waiting in the queue (nothing committed)',
    );
    expect(on.frames.join('\n')).not.toContain('finished job');
    expect(on.snap.trace).toMatchObject({ status: 202, asyncJob: true, hop: 8 });
    expect(on.snap).toMatchObject({ crashed: true, refusedCount: 0 });
    expect(on.snap.workerQueue).toMatchObject({ enqueued: 1, completed: 0, redelivered: 0 });
  });

  // CHECKS: DL-3 named counter-example (2) — the worker's crash does not
  // touch the synchronous stories: a POST write-through and a GET replay
  // byte-identically to the off-fault frames (the 202 and write branches
  // never consulted the worker), the write still lands a real 200 WRITE,
  // and no crash language appears anywhere.
  it('DL-3 counter-example — synchronous POST write-through and GET frames stay byte-identical with the worker crashed', () => {
    const runSync = (crashed, method) => {
      const engine = createEngine({ stage: 5, arrivalProb: 0 });
      if (crashed) engine.setWorkerCrashed(true);
      const frames = [];
      for (let hop = 0; hop < 8; hop += 1) {
        frames.push(engine.traceHop({ method, path: '/about' }).lastFrame);
      }
      return { frames, snap: engine.snapshot() };
    };
    for (const method of ['POST', 'GET']) {
      const off = runSync(false, method);
      const on = runSync(true, method);
      expect(on.frames).toEqual(off.frames);
      expect(on.frames.join('\n')).not.toContain('crashed');
      if (method === 'POST') {
        expect(on.snap.lastExchange).toMatchObject({
          status: 200,
          dbOp: 'WRITE',
          dbTarget: '10.30',
        });
        expect(on.snap.database.writes).toBe(1);
        expect(on.snap.workerQueue).toMatchObject({ enqueued: 0, completed: 0 });
      } else {
        expect(on.snap.lastExchange).toMatchObject({ status: 200, dbOp: 'SELECT' });
      }
      // Both runs stay whole — the stage-5 tail ends on the worker's own
      // idle line (no crash language and no async story on a sync trace).
      expect(off.frames[7]).toBe('Worker 10.41 idle — no async jobs in this trace');
    }
  });

  // CHECKS: DL-3 named counter-example (3) — off-crash the wiring changes
  // nothing observable: a same-seed replay is byte-green with the fault
  // off, and a crash flip on + straight off with no traffic between leaves
  // no residue either.
  it('same seed replays the identical tick sequence with the fault off (stage 5)', () => {
    const run = () => {
      const engine = createEngine({ stage: 5, seed: 7, users: 8, arrivalProb: 0.6 });
      return Array.from({ length: 25 }, () => engine.step());
    };
    const first = run();
    expect(first).toEqual(run());
    const toggleRun = () => {
      const engine = createEngine({ stage: 5, seed: 7, users: 8, arrivalProb: 0.6 });
      engine.setWorkerCrashed(true);
      engine.setWorkerCrashed(false);
      return Array.from({ length: 25 }, () => engine.step());
    };
    expect(toggleRun()).toEqual(first);
  });
});
