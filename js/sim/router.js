// DOCUMENTS: the cross-subnet Router — it joins the flat 10.x network
// instance with a 20.x one. Frames with both ends in subnet 10 ride the
// left network's existing send/deliverToQueue contract untouched (the
// engine's crowd path keeps working exactly as in stages 1-5); a frame
// crossing between the subnets takes exactly one router hop (`routed`
// increments once per crossing, each direction counts) and is handed to the
// network of the frame's destination subnet, which resolves the target or
// fails loud. Since Stage 6b the CDN edge owns `20.1` and the router's own
// right-side seat re-seats to `rightAddress` (default `20.254`), so the
// right subnet holds the edge plus the router's seat — a send to an
// unregistered `20.9` still throws at the wire.
// CHECKS: both addresses validate as two-number mini-IPs and both network
// instances must attach; a route() with no networks is a mis-configured
// topology and fails at construction instead of at first traffic.
const MINI_IP = /^\d+\.\d+$/;

const subnetOf = (address) => String(address).split('.')[0];

export function createRouter({
  leftAddress = '10.65',
  // Stage 6b: the CDN edge owns 20.1, so the router's own right-side seat
  // re-seats to 20.254 (its identity answer follows the seat).
  rightAddress = '20.254',
  leftNetwork = null,
  rightNetwork = null,
} = {}) {
  if (!MINI_IP.test(leftAddress)) {
    throw new Error(`router: invalid mini-IP address ${leftAddress}`);
  }
  if (!MINI_IP.test(rightAddress)) {
    throw new Error(`router: invalid mini-IP address ${rightAddress}`);
  }
  if (!leftNetwork || !rightNetwork) {
    throw new Error('router: leftNetwork and rightNetwork are required');
  }

  let routed = 0;
  let lastCross = null;

  // The router's own presence on the 20-side: a resolvable seat at
  // `rightAddress` (20.254 from Stage 6b — the edge took 20.1) that
  // answers its identity on the wire.
  rightNetwork.registerServer(rightAddress, {
    handleRequest: () => `200 Router ${leftAddress} ⇄ ${rightAddress}`,
    enqueue: (frame) => frame,
  });

  return {
    get address() {
      return leftAddress;
    },

    get rightAddress() {
      return rightAddress;
    },

    // CHECKS: one cross-subnet frame = one router hop, each direction
    // counted — a frame addressed into subnet 20 (left-origin GET to the
    // edge) crosses rightward, and a frame whose source address lives in
    // subnet 20 (the edge's origin pull or its response record returning
    // to the browser) crosses leftward; both increment `routed` once and
    // both deliver on the destination subnet's network. A frame with both
    // ends in subnet 10 delegates to leftNetwork.deliverToQueue verbatim
    // (routed untouched, isYou rides through); a right-subnet destination
    // that is unregistered, such as `20.9`, still throws at the wire —
    // fail-loud, pinned in test/sim/router.test.js.
    forward({ id, from, to, request, atTick, isYou = false } = {}) {
      const frame = { id, from, to, request, atTick, isYou };
      const toRight = subnetOf(to) === subnetOf(rightAddress);
      const crosses = toRight || subnetOf(from) === subnetOf(rightAddress);
      if (!crosses) {
        leftNetwork.deliverToQueue(frame);
        return { from, to, via: null };
      }
      routed += 1;
      lastCross = { from, to, request, isYou };
      (toRight ? rightNetwork : leftNetwork).deliverToQueue(frame);
      return { from, to, via: leftAddress };
    },

    snapshot() {
      return {
        address: leftAddress,
        rightAddress,
        routed,
        lastCross,
      };
    },
  };
}
