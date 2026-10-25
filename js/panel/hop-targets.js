// DOCUMENTS: the hop → (card, wire-lane) highlight mapping, split from
// render-stage.js by responsibility (guard-file-size): render-stage owns
// the topology/hud DOM writes; this module owns which card executes the
// active hop and which lane carries it. Zero engine knowledge: snapshots
// in, ids out (unit-pinned shapes in test/panel/render.test.js and
// model-stage6.test.js).
//
// Which card executes the hop, and which wire lane carries it:
// Stage 1 is emit / route / serve / render; Stage 2 inserts the LB's
// round-robin pick; Stage 3 splits the backend serve into the cache
// lookup (Cache 10.20 answers) and the response emission; Stage 4 adds
// the database hop; Stage 5 adds async worker queue processing. Stage 6
// re-uses this stage-5 mapping (host-less verbatim; hosted hops > 2 off by
// exactly the +2 DNS prelude) and owns its hops 1-2 below.
function stage5HopTarget(snapshot, hop) {
  const backendCard =
    snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
  const dbLane = snapshot.trace?.dbOp === 'WRITE' ? 'packet-req-db' : 'packet-res-db';
  const owners = snapshot.trace?.asyncJob
    ? {
        1: 'node-browser',
        2: 'node-network',
        3: 'node-lb',
        4: 'node-queue',
        5: 'node-webserver',
        6: 'node-network',
        7: 'node-browser',
        8: 'node-worker',
      }
    : {
        1: 'node-browser',
        2: 'node-network',
        3: 'node-lb',
        4: 'node-db',
        5: backendCard,
        6: 'node-network',
        7: 'node-browser',
        8: 'node-worker',
      };
  const lanes = snapshot.trace?.asyncJob
    ? {
        1: 'packet-req-left',
        2: 'packet-req-right',
        3: 'packet-req-lb',
        4: 'packet-req-queue',
        5: 'packet-res-cache',
        6: 'packet-res-right',
        7: 'packet-res-left',
        8: 'packet-res-db',
      }
    : {
        1: 'packet-req-left',
        2: 'packet-req-right',
        3: 'packet-req-lb',
        4: dbLane,
        5: 'packet-res-cache',
        6: 'packet-res-right',
        7: 'packet-res-left',
        8: 'packet-res-worker',
      };
  return { cardId: owners[hop] ?? 'node-browser', laneId: lanes[hop] ?? 'packet-req-left' };
}

// Stage 6b CDN chain highlights: hop 3 is the Router carrying the GET into
// subnet 20 (the edge wire's request lane); hop 4 is the edge's own word
// (HIT serve / MISS announce / pass-through announce) on its response lane;
// the reverse legs and the MISS pull ride the Router lane, the fill lands
// back on the edge lane, and the final render is the browser's.
function cdnHopTarget(snapshot, hop) {
  const backendCard =
    snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
  const isHit = snapshot.trace?.edgeStatus === 'HIT';
  const owners = isHit
    ? { 3: 'node-router', 4: 'node-cdn', 5: 'node-router', 6: 'node-browser' }
    : {
        3: 'node-router',
        4: 'node-cdn',
        5: 'node-router',
        6: 'node-lb',
        7: backendCard,
        8: 'node-cdn',
      };
  const lanes = isHit
    ? { 3: 'packet-req-cdn', 4: 'packet-res-cdn', 5: 'packet-res-cdn', 6: 'packet-res-left' }
    : {
        3: 'packet-req-cdn',
        4: 'packet-res-cdn',
        5: 'packet-req-cdn',
        6: 'packet-req-lb',
        7: 'packet-res-cache',
        8: 'packet-res-cdn',
      };
  // The final browser render is hop 9 on the MISS/pass shape (hop 6 on a
  // HIT above); the render lane is the home wire's left response lane,
  // exactly as the stage-5 chain's render hop.
  const tail = { 9: 'node-browser' };
  const tailLanes = { 9: 'packet-res-left' };
  return {
    cardId: owners[hop] ?? tail[hop] ?? 'node-browser',
    laneId: lanes[hop] ?? tailLanes[hop] ?? 'packet-req-left',
  };
}

export function activeHopTarget(snapshot) {
  const hop = snapshot.trace?.hop ?? 0;
  if (snapshot.stage === 6) {
    if (!snapshot.trace?.host) return stage5HopTarget(snapshot, hop);
    if (snapshot.trace?.cdn) return cdnHopTarget(snapshot, hop);
    if (hop <= 2) {
      // Hops 1-2 of the hosted shape: the browser asks DNS 10.60 and the
      // ledger answers on its wire lane; NX and resolved answers share the
      // lanes (both write the packet-res-dns answer lane at hop 2). There
      // is no card highlight before hop 1's ask — no GET exists on the wire
      // yet.
      const owners = { 1: 'node-dns', 2: 'node-browser' };
      const lanes = { 1: 'packet-req-dns', 2: 'packet-res-dns' };
      return { cardId: owners[hop], laneId: lanes[hop] };
    }
    // The resolved chain replays the stage-5 cards two hops deeper.
    return stage5HopTarget(snapshot, hop - 2);
  }
  if (snapshot.stage === 5) {
    return stage5HopTarget(snapshot, hop);
  }
  if (snapshot.stage === 4) {
    const backendCard =
      snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
    const dbLane = snapshot.trace?.dbOp === 'WRITE' ? 'packet-req-db' : 'packet-res-db';
    const owners = {
      1: 'node-browser',
      2: 'node-network',
      3: 'node-lb',
      4: 'node-cache',
      5: 'node-db',
      6: backendCard,
      7: 'node-browser',
    };
    const lanes = {
      1: 'packet-req-left',
      2: 'packet-req-right',
      3: 'packet-req-lb',
      4: 'packet-req-cache',
      5: dbLane,
      6: 'packet-res-cache',
      7: 'packet-res-left',
    };
    return { cardId: owners[hop], laneId: lanes[hop] };
  }
  if (snapshot.stage === 3) {
    const backendCard =
      snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
    const owners = {
      1: 'node-browser',
      2: 'node-network',
      3: 'node-lb',
      4: 'node-cache',
      5: backendCard,
      6: 'node-browser',
    };
    const lanes = {
      1: 'packet-req-left',
      2: 'packet-req-right',
      3: 'packet-req-lb',
      4: 'packet-req-cache',
      5: 'packet-res-cache',
      6: 'packet-res-left',
    };
    return { cardId: owners[hop], laneId: lanes[hop] };
  }
  if (snapshot.stage === 2) {
    const backendCard =
      snapshot.trace?.targetServer === '10.12' ? 'node-webserver-2' : 'node-webserver';
    const owners = {
      1: 'node-browser',
      2: 'node-network',
      3: 'node-lb',
      4: backendCard,
      5: 'node-browser',
    };
    const lanes = {
      1: 'packet-req-left',
      2: 'packet-req-right',
      3: 'packet-req-lb',
      4: 'packet-res-lb',
      5: 'packet-res-left',
    };
    return { cardId: owners[hop], laneId: lanes[hop] };
  }
  const owners = { 1: 'node-browser', 2: 'node-network', 3: 'node-webserver', 4: 'node-browser' };
  const lanes = {
    1: 'packet-req-left',
    2: 'packet-req-right',
    3: 'packet-res-right',
    4: 'packet-res-left',
  };
  return { cardId: owners[hop], laneId: lanes[hop] };
}
