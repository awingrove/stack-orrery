// DOCUMENTS: pure presentation model — engine snapshot in, labels and bar
// geometry out. No DOM here: this is what the unit suite pins; panel.js and
// render.js own all DOM writes. Stage-6 hop sentences live in
// model-stage6.js, the stage-5 async/sync chain sentences in
// model-stage5-chain.js (guard-file-size splits — B-6e).
import { stage6Sentences } from './model-stage6.js';
import { stage5ChainParts } from './model-stage5-chain.js';
import { dbOpSentence } from './model-dbop.js';
import { finalHop } from '../sim/trace-helpers.js';
import {
  DEFAULT_TTL_TICKS,
  DEFAULT_DNS_TTL_TICKS,
  DEFAULT_REPLICATION_LAG_TICKS,
} from '../sim/defaults.js';
export const TICK_MS = 100;
const QUEUE_BAR_SATURATION = 20; // bar reads full at 20 queued requests

const HOP_START_SENTENCE = 'Idle — type a path and click Go or Step 1 Hop ->';

function fillPercent(depth) {
  return `${Math.min(100, Math.round((depth / QUEUE_BAR_SATURATION) * 100))}%`;
}

export const withHopPrefix = (parts, total) => parts.map((p, i) => `Hop ${i + 1}/${total}: ${p}`);

// Stage 6 composes its sentences in model-stage6.js: the two DNS prelude
// sentences plus one of the three hosted shapes behind the answer (plain
// subnet-10 chain, Stage-6b CDN chain, or the NX refusal), or the
// byte-identical host-less stage-5 story. An NX answer ends the trace at
// hop 2 — the browser renders the refusal card and no GET appears anywhere
// downstream (pinned counter-example in test/panel/model-stage6.test.js).

