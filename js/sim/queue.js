// DOCUMENTS: the Stage 5 Worker Queue component — manages an asynchronous
// background job queue (`10.40`) and worker executor (`10.41`). Jobs are enqueued
// via POST requests, queued FIFO, processed across `jobDurationTicks`, and
// written to the database upon completion.
// B-6e: the worker's crash lives on the component itself (`setCrashed`/
// `isCrashed`), NOT on narration. While crashed, `step()` drains nothing — the
// backlog grows visibly. ON the `true` flip with a job caught ACTIVE, that
// job returns to the HEAD of `jobs` stripped to the queued shape
// (completion and crash are mutually exclusive, so nothing duplicates) and
// is re-delivered on restore, re-timed from scratch — the `redelivered`
// tally; a re-delivered completion lands its own evidence mark
// (`redeliveredCommits`) so a pre-crash commit cannot be claimed as the
// re-delivery.
//
// CHECKS: constructor validates mini-IP addresses (`/^\d+\.\d+$/`) and
// `jobDurationTicks` as an integer >= 1.
export function createWorkerQueue({
  address = '10.40',
  workerAddress = '10.41',
  jobDurationTicks = 2,
} = {}) {
  for (const [name, addr] of [
    ['address', address],
    ['workerAddress', workerAddress],
  ]) {
    if (!/^\d+\.\d+$/.test(addr)) {
      throw new Error(`queue: invalid mini-IP address ${name}=${addr}`);
    }
  }
  if (!Number.isInteger(jobDurationTicks) || jobDurationTicks < 1) {
    throw new Error(`queue: jobDurationTicks must be an integer >= 1, got ${jobDurationTicks}`);
  }

  let jobs = []; // pending queued jobs
  let enqueued = 0;
  let completed = 0;
  let activeJob = null; // { jobId, path, payload, queuedAtTick, startedAtTick, finishesAtTick }
  let nextJobId = 1;
  let lastJobResult = null;
  // B-6e: the crash is the worker's own state, plus the re-delivery tally
  // and the marker book that proves WHICH completions re-delivered.
  let crashed = false;
  let redeliveryTally = 0;
  let redeliveredCommitTally = 0;
  // CHECKS: re-delivered job ids ride the side book, never the stored job —
  // the queued shape stays byte-identical across a crash flip.
  const requeuedJobIds = new Set();

  function enqueue(path, payload, currentTick = 0) {
    const jobId = nextJobId++;
    enqueued += 1;
    const job = {
      jobId,
      path,
      payload,
      status: 'queued',
      queuedAtTick: currentTick,
    };
    jobs.push(job);
    return job;
  }

  // CHECKS: B-6e flip — validates a boolean (fail-loud, setPrimaryDown
  // pattern). ON the true flip with an ACTIVE job: unshift it back to the
  // HEAD of `jobs` stripped to the queued shape
  // `{ jobId, path, payload, status: 'queued', queuedAtTick }` — the stored
  // payload is re-delivered as stored, no startedAtTick/finishesAtTick
  // survive (the re-delivery re-times from scratch) — null the active job
  // and bump `redelivered`. A flip with no active job moves nothing and the
  // tally stays.
  function setCrashed(next) {
    if (typeof next !== 'boolean') {
      throw new Error(`queue: crashed must be a boolean, got ${next}`);
    }
    crashed = next;
    if (crashed && activeJob) {
      requeuedJobIds.add(activeJob.jobId);
      jobs.unshift({
        jobId: activeJob.jobId,
        path: activeJob.path,
        payload: activeJob.payload,
        status: 'queued',
        queuedAtTick: activeJob.queuedAtTick,
      });
      activeJob = null;
      redeliveryTally += 1;
    }
  }

  function isCrashed() {
    return crashed;
  }

  function redelivered() {
    return redeliveryTally;
  }

  function redeliveredCommits() {
    return redeliveredCommitTally;
  }

  // The live queue depth the crash narration reads (trace + engine use this,
  // nobody reaches into internals).
  function pendingCount() {
    return jobs.length;
  }

  function step(database, currentTick = 0) {
    // CHECKS (B-6e): a crashed worker is a hard pause — no completion, no
    // active start, no commit attempt. `enqueue` is byte-unchanged, so the
    // backlog grows visibly while the visor watches nothing finish.
    if (crashed) return;
    // If we have an active job finishing at or before currentTick, complete it
    if (activeJob && currentTick >= activeJob.finishesAtTick) {
      if (database && typeof database.write === 'function') {
        database.write(activeJob.path, activeJob.payload, currentTick);
      }
      lastJobResult = {
        jobId: activeJob.jobId,
        path: activeJob.path,
        payload: activeJob.payload,
        completedAtTick: currentTick,
        // CHECKS: the re-delivery evidence mark — a completion flagged
        // `redelivered` is one whose job sat in the queue HEAD after a crash
        // flip, so a pre-crash commit can never carry it (the mission's
        // "commit AFTER the redelivery" ordering reads this counter).
        redelivered: requeuedJobIds.delete(activeJob.jobId),
      };
      if (lastJobResult.redelivered) redeliveredCommitTally += 1;
      completed += 1;
      activeJob = null;
    }

    // If no active job and there are queued jobs, start the next one
    if (!activeJob && jobs.length > 0) {
      const job = jobs.shift();
      activeJob = {
        ...job,
        status: 'active',
        startedAtTick: currentTick,
        finishesAtTick: currentTick + jobDurationTicks,
      };
    }
  }

  function snapshot(currentTick = 0) {
    void currentTick;
    return {
      address,
      workerAddress,
      jobDurationTicks,
      enqueued,
      completed,
      // CHECKS: the tallies read back — a redelivered job sitting re-queued
      // mid-crash is never narrated as newly committed work.
      crashed,
      redelivered: redeliveryTally,
      redeliveredCommits: redeliveredCommitTally,
      activeJob: activeJob ? { ...activeJob } : null,
      pendingJobs: jobs.map((j) => ({ ...j })),
      lastJobResult: lastJobResult ? { ...lastJobResult } : null,
    };
  }

  return {
    get address() {
      return address;
    },
    get workerAddress() {
      return workerAddress;
    },
    enqueue,
    step,
    setCrashed,
    isCrashed,
    redelivered,
    redeliveredCommits,
    pendingCount,
    snapshot,
  };
}
