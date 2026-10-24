// DOCUMENTS: the Stage 6a cross-subnet Router — it joins the flat 10.x
// network instance with a 20.x one. Same-subnet frames ride the left
// network's existing send/deliverToQueue contract untouched (the engine's
// crowd path keeps working exactly as in stages 1-5); a frame addressed
// into the right subnet takes exactly one router hop (`routed` increments
// once) and is handed to the right network, which resolves the target or
// fails loud. Nothing lives in subnet 20 in 6a besides the router's own
// presence: its right-side interface is registered at `rightAddress`, so
// `20.1` stays the only reachable target (stage 6b seats the CDN edge
// there) — a send to an unregistered `20.9` throws at the wire.
//
// CHECKS: both addresses validate as two-number mini-IPs and both network
// instances must attach; a route() with no networks is a mis-configured
// topology and fails at construction instead of at first traffic.
const MINI_IP = /^\d+\.\d+$/;

const subnetOf = (address) => String(address).split('.')[0];

export function createRouter({
  leftAddress = '10.65',
  rightAddress = '20.1',
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
  // `rightAddress` that answers its identity on the wire (nothing else in
  // subnet 20 in 6a).
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

    // CHECKS: one cross-subnet frame = one router hop. A left-subnet target
    // delegates to leftNetwork.deliverToQueue verbatim (routed untouched,
    // isYou rides through); a right-subnet target increments `routed` once
    // and re-delivers through the right network — an unregistered host such
    // as `20.9` throws `network: no server at 20.9` (fail-loud, pinned in
    // test/sim/router.test.js).
    forward({ id, from, to, request, atTick, isYou = false } = {}) {
      const frame = { id, from, to, request, atTick, isYou };
      if (subnetOf(to) !== subnetOf(rightAddress)) {
        leftNetwork.deliverToQueue(frame);
        return { from, to, via: null };
      }
      routed += 1;
      lastCross = { from, to, request, isYou };
      rightNetwork.deliverToQueue(frame);
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