// One hop-status sentence per hop, in hop order, for each stage's trace
// shape: 4 hops in Stage 1 (emit, route, serve, render), 5 in Stage 2 (LB
// round-robin pick), 6 in Stage 3 (cache check, then response emit), 7 in
// Stage 4 (the database hop after the cache check), 8 in Stage 5, and the
// stage-6 shapes above. Every `Hop n/N` denominator resolves through the
// shared finalHop helper (trace-helpers.js) so the panel readout and the
// sim machines count from one surface.
function hopSentences(stage, snapshot, from, serverAddress) {
  const t = snapshot.trace ?? {};
  const target = t.targetServer ?? '10.11';
  if (stage === 6) return stage6Sentences(snapshot, from, serverAddress);
  if (stage === 1 && t.refused) {
    // CHECKS: B-6 counter-example — the refusal shape is 2 hops, the emit
    // and the transport's connection refused. It is not a renumber of the
    // 4-hop served story: no queue sentence, no served body sentence, and
    // no render sentence appears, so the refusal cannot read as a
    // completed delivery.
    return withHopPrefix(
      [
        `Browser (${from}) emits "${t.request}"`,
        `Network (10.x) -> WebServer (${serverAddress}): connection refused — nothing enqueued, nothing served`,
      ],
      finalHop(1, t),
    );
  }
  if (stage >= 2 && stage <= 5 && t.refused) {
    // CHECKS: R2a parity — stages 2-5 narrate the all-down abort as its own
    // 3-hop shape: the submit + routed sentences the served ladder already
    // opens with, plus the LB refusal card, totaled by finalHop(stage, t)
    // (3). The refusal is not a renumber of the served ladder and there is
    // no hop 4+/3 residue — pinned in test/panel/model.test.js (stage 2).
    // Parity rule: the sim abort's final hop equals this panel total.
    return withHopPrefix(
      [
        `Browser (${from}) emits "${t.request}"`,
        `Network (10.x) routes to LoadBalancer (${serverAddress})`,
        'LoadBalancer (10.1): connection refused — the pool is all-down, nothing enqueued, nothing served',
      ],
      finalHop(stage, t),
    );
  }
  if (stage === 5) {
    return withHopPrefix(stage5ChainParts(snapshot, from, serverAddress), finalHop(5, t));
  }
  if (stage === 4) {
    const db = snapshot.database ?? null;
    return withHopPrefix(
      [
        `Browser (${from}) emits "${t.request}"`,
        `Network (10.x) routes to LoadBalancer (${serverAddress})`,
        `LoadBalancer (${serverAddress}) -> ${target} queue`,
        `WebServer (${target}) checks Cache (10.20) — ${t.cacheStatus}`,
        dbOpSentence(t.dbOp, {
          stale: t.dbStale,
          primary: db?.primaryAddress ?? '10.30',
          replica: db?.replicaAddress ?? '10.31',
          lag: db?.replicationLagTicks ?? DEFAULT_REPLICATION_LAG_TICKS,
          cacheAddress: '10.20',
        }),
        `WebServer (${target}) -> "${t.response}" (cache ${t.cacheStatus})`,
        `Browser (${from}) rendered ${t.status}`,
      ],
      finalHop(4, t),
    );
  }
  if (stage === 3) {
    return withHopPrefix(
      [
        `Browser (${from}) emits "${t.request}"`,
        `Network (10.x) routes to LoadBalancer (${serverAddress})`,
        `LoadBalancer (${serverAddress}) -> ${target} queue`,
        `WebServer (${target}) checks Cache (10.20) — ${t.cacheStatus}`,
        `WebServer (${target}) -> "${t.response}" (cache ${t.cacheStatus})`,
        `Browser (${from}) rendered ${t.status}`,
      ],
      finalHop(3, t),
    );
  }
  if (stage === 2) {
    return withHopPrefix(
      [
        `Browser (${from}) emits "${t.request}"`,
        `Network (10.x) routes to LoadBalancer (${serverAddress})`,
        `LoadBalancer (${serverAddress}) -> ${target} queue`,
        `WebServer (${target}) -> "${t.response}"`,
        `Browser (${from}) rendered ${t.status}`,
      ],
      finalHop(2, t),
    );
  }
  return withHopPrefix(
    [
      `Browser (${from}) emits "${t.request}"`,
      `Network (10.x) routes to ${serverAddress} queue`,
      `WebServer (${serverAddress}) -> "${t.response}"`,
      `Browser (${from}) rendered ${t.status}`,
    ],
    finalHop(1, t),
  );
}

function formatHopStatus(snapshot, serverAddress) {
  const hop = snapshot.trace?.hop ?? 0;
  const from = snapshot.trace?.from ?? '10.2';
  if (hop >= 1) {
    const sentences = hopSentences(snapshot.stage ?? 1, snapshot, from, serverAddress);
    if (hop <= sentences.length) return sentences[hop - 1];
  }
  return HOP_START_SENTENCE;
}

// PINS: journey-log chronology, as consumed by render.js's #journey-log.
// Entries carry the run key (run, hop): top-down, a run completed later
// floats wholly above a run completed earlier, and inside a run the entries
// sort hop-ascending whatever emission order the trace engine produces —
// a 4-hop trace must never read "hop 2/4" above "hop 1/4" (named
// counter-example, pinned in test/panel/render.test.js).
export function journeyEntryIsBefore(entry, existing) {
  return entry.run > existing.run || (entry.run === existing.run && entry.hop < existing.hop);
}

// Pure insertion into a sorted journey list (no DOM here): returns the
// ordered array with the new entry placed so the run key order holds.
export function orderJourneyEntries(entries, entry) {
  const ordered = [...entries];
  const index = ordered.findIndex((existing) => journeyEntryIsBefore(entry, existing));
  if (index === -1) ordered.push(entry);
  else ordered.splice(index, 0, entry);
  return ordered;
}

