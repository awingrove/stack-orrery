// DOCUMENTS: per-stage teaching content for the teaching drawer — the
// narrative layer that names the mechanism the app shows (from js/sim) AND
// the system-design-primer vocabulary, mirroring the scaling ladder
// (content only; panel.js renders it). One entry per built stage, keyed by
// shipped stage (1-6); each entry spells its trade-off sentence in the
// primer's "everything is a trade-off" register.
const PRIMER = 'https://github.com/donnemartin/system-design-primer#';

export const STAGE_TEACHING = {
  1: {
    headline: 'Single server — arrivals outrun service, so the FIFO queue climbs',
    teaches: [
      "Every browser request lands in WebServer 10.1's FIFO queue and waits for the 4-requests-per-tick service rate.",
      'When arrivals per tick exceed service, queue depth keeps climbing and avg latency rises — a performance problem, not yet a scalability fix.',
      'The wire speaks the slim protocol: "GET /about" out, "200 …" back, and the server\'s own "404 …" / "405 …" for unknown paths and methods.',
      'Flip the Faults rail tab switch to take WebServer 10.1 down — sends come back as connection refused, nothing enters the FIFO queue, and the next trace refuses too until you restore it.',
    ],
    try: [
      'Drag Browsers up to 50 and press Start — queue depth must climb past the service rate.',
      'Press Step 1 tick repeatedly and watch the queue drain one request at a time.',
      'Type a missing path in the mini-browser and read the 404 the server code itself answers.',
    ],
    watchFor: [
      'Queue depth (and the you-pill marking YOUR request in line) growing while Start runs.',
      'Avg latency holding at 100 ms+ once waits stack up.',
      'The served card counting completions while arrivals outrun them — served-rate stays at or below the 4/t service ceiling.',
    ],
    tradeoff:
      'A strong server delays the ceiling but still owns one queue and one limit — scale-up alone only pushes the cliff further away.',
    primerLink: {
      label: 'Performance vs scalability — system-design-primer',
      url: `${PRIMER}performance-vs-scalability`,
    },
  },
  2: {
    headline: 'Round-robin LoadBalancer splits requests across duplicated servers 10.11 / 10.12',
    teaches: [
      'WebServer-1 (10.11) and WebServer-2 (10.12) are identical clones behind the LoadBalancer VIP 10.1.',
      'The LoadBalancer deals requests strictly round-robin — Next -> alternates 10.11, 10.12, 10.11…',
      "Each duplicated backend serves half the arrivals, so each queue drains twice as fast as Stage 1's single queue.",
      'Fault #2 on the Faults tab shows graceful degradation: take 10.12 down and the pool keeps serving on 10.11 while the cursor skips it — restore and the rotation takes 10.12 back.',
    ],
    try: [
      "Double the Browsers slider and compare each backend's queue with Stage 1 at half the user count — depth ends up the same per server.",
      'Send two requests in a row and watch Next -> flip from 10.11 to 10.12 in the backend pool list.',
      'Open the loadbalancer tab and read forwardedTotal climb while each route item counts its own share.',
    ],
    watchFor: [
      'lb-backend-1 and lb-backend-2 counters moving in lockstep — the split is even by construction.',
      'The "Next -> 10.11 / 10.12" chip on the LB card flipping every request.',
      'One VIP still fronts both servers — every request passes through it.',
    ],
    tradeoff:
      'Duplicated servers buy capacity and remove the single server as a bottleneck, but they hand the crown to the load balancer that fronts them.',
    primerLink: {
      label: 'Load balancer — system-design-primer',
      url: `${PRIMER}load-balancer`,
    },
  },
  3: {
    headline: 'Shared cache-aside with tick-based TTL',
    teaches: [
      'Cache 10.20 sits behind both backends: a lookup misses, the WebServer fetches and sets, and the very next backend gets a HIT.',
      'Every entry carries a TTL counted in ticks; each tick decrements it and reaching 0 evicts the entry.',
      'That fill-on-miss pattern is cache-aside — the application checks the cache first and falls back to the origin on a miss.',
      'Fault #3 on the Faults tab takes the cache out of the path: GETs storm the origin as BYPASSED lookups, and because TTL expiry keeps running the whole time a long bypass rejoins cold — the first GETs after restore miss and fill anew.',
    ],
    try: [
      'Trace once from 10.11: Misses goes to 1 and the /about entry shows up with a 10t TTL.',
      'Trace again (round-robin lands on 10.12): Hits goes to 1 — one shared cache answers both backends.',
      'Run the crowd for 10+ ticks and watch the entry expire, then miss again on the next request.',
    ],
    watchFor: [
      'The Misses that warms the entry — cache-aside fills only after the miss.',
      'Hits rising no matter which backend (10.11 or 10.12) the request landed on.',
      'TTL-remaining draining to 0t and the next lookups starting a fresh miss wave.',
    ],
    tradeoff:
      'A shared cache makes every backend faster until the TTL runs out, and the origin then eats a whole wave of misses at once.',
    primerLink: {
      label: 'Cache-aside — system-design-primer',
      url: `${PRIMER}cache-aside`,
    },
  },
  4: {
    headline: 'Primary 10.30 writes, Replica 10.31 reads — replication lag is eventual consistency',
    teaches: [
      'A POST writes Primary 10.30 and invalidates the cached path; the Replica applies it after a 3t replication lag.',
      'A GET inside the lag window reads the stale row (P v2 · R v1) with the warn highlight; reads past applyAtTick land on the caught-up Replica.',
      'Data is replicated asynchronously, so reads eventually agree — the primer calls this eventual consistency.',
    ],
    try: [
      'Send the POST trace and read db-rows-list: Primary steps to v2 while Replica stays at v1.',
      'GET immediately after — hop 5/7 names "STALE (lag 3t)" mid-trace before the page renders.',
      'Keep sending GETs until the hop text flips to fresh and the row pair reads P v2 · R v2.',
    ],
    watchFor: [
      'The warn highlight on staggered rows melting away once replication catches up.',
      'Lag: 3t on the db-stats line — the window every stale read lives inside.',
      'Cache 10.20 invalidating on the write, so no stale value is re-served from cache.',
    ],
    tradeoff:
      'Asynchronous replication keeps reads fast while writes commit, at the price of accepting stale rows until the replica catches up.',
    primerLink: {
      label: 'Availability patterns — system-design-primer',
      url: `${PRIMER}availability-patterns`,
    },
  },
  5: {
    headline: 'Async Worker Queue — 202 Accepted first, Worker 10.41 commits later',
    teaches: [
      'POST /jobs answers "202 {"jobId": 1, "status": "queued"}" while the job still sits in the WorkerQueue 10.40 FIFO.',
      'Worker 10.41 dequeues jobs one by one, runs each across its duration ticks, and commits the result to Primary 10.30.',
      'The browser renders the accepted job before any work ran — latency spikes become a backlog the worker drains.',
    ],
    try: [
      'Trace the POST /jobs path and read hop 4/8 (webserver enqueues) followed by the 202 before the commit.',
      'Press Start and watch the queue pill count Enqueued/Completed while #1 leaves the pending list.',
      'Send a plain GET trace and watch hop 8/8 report the worker idle — async queues only answer async paths.',
    ],
    watchFor: [
      'The 202 landing in the browser viewport several hops before the job finishes.',
      'queue-jobs-list holding "#1 · /jobs · queued @ tick N" until the worker takes it.',
      'Hop 8/8 — Worker (10.41) processed job and committed to Database (10.30).',
    ],
    tradeoff:
      'Queuing flattens spikes by paying for them later in latency — the worker drains the backlog, but the client no longer sees the result right away.',
    primerLink: {
      label: 'Asynchronism — system-design-primer',
      url: `${PRIMER}asynchronism`,
    },
  },
  6: {
    headline: 'DNS 10.60 resolves names, the Router joins subnets, and CDN edge 20.1 fills on miss',
    teaches: [
      'A hosted URL (example.com/about) asks DNS 10.60 first: "who is example.com?" — the answer re-points the GET at the resolved mini-IP.',
      'The ledger answers from cache inside ttlTicks = 300 ticks and consults the authoritative table only on a miss or expired entry.',
      'Cross-subnet: the Router (10.65 ⇄ 20.254) counts one hop per crossing, and the CDN edge (cd.example.com → 20.1) serves a GET inside its 10t TTL from the fill ledger — a miss pulls the origin through the real LB/backend chain, then fills.',
    ],
    try: [
      'Trace cd.example.com/about once (9 hops: MISS → pull → FILL), then again — the second run ends at Hop 6/6 with the edge HITting, no origin traffic.',
      'Edit /about on WebServer-1 (10.11) and trace cd.example.com/about again: the edge still serves the OLD bytes until its TTL expires — then the pull returns the new ones.',
      'Type a missing-host URL and watch the browser render the NX card with no GET emitted anywhere downstream.',
    ],
    watchFor: [
      'The dns-entries-list row example.com · 10.1 · ttl <N>t draining toward 0t and vanishing at expiry.',
      'The Router card counting Routed: 3 on a cd.example.com/about miss — the forward hop, the origin pull, and the reverse delivery each count once.',
      'A plain /about trace running the Stage 5 hop story byte-identically — plain paths never touch DNS or the edge.',
    ],
    tradeoff:
      'An edge makes hot content cheap and far away, but it sells you staleness: edits hide behind the TTL until expiry, and the ledger only knows what once flowed through it.',
    primerLink: {
      label: "Domain Name System — system-design-primer's DNS section",
      url: `${PRIMER}domain-name-system`,
    },
  },
};

// CHECKS: describeStageTeaching falls back to a minimal pending placeholder
// for any key outside the shipped stages (a stage landing before its notes)
// — a real headline, a pending marker, and no throw; the named
// counter-example is the drawer staying readable instead of blank or crashed.
export function describeStageTeaching(stage = 1) {
  const entry = STAGE_TEACHING[stage];
  if (entry) return entry;
  return {
    headline: `Stage ${stage} notes pending`,
    teaches: [],
    try: [],
    watchFor: [],
    tradeoff:
      'Notes for this rung of the scaling ladder have not landed yet — the stage itself still runs.',
    primerLink: {
      label: 'Index of system design topics — system-design-primer',
      url: `${PRIMER}system-design-topics-start-here`,
    },
  };
}
