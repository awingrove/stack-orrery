// CHECKS: full-review finding 3-01 — the registry is the sim's composition
// truth: the engine composes it at construction from the per-stage
// component stack, and the panel's Network inspector reads this
// read-side instead of rebuilding a per-stage ternary. Option (a)'s
// registry off network.registerServer was REJECTED on the walk: DNS, the
// cache, the database pair, the worker pair and the stage-6 fabric seats
// are composition knowledge the network never registered, so a network
// read-side returns a partial row list and the finding's truthfulness
// drift reenters through the missing rows. Option (b) lives in the SIM
// layer: rows accumulate by stage family, one ordered row list per
// family, array-concated in collected order — a Stage-7 component means
// adding rows here, and the panel's shape refits with no stage branch.
// The engine snapshot carries it verbatim (`registry` in snapshot()); the
// point of truth stays SIM-side.
//
// CHECKS: addresses are quoted string mini-IPs — a bare `10.20` literal
// collapses to the number 10.2 and collides with the browser's mini-IP
// (the inspector-state quoting rule). The stage-1 seat names WebServer —
// no load balancer exists there yet; at stage 2 the pool's LB row
// supersedes 10.1's role and opens the accumulated table.
//
// Stage 1 owns the solo webserver seat; the ladder's stage-2 family
// carries the shared pool base (LB + both backends) and later families
// carry the rows each stage introduces.
const SOLO_ROWS = [{ address: '10.1', role: 'WebServer' }];

const POOL_ROWS = [
  { address: '10.1', role: 'LoadBalancer' },
  { address: '10.11', role: 'WebServer-1' },
  { address: '10.12', role: 'WebServer-2' },
];

const LADDER_ROWS = [
  { stage: 2, rows: POOL_ROWS },
  { stage: 3, rows: [{ address: '10.20', role: 'Cache' }] },
  {
    stage: 4,
    rows: [
      { address: '10.30', role: 'Database (Primary)' },
      { address: '10.31', role: 'Database (Replica)' },
    ],
  },
  {
    stage: 5,
    rows: [
      { address: '10.40', role: 'WorkerQueue' },
      { address: '10.41', role: 'Worker' },
    ],
  },
  {
    stage: 6,
    rows: [
      { address: '10.60', role: 'DNS' },
      { address: '10.65', role: 'Router (left)' },
      { address: '20.254', role: 'Router (right)' },
      { address: '20.1', role: 'CDN edge' },
    ],
  },
];

// DOCUMENTS: rows accumulate below-and-including `stage`, so buildRegistry(3)
// holds the full stage-2 table plus the Cache row — the returned list is the
// ordered snapshot the panel spreads into the interfaces shape.
export function buildRegistry(stage) {
  if (stage === 1) return SOLO_ROWS.concat();
  let rows = [];
  for (const family of LADDER_ROWS) {
    if (stage >= family.stage) rows = rows.concat(family.rows);
  }
  return rows;
}