// PINS: compare rows align by hop index over max(left.hops, right.hops); the
// exhausted side reads the em-dash and nothing drops (B-5 alignment). Frame
// texts pass through byte-verbatim — the compare tray renders the journey
// log's stored entries and never mints, rewrites, or summarizes hop frames
// (DL-1/DL-3). Entries are read-only here; each side matches its hop-n entry
// by the entries' own hop keys so a shorter run genuinely falls silent
// rather than shifting cells out of position.
export function alignCompareRows(left, right) {
  const total = Math.max(left.hops, right.hops);
  const textAt = (run, n) => run.entries.find((entry) => entry.hop === n)?.text ?? '—';
  return Array.from({ length: total }, (_, i) => ({
    n: i + 1,
    left: textAt(left, i + 1),
    right: textAt(right, i + 1),
  }));
}

// PINS: the tray holds the two most recent completed trace runs (B-5 slot
// branches). First distinct push fills A then B; a third distinct run
// shifts A <- old B, B <- new. A completed run equal to either stored
// slot's run id is a no-op (the tray does not duplicate a run). The
// trace-runs-only gate rejects the tick-shaped counter-example here: a run
// with fewer than 2 hops — no hop entries, e.g. a crowd tick — never enters
// the slots (named counter-example pinned in test/panel/model.test.js).
export function nextCompareSlots(slots, newRun) {
  if (!newRun || !Array.isArray(newRun.entries) || newRun.entries.length < 2) {
    return { a: slots?.a ?? null, b: slots?.b ?? null, changed: false };
  }
  if (newRun.run === slots?.a?.run || newRun.run === slots?.b?.run) {
    return { a: slots.a, b: slots.b, changed: false };
  }
  if (!slots?.a) return { a: newRun, b: null, changed: true };
  if (!slots.b) return { a: slots.a, b: newRun, changed: true };
  return { a: slots.b, b: newRun, changed: true };
}

