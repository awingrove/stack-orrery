// DOCUMENTS: the Stage 5 Worker Queue component — manages an asynchronous
// background job queue (`10.40`) and worker executor (`10.41`). Jobs are enqueued
// via POST requests, queued FIFO, processed across `jobDurationTicks`, and
// written to the database upon completion.
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

  function step(database, currentTick = 0) {
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
      };
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
    snapshot,
  };
}
