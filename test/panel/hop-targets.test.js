import { describe, it, expect } from 'vitest';
import { activeHopTarget } from '../../js/panel/hop-targets.js';

// DOCUMENTS: the hop → (card, wire-lane) mapping's first unit pin (full-review
// finding 6-07). The snapshots are minimal — activeHopTarget reads only
// snapshot.stage and snapshot.trace fields — so each case below names the
// identity it constrains: stages 1..4 chain hops rear-to-front, stage-5's
// async/sync split, and stage-6's three delegation shapes. e2e exercises the
// DOM side of these rows through e2e/panel-stage6.spec.js's active-hop /
// lane-active selectors.
const snap = (stage, trace) => ({ stage, trace });
const pairOf = (cardId, laneId) => ({ cardId, laneId });
const expectPair = (target, cardId, laneId) => {
  expect(target).toEqual(pairOf(cardId, laneId));
};

describe('the hop mapping is pinned — stage 1..4 chains switch on targetServer and dbOp, stage-5 async vs sync counter-examples, and stage-6 reuses stage-5 at hop - 2 with the DNS prelude', () => {
  it('stage 1 chains emit, route, serve, render — with the browser pair as the only fallback', () => {
    expectPair(activeHopTarget(snap(1, { hop: 1 })), 'node-browser', 'packet-req-left');
    expectPair(activeHopTarget(snap(1, { hop: 2 })), 'node-network', 'packet-req-right');
    expectPair(activeHopTarget(snap(1, { hop: 3 })), 'node-webserver', 'packet-res-right');
    expectPair(activeHopTarget(snap(1, { hop: 4 })), 'node-browser', 'packet-res-left');
    expectPair(activeHopTarget(snap(1, { hop: 6 })), 'node-browser', 'packet-req-left');
  });

  it('stages 2..4 switch the backend card on trace.targetServer and the db lane on trace.dbOp', () => {
    // PINS: targetServer 10.12 promotes the backend card everywhere a
    // backend card speaks (stages 2, 3, 4); a non-10.12 target keeps
    // 'node-webserver'.
    expectPair(
      activeHopTarget(snap(2, { hop: 4, targetServer: '10.12' })),
      'node-webserver-2',
      'packet-res-lb',
    );
    expectPair(
      activeHopTarget(snap(3, { hop: 5, targetServer: '10.12' })),
      'node-webserver-2',
      'packet-res-cache',
    );
    expectPair(
      activeHopTarget(snap(4, { hop: 6, targetServer: '10.12', dbOp: 'WRITE' })),
      'node-webserver-2',
      'packet-res-cache',
    );
    expectPair(
      activeHopTarget(snap(2, { hop: 4, targetServer: '10.11' })),
      'node-webserver',
      'packet-res-lb',
    );
    // PINS: the counter-example — the db lane reads the OP.
    expectPair(activeHopTarget(snap(4, { hop: 5, dbOp: 'WRITE' })), 'node-db', 'packet-req-db');
    expectPair(activeHopTarget(snap(4, { hop: 5, dbOp: 'READ' })), 'node-db', 'packet-res-db');
    expectPair(activeHopTarget(snap(4, { hop: 1 })), 'node-browser', 'packet-req-left');
    expectPair(activeHopTarget(snap(4, { hop: 4 })), 'node-cache', 'packet-req-cache');
  });

  it('stage-5 async vs sync counter-examples — hops 4, 5, 8 differ', () => {
    // PINS: named counter-examples — async hop 4 hands to the queue and
    // hop 8 rides the db answer lane; sync hop 4 dives to the database
    // and hop 8 rides the worker lane. Async hop 5 hardcodes
    // 'node-webserver' (enqueue) even when targetServer says 10.12,
    // while sync hop 5 speaks from the backendCard.
    expectPair(
      activeHopTarget(snap(5, { hop: 4, asyncJob: true })),
      'node-queue',
      'packet-req-queue',
    );
    expectPair(
      activeHopTarget(snap(5, { hop: 4, asyncJob: false, dbOp: 'WRITE' })),
      'node-db',
      'packet-req-db',
    );
    expectPair(
      activeHopTarget(snap(5, { hop: 8, asyncJob: true })),
      'node-worker',
      'packet-res-db',
    );
    expectPair(
      activeHopTarget(snap(5, { hop: 8, asyncJob: false })),
      'node-worker',
      'packet-res-worker',
    );
    expectPair(
      activeHopTarget(snap(5, { hop: 5, asyncJob: true, targetServer: '10.12' })),
      'node-webserver',
      'packet-res-cache',
    );
    expectPair(
      activeHopTarget(snap(5, { hop: 5, asyncJob: false, targetServer: '10.12' })),
      'node-webserver-2',
      'packet-res-cache',
    );
  });

  it('stage-6 host-less reuses the stage-5 table verbatim at hop itself', () => {
    // PINS: host-less hop identity across every stage-5 hop and the
    // trace-field routing (targetServer, dbOp) carries through.
    for (const asyncJob of [true, false])
      for (const hop of [1, 2, 3, 4, 5, 6, 7, 8]) {
        expect(
          activeHopTarget(snap(6, { hop, asyncJob, dbOp: 'WRITE', targetServer: '10.12' })),
        ).toEqual(
          activeHopTarget(snap(5, { hop, asyncJob, dbOp: 'WRITE', targetServer: '10.12' })),
        );
      }
  });

  it('stage-6 hosted hops 1-2 are the DNS prelude and hop 0 lights nothing', () => {
    expectPair(
      activeHopTarget(snap(6, { hop: 1, host: 'example.com' })),
      'node-dns',
      'packet-req-dns',
    );
    expectPair(
      activeHopTarget(snap(6, { hop: 2, host: 'example.com' })),
      'node-browser',
      'packet-res-dns',
    );
    // PINS: the prelude branch keeps its undefined pair — no card or lane
    // exists to highlight before hop 1's ask.
    expect(activeHopTarget(snap(6, { hop: 0, host: 'example.com' }))).toEqual(
      pairOf(undefined, undefined),
    );
  });

  it('stage-6 hosted resolved chain replays stage-5 at hop - 2', () => {
    // PINS: the +2 shift is the delegation, not a copy — hosted hops map
    // onto the host-less table through the arithmetic.
    const hosted = { host: 'example.com', targetServer: '10.12', dbOp: 'READ' };
    expect(activeHopTarget(snap(6, { ...hosted, hop: 3 }))).toEqual(
      activeHopTarget(snap(5, { ...hosted, hop: 1 })),
    );
    expect(activeHopTarget(snap(6, { ...hosted, hop: 6 }))).toEqual(
      activeHopTarget(snap(5, { ...hosted, hop: 4 })),
    );
    expect(activeHopTarget(snap(6, { ...hosted, hop: 7 }))).toEqual(
      activeHopTarget(snap(5, { ...hosted, hop: 5 })),
    );
    expectPair(
      activeHopTarget(snap(6, { ...hosted, hop: 7 })),
      'node-webserver-2',
      'packet-res-cache',
    );
  });

  it('stage-6 CDN — HIT spans hops 3..6 plus render 9; MISS/PASS pulls the origin through hop 9', () => {
    // PINS: the HIT branch shape — hop 3 Router, hop 4 the edge's word,
    // hop 5 back on the Router, hop 6 the browser render; hop 7 falls out
    // of the table onto the browser pair.
    const cdn = { host: 'cd.example.com', cdn: true };
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 3, edgeStatus: 'HIT' })),
      'node-router',
      'packet-req-cdn',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 4, edgeStatus: 'HIT' })),
      'node-cdn',
      'packet-res-cdn',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 5, edgeStatus: 'HIT' })),
      'node-router',
      'packet-res-cdn',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 6, edgeStatus: 'HIT' })),
      'node-browser',
      'packet-res-left',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 9, edgeStatus: 'HIT' })),
      'node-browser',
      'packet-res-left',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 7, edgeStatus: 'HIT' })),
      'node-browser',
      'packet-req-left',
    );
    // PINS: the MISS/PASS branch is the 9-hop shape —MISS hop 7 pulls the
    // origin (backendCard) and the render lands at hop 9; PASS shares it.
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 5, edgeStatus: 'MISS' })),
      'node-router',
      'packet-req-cdn',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 6, edgeStatus: 'MISS' })),
      'node-lb',
      'packet-req-lb',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 7, edgeStatus: 'MISS', targetServer: '10.12' })),
      'node-webserver-2',
      'packet-res-cache',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 8, edgeStatus: 'MISS' })),
      'node-cdn',
      'packet-res-cdn',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 9, edgeStatus: 'MISS' })),
      'node-browser',
      'packet-res-left',
    );
    expectPair(
      activeHopTarget(snap(6, { ...cdn, hop: 8, edgeStatus: 'PASS' })),
      'node-cdn',
      'packet-res-cdn',
    );
  });
});
