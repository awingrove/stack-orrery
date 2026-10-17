// DOCUMENTS: a round-robin load balancer at a public mini-IP (default 10.1).
// Holds an ordered list of backend server mini-IPs (e.g. ['10.11', '10.12'])
// and a cursor `nextIndex`. Each incoming request selects
// `backends[nextIndex]`, advances `nextIndex = (nextIndex + 1) % backends.length`,
// and forwards the request across the network to that backend's queue or
// synchronous handler.
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
  let lastTarget = null;

  function selectBackend() {
    const target = pool[nextIndex];
    nextIndex = (nextIndex + 1) % pool.length;
    forwarded += 1;
    perBackend[target] += 1;
    lastTarget = target;
    return target;
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

    handleRequest(request = 'GET /') {
      if (!network) throw new Error('loadbalancer: no network attached');
      const target = selectBackend();
      return network.send({ from: address, to: target, request }).response;
    },

    enqueue({ id, atTick, from = '10.2', request = 'GET /', isYou = false }) {
      if (!network) throw new Error('loadbalancer: no network attached');
      const target = selectBackend();
      network.deliverToQueue({ id, from, to: target, request, atTick, isYou });
      return target;
    },

    snapshot() {
      return {
        address,
        algorithm: 'round-robin',
        backends: [...pool],
        nextBackend: pool[nextIndex],
        forwarded,
        lastTarget,
        perBackend: { ...perBackend },
      };
    },
  };
}
