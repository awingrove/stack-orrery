// DOCUMENTS: the hop → (card, wire-lane) highlight mapping, split from render-stage.js
// by responsibility (guard-file-size). Zero engine knowledge: snapshots in, ids out.
//
// CHECKS: stages 1-4 walk to the backend in stages (1 emit/route/serve/
// render; 2 the LB's pick; 3 cache hop + emission split; 4 the db hop);
// 5 is a self-contained async/sync pair of tables (sync: backendCard at
// hop 5, worker lane at 8; async: 'node-webserver' hardcoded at hop 5, db
// answer lane at 8); 6 re-uses stage 5 (host-less at hop itself, hosted
// at hop - 2 with the +2 DNS prelude owning hops 1-2) while its CDN
// branch keeps the HIT-6 vs MISS/PASS-9 shapes. Fallbacks: the prelude
// branch returns NOTHING for hop <= 2, every other table-lacking hop
// lights the browser pair.
//
// PINS: test/panel/hop-targets.test.js::the hop mapping is pinned — stage
// 1..4 chains switch on targetServer and dbOp, stage-5 async vs sync
// counter-examples, and stage-6 reuses stage-5 at hop - 2 with the DNS
// prelude; e2e panel-stage6::should trace example.com/about with DNS ask
// + answer hops asserts the #node-dns.active-hop and
// #packet-req-dns / #packet-res-dns lane-active selectors.
const BROWSER_PAIR = ['node-browser', 'packet-req-left'];
const NOTHING = [undefined, undefined];
function pick(table, hop, fallback = BROWSER_PAIR) {
  const [cardId, laneId] = table[hop] ?? fallback;
  return { cardId, laneId };
}
const STAGE1_TABLE = {
  1: ['node-browser', 'packet-req-left'],
  2: ['node-network', 'packet-req-right'],
  3: ['node-webserver', 'packet-res-right'],
  4: ['node-browser', 'packet-res-left'],
};
// backendCard speaks the LB-pick hop; dbLane: the db leg's request lane on a WRITE.
const stage2Table = (backendCard) => ({
  1: ['node-browser', 'packet-req-left'],
  2: ['node-network', 'packet-req-right'],
  3: ['node-lb', 'packet-req-lb'],
  4: [backendCard, 'packet-res-lb'],
  5: ['node-browser', 'packet-res-left'],
});
const stage3Table = (backendCard) => ({
  1: ['node-browser', 'packet-req-left'],
  2: ['node-network', 'packet-req-right'],
  3: ['node-lb', 'packet-req-lb'],
  4: ['node-cache', 'packet-req-cache'],
  5: [backendCard, 'packet-res-cache'],
  6: ['node-browser', 'packet-res-left'],
});
const stage4Table = (backendCard, dbLane) => ({
  1: ['node-browser', 'packet-req-left'],
  2: ['node-network', 'packet-req-right'],
  3: ['node-lb', 'packet-req-lb'],
  4: ['node-cache', 'packet-req-cache'],
  5: ['node-db', dbLane],
  6: [backendCard, 'packet-res-cache'],
  7: ['node-browser', 'packet-res-left'],
});
const STAGE5_ASYNC_TABLE = {
  1: ['node-browser', 'packet-req-left'],
  2: ['node-network', 'packet-req-right'],
  3: ['node-lb', 'packet-req-lb'],
  4: ['node-queue', 'packet-req-queue'],
  5: ['node-webserver', 'packet-res-cache'], // hardcoded card (enqueue, no backend dive)
  6: ['node-network', 'packet-res-right'],
  7: ['node-browser', 'packet-res-left'],
  8: ['node-worker', 'packet-res-db'], // the async answer rides the db lane
};
const stage5SyncTable = (backendCard, dbLane) => ({
  1: ['node-browser', 'packet-req-left'],
  2: ['node-network', 'packet-req-right'],
  3: ['node-lb', 'packet-req-lb'],
  4: ['node-db', dbLane],
  5: [backendCard, 'packet-res-cache'],
  6: ['node-network', 'packet-res-right'],
  7: ['node-browser', 'packet-res-left'],
  8: ['node-worker', 'packet-res-worker'],
});
const stage5Table = (snapshot, backendCard, dbLane) =>
  snapshot.trace?.asyncJob ? STAGE5_ASYNC_TABLE : stage5SyncTable(backendCard, dbLane);
const DNS_PRELUDE_TABLE = {
  1: ['node-dns', 'packet-req-dns'], // hosted hops 1-2: the ask to DNS 10.60
  2: ['node-browser', 'packet-res-dns'], // the ledger answer (NX and resolved share the lane)
};
// hop 3 is the Router into subnet 20; hop 4 is the edge's word (HIT serve /
// MISS announce / pass-through announce); hop 9's render is the browser's (hop 6 in a HIT).
const CDN_HIT_TABLE = {
  3: ['node-router', 'packet-req-cdn'],
  4: ['node-cdn', 'packet-res-cdn'],
  5: ['node-router', 'packet-res-cdn'],
  6: ['node-browser', 'packet-res-left'],
  9: ['node-browser', 'packet-res-left'],
};
const cdnMissTable = (backendCard) => ({
  3: ['node-router', 'packet-req-cdn'],
  4: ['node-cdn', 'packet-res-cdn'],
  5: ['node-router', 'packet-req-cdn'],
  6: ['node-lb', 'packet-req-lb'],
  7: [backendCard, 'packet-res-cache'],
  8: ['node-cdn', 'packet-res-cdn'],
  9: ['node-browser', 'packet-res-left'],
});
export function activeHopTarget(snapshot) {
  const { stage, trace } = snapshot;
  const hop = trace?.hop ?? 0;
  const backendCard = trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
  const dbLane = trace?.dbOp === 'WRITE' ? 'packet-req-db' : 'packet-res-db';
  if (stage === 6) {
    if (!trace?.host) return pick(stage5Table(snapshot, backendCard, dbLane), hop);
    if (trace?.cdn) {
      if (trace?.edgeStatus === 'HIT') return pick(CDN_HIT_TABLE, hop);
      return pick(cdnMissTable(backendCard), hop);
    }
    if (hop <= 2) return pick(DNS_PRELUDE_TABLE, hop, NOTHING);
    return pick(stage5Table(snapshot, backendCard, dbLane), hop - 2); // +2 prelude shift
  }
  if (stage === 5) return pick(stage5Table(snapshot, backendCard, dbLane), hop);
  if (stage === 4) return pick(stage4Table(backendCard, dbLane), hop);
  if (stage === 3) return pick(stage3Table(backendCard), hop);
  if (stage === 2) return pick(stage2Table(backendCard), hop);
  return pick(STAGE1_TABLE, hop);
}
