// DOCUMENTS: the stage-6 component fabric — the authoritative DNS (10.60,
// tick-TTL ledger), the cross-subnet Router (10.65 ⇄ 20.254 — Stage 6b
// re-seat; the edge owns 20.1), and the CDN edge on the right network —
// split from engine.js by responsibility (guard-file-size) the way
// trace-stage6.js split the stage-6 machine out. Same constructor config,
// same wiring, same registration order: the fabric only assembles what
// createEngine handed it (the left network) and returns the parts the
// engine's own snapshot and trace machine consume.
import { createNetwork } from './network.js';
import { createDns } from './dns.js';
import { createRouter } from './router.js';
import { createCdnEdge } from './cdn.js';

export function createStage6Fabric({
  serverAddress,
  dnsAddress,
  dnsTtlTicks,
  routerLeftAddress,
  routerRightAddress,
  cdnAddress,
  edgeTtlTicks,
  leftNetwork,
}) {
  const rightNetwork = createNetwork();
  const dns = createDns({ address: dnsAddress, ttlTicks: dnsTtlTicks });
  // CHECKS (Stage 6b re-seat): the router sits 10.65 ⇄ 20.254, joining the
  // left network it is handed with the right one it owns here; the edge
  // instantiates on the right network at `cdnAddress` (default 20.1) next
  // to the router's re-seated right-side seat. The edge's seat receives
  // the frames the Router delivers into subnet 20 (the same seat pattern
  // the router itself uses); the real ledger decision runs through
  // edge.lookup inside the trace machine.
  const router = createRouter({
    leftAddress: routerLeftAddress,
    rightAddress: routerRightAddress,
    leftNetwork,
    rightNetwork,
  });
  const edge = createCdnEdge({
    address: cdnAddress,
    ttlTicks: edgeTtlTicks,
    originAddress: serverAddress,
  });
  rightNetwork.registerServer(cdnAddress, {
    handleRequest: () => `200 CDN edge ${cdnAddress}`,
    enqueue: (frame) => frame,
  });
  return { dns, rightNetwork, router, edge };
}
