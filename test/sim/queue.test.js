import { describe, it, expect } from 'vitest';
import { createWorkerQueue } from '../../js/sim/queue.js';
import { createDatabase } from '../../js/sim/database.js';

describe('worker queue sim component', () => {
  it('validates mini-IPs and jobDurationTicks', () => {
    expect(() => createWorkerQueue({ address: 'invalid' })).toThrow();
    expect(() => createWorkerQueue({ workerAddress: 'invalid' })).toThrow();
    expect(() => createWorkerQueue({ jobDurationTicks: 0 })).toThrow();
    expect(() => createWorkerQueue({ jobDurationTicks: 1.5 })).toThrow();
  });

  it('enqueues jobs and tracks stats', () => {
    const q = createWorkerQueue({ address: '10.40', workerAddress: '10.41', jobDurationTicks: 2 });
    expect(q.address).toBe('10.40');
    expect(q.workerAddress).toBe('10.41');

    const job1 = q.enqueue('/report', 'monthly report', 0);
    expect(job1).toEqual({
      jobId: 1,
      path: '/report',
      payload: 'monthly report',
      status: 'queued',
      queuedAtTick: 0,
    });

    const snap = q.snapshot(0);
    expect(snap.enqueued).toBe(1);
    expect(snap.completed).toBe(0);
    expect(snap.pendingJobs.length).toBe(1);
    expect(snap.activeJob).toBeNull();
  });

  it('steps jobs through duration and writes to database', () => {
    const db = createDatabase();
    const q = createWorkerQueue({ jobDurationTicks: 2 });

    q.enqueue('/async-task', 'data-value', 10);

    // Tick 10: queue picks up job, makes it active
    q.step(db, 10);
    let snap = q.snapshot(10);
    expect(snap.activeJob).toMatchObject({ jobId: 1, path: '/async-task', status: 'active' });
    expect(snap.pendingJobs.length).toBe(0);

    // Tick 11: still active (duration 2 -> finishes at 12)
    q.step(db, 11);
    expect(q.snapshot(11).completed).toBe(0);

    // Tick 12: completes and writes to db
    q.step(db, 12);
    snap = q.snapshot(12);
    expect(snap.completed).toBe(1);
    expect(snap.activeJob).toBeNull();
    expect(snap.lastJobResult.jobId).toBe(1);

    db.stepReplication(15);
    const dbRead = db.read('/async-task', 15);
    expect(dbRead.value).toBe('data-value');
  });
});
