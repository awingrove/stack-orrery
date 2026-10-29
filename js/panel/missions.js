// DOCUMENTS: the B-2 mission registry — per-stage missions (2–4 each for
// the shipped stages 1–6: stages 1 and 2 carry four with their B-6 recovery
// and B-6b failover missions) whose checks
// are pure snapshot predicates. Each
// entry is { id, goal, url?, detect(snapshot) -> boolean, progress(snapshot)
// -> string }; goals derive from the stage's try / watchFor copy in
// teaching.js (that file stays untouched), and every predicate ground a
// real engine snapshot field (engine.snapshot()): lastExchange, the trace
// record (stage-6 edgeStatus / nx), cache / database / workerQueue / dns /
// router / loadBalancer counters, and queueDepth.
//
// The sim is the referee: a mission completes only when its detect()
// predicate says so on a real snapshot — not on a button click, not on a
// narrative.
// PINS (named counter-examples, unit-pinned in test/panel/missions.test.js):
//   - a 405 response does not complete the stage-1 404 mission — a
//     wrong-path mission checks status === 404, not non-2xx;
//   - an origin cache HIT does not complete the stage-6 edge-HIT mission —
//     the predicate reads the trace's edge verdict, `edgeStatus === 'HIT'`,
//     not `cacheStatus`;
//   - B-6b: a served 10.12 count alone does not complete the failover
//     mission while the skip leg is zero, and a skip alone (backend still
//     down) does not either.

const lastStatus = (snapshot) => snapshot.lastExchange?.status ?? null;
const perBackend = (snapshot) => snapshot.loadBalancer?.perBackend ?? {};
const forwarded = (snapshot) => snapshot.loadBalancer?.forwarded ?? 0;