export function describeSnapshot(snapshot) {
  const stage = snapshot.stage ?? 1;
  const latencyMs = Math.round(snapshot.avgLatencyTicks * TICK_MS);
  const last = snapshot.lastExchange ?? null;
  const hop = snapshot.trace?.hop ?? 0;
  const serverAddress = snapshot.serverAddress ?? '10.1';
  const s1Depth = snapshot.servers?.[0]?.queueDepth ?? snapshot.queueDepth;
  const s2Depth = snapshot.servers?.[1]?.queueDepth ?? 0;
  const perBackend = snapshot.loadBalancer?.perBackend ?? {};
  // CHECKS: per-tick throughput is served/tick while the clock runs and
  // exactly 0 at tick 0 — the SERVED card renders "0.00/t", never NaN or
  // Infinity (named counter-example: a fresh Stage-1 panel at tick 0).
  const servedPerTick = snapshot.tick > 0 ? (snapshot.served ?? 0) / snapshot.tick : 0;
  return {
    stage,
    // R2a: one count surface — the total is the shared finalHop helper's
    // trace-aware read (a refused stage 2-6 run resolves to its 3-hop
    // abort, an NX stage-6 run to 2), not a fixed per-stage map.
    totalHops: finalHop(stage, snapshot.trace),
    tick: String(snapshot.tick),
    users: String(snapshot.users),
    queueDepth: String(snapshot.queueDepth),
    served: String(snapshot.served),
    servedRate: `${servedPerTick.toFixed(2)}/t`,
    latency: `${latencyMs} ms`,
    queueFill: fillPercent(snapshot.queueDepth),
    queueFill1: fillPercent(s1Depth),
    queueFill2: fillPercent(s2Depth),
    serverAddress,
    server1Address: snapshot.servers?.[0]?.address ?? serverAddress,
    server2Address: snapshot.servers?.[1]?.address ?? '10.12',
    lbNextBackend: snapshot.loadBalancer
      ? `Next -> ${snapshot.loadBalancer.nextBackend}`
      : 'Next -> 10.11',
    lbBackend1Label: `10.11 WebServer-1 (${perBackend['10.11'] ?? 0})`,
    lbBackend2Label: `10.12 WebServer-2 (${perBackend['10.12'] ?? 0})`,
    cacheStatsLabel: `Hits: ${snapshot.cache?.hits ?? 0} · Misses: ${snapshot.cache?.misses ?? 0} · TTL: ${snapshot.cache?.ttlTicks ?? DEFAULT_TTL_TICKS}t`,
    cacheEntries: snapshot.cache?.entries ?? [],
    dbStatsLabel: `Reads: ${snapshot.database?.reads ?? 0} · Writes: ${snapshot.database?.writes ?? 0} · Lag: ${snapshot.database?.replicationLagTicks ?? DEFAULT_REPLICATION_LAG_TICKS}t`,
    dbRows: snapshot.database?.rows ?? [],
    queueStatsLabel: snapshot.workerQueue
      ? `Enqueued: ${snapshot.workerQueue.enqueued} · Completed: ${snapshot.workerQueue.completed} · Active: ${
          snapshot.workerQueue.activeJob
            ? `#${snapshot.workerQueue.activeJob.jobId} ${snapshot.workerQueue.activeJob.path}`
            : 'none'
        }`
      : 'Enqueued: 0 · Completed: 0 · Active: none',
    workerStatsLabel: snapshot.workerQueue
      ? snapshot.workerQueue.activeJob
        ? `Worker ${snapshot.workerQueue.workerAddress} processing #${snapshot.workerQueue.activeJob.jobId} (${snapshot.workerQueue.activeJob.path})`
        : `Worker ${snapshot.workerQueue.workerAddress} Idle`
      : 'Worker 10.41 Idle',
    queueJobs: snapshot.workerQueue?.pendingJobs ?? [],
    dnsStatsLabel: `Lookups: ${snapshot.dns?.lookups ?? 0} · Cached: ${
      snapshot.dns?.cachedHits ?? 0
    } · Authoritative: ${snapshot.dns?.authoritative ?? 0} · TTL: ${snapshot.dns?.ttlTicks ?? DEFAULT_DNS_TTL_TICKS}t`,
    // PINS: the DNS ledger renders one row per live cache entry — name,
    // resolved target, ticks left — the Map on screen, not an aggregate.
    dnsEntries: snapshot.dns?.cache ?? [],
    // CHECKS (Stage 6b): the edge HUD mirrors the fill ledger's counters and
    // TTL from the live snapshot — hits/misses/fills are the edge's own
    // lookup tally, and rows carry the per-entry remaining ticks.
    cdnStatsLabel: `Hits: ${snapshot.cdn?.hits ?? 0} · Misses: ${snapshot.cdn?.misses ?? 0} · Fills: ${
      snapshot.cdn?.fills ?? 0
    } · TTL: ${snapshot.cdn?.ttlTicks ?? DEFAULT_TTL_TICKS}t`,
    cdnEntries: snapshot.cdn?.ledger ?? [],
    routerStatsLabel: snapshot.router
      ? `Router ${snapshot.router.address} ⇄ ${snapshot.router.rightAddress} · Routed: ${snapshot.router.routed}`
      : '',
    exchangeSummary: last
      ? `${last.from} -> ${last.to} ${last.request} => ${last.response}`
      : 'No requests served yet',
    hop,
    hopStatus: formatHopStatus(snapshot, serverAddress),
    browserStatus: snapshot.browserDisplay
      ? `${snapshot.browserDisplay.status} (${snapshot.browserDisplay.request})`
      : 'No response yet',
    browserBody: snapshot.browserDisplay
      ? snapshot.browserDisplay.body
      : 'Send a request or step a hop to render a response.',
    networkLastFrame: snapshot.lastFrame ?? 'No frames routed yet',
    matchedRouteId: snapshot.lastMatchedRoute ?? null,
  };
}
