// DOCUMENTS: a round-robin load balancer at a public mini-IP (default 10.1).
// Holds an ordered list of backend server mini-IPs (e.g. ['10.11', '10.12'])
// and a cursor `nextIndex`. Each healthy selection takes
// `backends[nextIndex]`, advances `nextIndex = (nextIndex + 1) % backends.length`,
// and forwards the request across the network to that backend's queue or
// synchronous handler.
//
// B-6b fault behavior: the cursor is health-aware. A candidate is handed to
// the transport only when its own down flag is off — the LB consults the
// component's isDown() through the network and steps the cursor past a down
// seat to the next healthy backend. Each backend stepped over tallies
// `skipped` (cumulative; read back via skippedCount() and carried in
// snapshot(); lastSkip() names the seat the most recent selection crossed),
// while the down address sees a send or a delivery from this selection.
//
// All-down fail-out: with no healthy candidate the selection is skipped and
// the request crosses the transport to the cursor's own seat, so the
// slice-1 refusal funnel answers it — the caller receives the refusal
// record { refused: true, response: null }, nothing is enqueued, and the
// cursor / counts / skip tally are untouched by the failed pass (the scan
// is bounded by one pass over the pool).
//
// CHECKS: constructor rejects an invalid mini-IP address or an empty /
// malformed backend pool so misconfigured topologies fail loud at boot.
const MINI_IP = /^\d+\.\d+$/;

export function createLoadBalancer({
  address = '10.1',
  backends = ['10.11', '10.12'],
  network = null,
} = {}) {
  if (!MINI_IP.test(address)) {
    throw new Error(`loadbalancer: invalid mini-IP address ${address}`);
  }
  if (
    !Array.isArray(backends) ||
    backends.length === 0 ||
    !backends.every((b) => MINI_IP.test(b))
  ) {
    throw new Error('loadbalancer: backends must be a non-empty list of <net>.<host> addresses');
  }
  const pool = [...backends];
  const perBackend = Object.fromEntries(pool.map((b) => [b, 0]));
  let nextIndex = 0;
  let forwarded = 0;
  let skipped = 0;
  let lastTarget = null;
  let lastSkipped = null;

  // The LB keeps no health opinions of its own: the candidate is healthy
  // unless the network resolves it to a component whose down flag is set.
  const isHealthy = (candidate) => {
    const server = network?.resolve?.(candidate);
    return !server?.isDown?.();
  };

  // CHECKS: the scan advances the cursor across a down seat and stops at
  // the first healthy backend — the seats the pass stepped over count in
  // the skip tally only on a successful pick (lastSkipped takes the last
  // crossed seat) and the down seat is retried first on the next
  // selection; the cursor lands where the skip left it, so the healthy
  // pair's rotation pace is preserved. The failed all-down pass walks one
  // full cycle (nextIndex returns to its seat) and commits nothing:
  // forwarded, perBackend, the skip tally and lastTarget stay as found.
  function selectBackend() {
    let crossed = 0;
    let lastCrossed = null;
    for (let pass = 0; pass < pool.length; pass += 1) {
      const candidate = pool[nextIndex];
      if (isHealthy(candidate)) {
        skipped += crossed;
        lastSkipped = crossed === 0 ? null : lastCrossed;
        forwarded += 1;
        perBackend[candidate] += 1;
        lastTarget = candidate;
        nextIndex = (nextIndex + 1) % pool.length;
        return candidate;
      }
      crossed += 1;
      lastCrossed = candidate;
      nextIndex = (nextIndex + 1) % pool.length;
    }
    return null;
  }

  return {
    get address() {
      return address;
    },

    get backends() {
      return [...pool];
    },

    nextBackend() {
      return pool[nextIndex];
    },

    selectBackend,

    skippedCount() {
      return skipped;
    },

    lastSkip() {
      return lastSkipped;
    },

    handleRequest(request = 'GET /') {
      if (!network) throw new Error('loadbalancer: no network attached');
      const target = selectBackend();
      const record = network.send({ from: address, to: target ?? pool[nextIndex], request });
      // The all-down fail-out returns the funnel's refusal record itself —
      // the receiving side does not invent an HTTP response for it.
      return record.refused === true ? record : record.response;
    },

    enqueue({ id, atTick, from = '10.2', request = 'GET /', isYou = false }) {
      if (!network) throw new Error('loadbalancer: no network attached');
      const target = selectBackend();
      const outcome = network.deliverToQueue({
        id,
        from,
        to: target ?? pool[nextIndex],
        request,
        atTick,
        isYou,
      });
      // CHECKS: the normal path returns the selected backend address (the
      // trace machine narrates it); the all-down fail-out returns the
      // funnel's refusal record instead, so the caller sees the slice-1
      // shape { refused: true, response: null } and nothing was enqueued.
      return outcome ?? target;
    },

    snapshot() {
      return {
        address,
        algorithm: 'round-robin',
        backends: [...pool],
        nextBackend: pool[nextIndex],
        forwarded,
        skippedCount: skipped,
        lastTarget,
        perBackend: { ...perBackend },
      };
    },
  };
}
