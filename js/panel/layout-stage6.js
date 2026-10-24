// DOCUMENTS: the Stage-6 orrery registry additions, split from layout.js by
// responsibility (guard-file-size). Stage 6a pushes the ladder to 8 rings —
// the browser ring moves out to RING 8 and two new architectural layers
// appear: DNS 10.60 (tick-TTL ledger) on RING 7 and the cross-subnet Router
// seated beside the 10.x hub on its own ring. Geometry is deterministic
// plane math (polarToWorld), not decorative randomness.
import { polarToWorld, makeWire } from './layout-geo.js';

// Eight rings: the stage-5 stack plus RING 7 · DNS; the client ring shifts
// to RING 8 · BROWSERS (each ring's radius is still k * ringGap).
export const STAGE6_RINGS = [
  ['ring-db', 'RING 1 · DATABASE'],
  ['ring-workers', 'RING 2 · WORKERS'],
  ['ring-cache', 'RING 3 · CACHE'],
  ['ring-compute', 'RING 4 · WEBSERVERS'],
  ['ring-lb', 'RING 5 · LOADBALANCER'],
  ['ring-network', 'RING 6 · NETWORK'],
  ['ring-dns', 'RING 7 · DNS'],
  ['ring-clients', 'RING 8 · BROWSERS'],
];

// Builds the two Stage-6 nodes and their wires from the stage-5 geometry:
// node-router sits on the NETWORK ring at 150° (beside the 10.x hub), and
// node-dns on the new DNS ring at 205° (up-left of the hub). Wires stay
// spoke-shaped: hub -> router (cross-subnet gateway) and browser -> dns
// (the resolver's ask/answer lane). boundY widens the camera fit vertically
// to whichever node reaches farther from the plane's spine (+180 margin —
// the same padding computeStageLayout uses for its own bounds).
export function buildStage6Extras(gap, { network, browser }) {
  const networkRadius = 6 * gap;
  const dnsRadius = 7 * gap;
  const nodes = {
    'node-router': {
      id: 'node-router',
      ring: 'ring-network',
      radius: networkRadius,
      angleDeg: 150,
      ...polarToWorld(networkRadius, 150),
    },
    'node-dns': {
      id: 'node-dns',
      ring: 'ring-dns',
      radius: dnsRadius,
      angleDeg: 205,
      ...polarToWorld(dnsRadius, 205),
    },
  };
  const wires = [
    makeWire('wire-network-router', 'node-network', 'node-router', network, nodes['node-router']),
    makeWire('wire-browser-dns', 'node-browser', 'node-dns', browser, nodes['node-dns']),
  ];
  const reach = Math.max(
    ...Object.values(nodes).map((node) => Math.abs(node.y)),
    ...wires.flatMap((wire) => [Math.abs(wire.y1), Math.abs(wire.y2)]),
  );
  return { nodes, wires, boundY: reach + 180 };
}
