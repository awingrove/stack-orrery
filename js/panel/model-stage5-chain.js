// DOCUMENTS: pure presentation model — the Stage 5 async-vs-synchronous
// chain sentences, extracted from model.js by responsibility
// (guard-file-size; the model-dbop.js precedent). This is what model.js's
// hop-status line and model-stage6.js's hosted shapes both consume, so the
// byte shape cannot drift between the plain and hosted machines. No DOM
// here; the unit suite pins the sentences' shape through model.js.
import { dbOpSentence } from './model-dbop.js';

const workerAddressOf = (snapshot) => snapshot.workerQueue?.workerAddress ?? '10.41';

// One hop-sentence set per Stage 5 trace shape — async POST /jobs vs the
// synchronous cache/database story. Eight bare sentences with no "Hop n/8: "
// prefix: stage 5 and stage 6's host-less trace wrap them identically (the
// host-less counter-example renders byte-identically), and stage 6's hosted
// shape renumbers the tail behind its DNS prelude.
export function stage5ChainParts(snapshot, from, serverAddress) {
  const t = snapshot.trace ?? {};
  const target = t.targetServer ?? '10.11';
  if (t.asyncJob) {
    const worker = snapshot.workerQueue?.workerAddress ?? '10.41';
    // CHECKS: B-6e — a crashed worker reads its own queue on the tail hop;
    // the waiting count is the snapshot's live backlog, so the hop status
    // can never narrate a commit the sim did not make (DL-3, the trace
    // machine's workerTailFrame counterpart).
    if (snapshot.workerQueue?.crashed) {
      const waiting = (snapshot.workerQueue?.pendingJobs ?? []).length;
      return [
        `Browser (${from}) emits "${t.request}"`,
        `Network (10.x) routes to LoadBalancer (${serverAddress})`,
        `LoadBalancer (${serverAddress}) -> ${target} queue`,
        `WebServer (${target}) enqueues job to WorkerQueue (10.40)`,
        `WebServer (${target}) -> "202 Accepted"`,
        `Network delivers 202 response to ${from}`,
        `Browser (${from}) received and displayed 202 Accepted`,
        `Worker (${worker}) crashed — ${waiting} job(s) waiting in the queue (nothing committed)`,
      ];
    }
    return [
      `Browser (${from}) emits "${t.request}"`,
      `Network (10.x) routes to LoadBalancer (${serverAddress})`,
      `LoadBalancer (${serverAddress}) -> ${target} queue`,
      `WebServer (${target}) enqueues job to WorkerQueue (10.40)`,
      `WebServer (${target}) -> "202 Accepted"`,
      `Network delivers 202 response to ${from}`,
      `Browser (${from}) received and displayed 202 Accepted`,
      `Worker (${worker}) processed job and committed to Database (10.30)`,
    ];
  }
  // Requests served synchronously keep the Stage 4 cache/database story;
  // the worker does not see them, so the tail hop reads idle.
  const db = snapshot.database ?? {};
  const dbOp = dbOpSentence(t.dbOp, {
    stale: t.dbStale,
    primary: db.primaryAddress ?? '10.30',
    replica: db.replicaAddress ?? '10.31',
    lag: db.replicationLagTicks ?? 3,
    cacheAddress: snapshot.cache?.address ?? '10.20',
  });
  return [
    `Browser (${from}) emits "${t.request}"`,
    `Network (10.x) routes to LoadBalancer (${serverAddress})`,
    `LoadBalancer (${serverAddress}) -> ${target} queue`,
    dbOp,
    `WebServer (${target}) -> "${t.response}" (cache ${t.cacheStatus})`,
    `Network delivers ${t.status} response to ${from}`,
    `Browser (${from}) received and displayed ${t.status}`,
    `Worker (${workerAddressOf(snapshot)}) idle — no async jobs in this trace`,
  ];
}