export const MISSIONS = {
  1: [
    {
      id: 'm1-404',
      goal: 'Get a 404 for a missing path',
      url: '/missing',
      // The newest served exchange is what actually moved on the wire; the
      // server's own 404 branch (unknown path) is the exact status checked.
      detect: (s) => lastStatus(s) === 404,
      progress: (s) => `last: ${lastStatus(s) ?? '—'}`,
    },
    {
      id: 'm1-405',
      goal: 'Send a method the server code rejects and read the 405',
      detect: (s) => lastStatus(s) === 405,
      progress: (s) => `last: ${lastStatus(s) ?? '—'}`,
    },
    {
      id: 'm1-queue-climb',
      goal: 'Drag the crowd up — arrivals outrun service and queue depth climbs past 8',
      detect: (s) => (s.queueDepth ?? 0) >= 8,
      progress: (s) => `depth: ${s.queueDepth ?? 0}`,
    },
    {
      id: 'm1-refuse-recover',
      goal: 'Take the webserver down, watch the refusal, restore it and read a 200',
      // CHECKS (B-6, DL-3 counter-example): a served 200 AFTER a refusal.
      // The refusal itself satisfies neither leg — lastStatus stays null
      // across a refusal (the transport record carries no HTTP status), so
      // the m1-404/m1-405 detectors cannot be satisfied by one either; a
      // 200 with no refusal behind it fails the first leg.
      detect: (s) => (s.refusedCount ?? 0) > 0 && lastStatus(s) === 200,
      progress: (s) => `refusals: ${s.refusedCount ?? 0} · last: ${lastStatus(s) ?? '—'}`,
    },
  ],
  2: [
    {
      id: 'm2-round-robin',
      goal: 'Send requests and watch Next -> flip — both 10.11 and 10.12 serve their share',
      detect: (s) => (perBackend(s)['10.11'] ?? 0) >= 1 && (perBackend(s)['10.12'] ?? 0) >= 1,
      progress: (s) =>
        `10.11: ${perBackend(s)['10.11'] ?? 0} · 10.12: ${perBackend(s)['10.12'] ?? 0}`,
    },
    {
      id: 'm2-forwarded',
      goal: 'Forward 6+ requests in total through the LoadBalancer VIP',
      detect: (s) => forwarded(s) >= 6,
      progress: (s) => `forwarded: ${forwarded(s)}`,
    },
    {
      id: 'm2-failover',
      goal: 'Take backend 10.12 down, keep serving, restore it and see it rejoin the rotation',
      // CHECKS (B-6b, DL-3 counter-example): the skip leg reads the engine
      // snapshot's own skip tally, the rejoin leg reads 10.12's per-backend
      // count — a skip alone leaves 10.12 frozen while the fault is on, and
      // a 10.12 count with no skip behind it satisfies neither leg.
      detect: (s) => (s.skippedCount ?? 0) > 0 && (perBackend(s)['10.12'] ?? 0) >= 1,
      progress: (s) => `skips: ${s.skippedCount ?? 0} · 10.12: ${perBackend(s)['10.12'] ?? 0}`,
    },
  ],
  3: [
    {
      id: 'm3-fill',
      goal: 'Fill the cache-aside entry — a miss pulls from the origin and sets /about',
      detect: (s) => (s.cache?.sets ?? 0) >= 1,
      progress: (s) => `sets: ${s.cache?.sets ?? 0}`,
    },
    {
      id: 'm3-hit',
      goal: 'Serve a 200 from the shared Cache 10.20 after the fill',
      detect: (s) => (s.cache?.hits ?? 0) >= 1,
      progress: (s) => `hits: ${s.cache?.hits ?? 0}`,
    },
    {
      id: 'm3-expire',
      goal: 'Run the TTL out — watch the entry evict and the next lookup miss again',
      detect: (s) => (s.cache?.evictions ?? 0) >= 1,
      progress: (s) => `evictions: ${s.cache?.evictions ?? 0}`,
    },
  ],
  4: [
    {
      id: 'm4-write',
      goal: 'Send the POST — Primary 10.30 writes through and the cached copy invalidates',
      detect: (s) => (s.database?.writes ?? 0) >= 1,
      progress: (s) => `writes: ${s.database?.writes ?? 0}`,
    },
    {
      id: 'm4-stale',
      goal: 'GET inside the lag window — read a STALE row from Replica 10.31',
      detect: (s) => (s.database?.staleReads ?? 0) >= 1,
      progress: (s) => `stale reads: ${s.database?.staleReads ?? 0}`,
    },
    {
      id: 'm4-catchup',
      goal: 'Keep reading past the lag — rows catch up to P v2 · R v2',
      detect: (s) =>
        (s.database?.replicated ?? 0) >= 1 &&
        (s.database?.pendingReplication ?? 0) === 0 &&
        (s.database?.rows ?? []).every((row) => !row.lagging),
      progress: (s) => `replicated: ${s.database?.replicated ?? 0}`,
    },
  ],
  5: [
    {
      id: 'm5-202',
      goal: 'Trace POST /jobs — take the 202 Accepted before any work runs',
      detect: (s) => (s.workerQueue?.enqueued ?? 0) >= 1,
      progress: (s) => `enqueued: ${s.workerQueue?.enqueued ?? 0}`,
    },
    {
      id: 'm5-commit',
      goal: 'Watch Worker 10.41 dequeue the job and commit it to Primary 10.30',
      detect: (s) => (s.workerQueue?.completed ?? 0) >= 1,
      progress: (s) => `completed: ${s.workerQueue?.completed ?? 0}`,
    },
    {
      id: 'm5-drain',
      goal: 'Step or start until the backlog drains — worker idle, zero pending',
      detect: (s) =>
        (s.workerQueue?.completed ?? 0) >= 1 &&
        (s.workerQueue?.completed ?? 0) >= (s.workerQueue?.enqueued ?? 0) &&
        (s.workerQueue?.pendingJobs ?? []).length === 0 &&
        !s.workerQueue?.activeJob,
      progress: (s) => `pending: ${(s.workerQueue?.pendingJobs ?? []).length}`,
    },
  ],
  6: [
    {
      id: 'm6-dns',
      goal: 'Trace a hosted URL — DNS 10.60 answers the ask for example.com',
      detect: (s) => (s.dns?.lookups ?? 0) >= 1,
      progress: (s) => `lookups: ${s.dns?.lookups ?? 0}`,
    },
    {
      id: 'm6-router',
      goal: 'Cross the Router into 20.x — Routed counts the cd.example.com round trip',
      detect: (s) => (s.router?.routed ?? 0) >= 3,
      progress: (s) => `routed: ${s.router?.routed ?? 0}`,
    },
    {
      id: 'm6-edge-hit',
      goal: 'Serve an edge HIT at the CDN',
      url: 'cd.example.com/about',
      // The edge's own verdict on the trace, not the origin cache tier:
      // a HIT inside the pull's cache-aside lookup must not complete here.
      detect: (s) => s.trace?.edgeStatus === 'HIT',
      progress: (s) => `fills: ${s.cdn?.fills ?? 0}`,
    },
  ],
};

// CHECKS: pure field pass — DOM-free (no element access, no writes). Each
// status carries { id, goal, url, done, completedTick, progress }: the
// verified Map (mission id -> completing tick) wins wherever it holds — a
// verified mission does not un-verify while the clock runs — and a fresh
// detection records the snapshot's own tick for the view to store. An
// unknown stage returns an empty list (no throw; the drawer renders no
// rows at all).
export function missionStatuses(stage, snapshot, verified) {
  return (MISSIONS[stage] ?? []).map((mission) => {
    const done = verified.has(mission.id) || Boolean(mission.detect(snapshot));
    const completedTick = done ? (verified.get(mission.id) ?? snapshot.tick) : null;
    return {
      id: mission.id,
      goal: mission.goal,
      url: mission.url ?? null,
      done,
      completedTick,
      progress: mission.progress(snapshot),
    };
  });
}
