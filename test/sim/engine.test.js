import { describe, it, expect } from 'vitest';
import { createEngine } from '../../js/sim/engine.js';
import { createRng } from '../../js/sim/rng.js';

describe('createRng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = Array.from({ length: 10 }, createRng(7));
    const b = Array.from({ length: 10 }, createRng(7));
    const c = Array.from({ length: 10 }, createRng(8));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('createEngine', () => {
  it('same seed replays the identical tick sequence', () => {
    const run = () => {
      const engine = createEngine({ seed: 7, users: 12, serviceRate: 4, arrivalProb: 0.6 });
      return Array.from({ length: 50 }, () => engine.step());
    };
    const first = run();
    const second = run();
    expect(first).toEqual(second);

    const other = createEngine({ seed: 8, users: 12, serviceRate: 4, arrivalProb: 0.6 });
    const otherRun = Array.from({ length: 50 }, () => other.step());
    expect(otherRun).not.toEqual(first);
  });

  it('advances exactly one tick per step and snapshots UI state', () => {
    const engine = createEngine({ seed: 1 });
    expect(engine.snapshot()).toMatchObject({ tick: 0, users: 5, queueDepth: 0, served: 0 });
    engine.step();
    expect(engine.snapshot().tick).toBe(1);
    engine.step();
    expect(engine.snapshot().tick).toBe(2);
    const snap = engine.snapshot();
    expect(typeof snap.avgLatencyTicks).toBe('number');
    expect(snap.avgLatencyTicks).toBeGreaterThanOrEqual(0);
  });

  it('setUsers changes the simulated user count', () => {
    const engine = createEngine({ seed: 1, users: 5 });
    engine.setUsers(30);
    expect(engine.snapshot().users).toBe(30);
  });

  it('rejects an arrivalProb outside [0, 1]', () => {
    expect(() => createEngine({ arrivalProb: 1.5 })).toThrow(/arrivalProb/);
  });

  it('rejects a stage outside 1..6', () => {
    expect(() => createEngine({ stage: 7 })).toThrow(
      /engine: stage must be 1, 2, 3, 4, 5, or 6, got 7/,
    );
  });

  // PINS: the stage-6 trace machine — hosted paths get the DNS ask/answer
  // prelude (9 hops: ask + answer + the stage-5 wire chain) and never emit
  // a GET toward a hostname; the stage-5 chain then replays byte-identical.
  it('traces example.com/about through the DNS ask/answer prelude into the stage-5 chain', () => {
    const engine = createEngine({ stage: 6 });
    const frames = [];
    for (let hop = 1; hop <= 9; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: 'example.com/about' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    expect(frames).toEqual([
      '10.2 -> 10.60 | who is example.com?',
      '10.60 -> 10.2 | 10.1',
      // Hops 3-9: the stage-5 chain shifted +2, request re-pointed by the
      // answer — no DNS tokens appear again after hop 2, and no pre-answer
      // GET frame exists anywhere.
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      'Database SELECT /about @ 10.31 (fresh)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
      'Network delivered 200 response to 10.2',
      'Browser 10.2 received and displayed 200',
      'Worker 10.41 idle — no async jobs in this trace',
    ]);
    const snap = engine.snapshot();
    expect(snap.trace.hop).toBe(9);
    expect(snap.trace.request).toBe('GET /about');
    expect(snap.trace.dnsTarget).toBe('10.1');
    // The rendered response landed on the browser exactly once.
    expect(snap.browserDisplay.body).toBe('This is the about page');
  });

  // CHECKS: named counter-example — a plain /about path keeps the stage-5
  // trace shape on stage 6 too: 8 hops, no DNS hop, no cross-subnet hop.
  it('keeps a host-less /about trace at the stage-5 hop story on stage 6', () => {
    const engine = createEngine({ stage: 6 });
    const frames = [];
    for (let hop = 1; hop <= 8; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: '/about' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    // Byte-identical to the stage-5 machine's frames.
    expect(frames).toEqual([
      '10.2 -> 10.1 | GET /about',
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      'Database SELECT /about @ 10.31 (fresh)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
      'Network delivered 200 response to 10.2',
      'Browser 10.2 received and displayed 200',
      'Worker 10.41 idle — no async jobs in this trace',
    ]);
    const snap = engine.snapshot();
    expect(snap.trace.host).toBe(null);
    expect(snap.dns.lookups).toBe(0);
  });

  // CHECKS: named counter-example — an NX answer ends the trace at hop 2, no
  // GET is emitted (no onFinish, served stays 0, and hop 1 is the DNS ask —
  // the GET never becomes a wire frame), the browser renders the NX card,
  // and a following traceHop RESTARTS a fresh trace at hop 1 (it cannot walk
  // a phantom hop 3 of the dead NX trace).
  it('ends an NX trace at the DNS answer hop without ever emitting a GET', () => {
    const engine = createEngine({ stage: 6 });
    let snap = engine.traceHop({ method: 'GET', path: 'missing-host.example/about' });
    expect(snap.lastFrame).toBe('10.2 -> 10.60 | who is missing-host.example?');
    snap = engine.traceHop();
    expect(snap.lastFrame).toBe('10.60 -> 10.2 | NX no record');
    expect(snap.trace.hop).toBe(2);
    expect(snap.trace.nx).toBe(true);
    expect(snap.browserDisplay).toMatchObject({
      status: 'NX',
      body: 'NX no record — no GET emitted',
    });
    expect(snap.cache.entries).toEqual([]); // no GET ever reached the pool
    expect(snap.queue).toEqual([]);

    // A fresh traceHop restarts cleanly — hop 1 of a new emission.
    snap = engine.traceHop({ method: 'GET', path: '/about' });
    expect(snap.trace.hop).toBe(1);
    expect(snap.trace.nx).toBe(false);
    expect(snap.lastFrame).toBe('10.2 -> 10.1 | GET /about');
    expect(engine.snapshot().served).toBe(0);
    // And the restarted trace walks the full stage-5 chain to its finish.
    for (let hop = 2; hop <= 8; hop++) snap = engine.traceHop();
    expect(snap.trace.hop).toBe(8);
    expect(snap.browserDisplay.status).toBe(200);
  });
});

// The editable filesystem (editable-fs brief): setWebFile routes the write
// to the server whose address matches and throws on a miss — no silent
// no-op. DL-1 counter-example pinned: after the write, the snapshot's own
// files, the next served GET record, and the browser's rendered body all
// carry the new bytes.
describe('createEngine setWebFile', () => {
  it('routes the write to the server at the matching mini-IP address', () => {
    const engine = createEngine({ seed: 42, stage: 1 });
    engine.setWebFile('10.1', '/about', 'New body');

    // The snapshot's files gain the new bytes without any shape change.
    const before = engine.snapshot();
    expect(before.files).toEqual({ '/': 'Welcome to the home page', '/about': 'New body' });
    expect(before.servers[0].files['/about']).toBe('New body');

    // The very next served GET record carries the new bytes on the wire
    // (seeded tick 1: 10.6 -> 10.1 GET /about, the same pin as the e2e).
    engine.step();
    const after = engine.snapshot();
    expect(after.lastExchange.request).toBe('GET /about');
    expect(after.lastExchange.response).toBe('200 New body');
    expect(after.lastMatchedRoute).toBe('route-about');

    // And the learner's own browser reads the new body off the trace.
    for (let hop = 0; hop < 4; hop++) engine.traceHop({ method: 'GET', path: '/about' });
    expect(engine.snapshot().browserDisplay.body).toBe('New body');
  });

  it("hits only the addressed server — the other backend's fs is untouched", () => {
    const engine = createEngine({ seed: 42, stage: 2 });
    engine.setWebFile('10.12', '/about', 'New body');
    const snap = engine.snapshot();
    expect(snap.servers[1].files['/about']).toBe('New body');
    expect(snap.servers[0].files['/about']).toBe('This is the about page');
  });

  it('throws for an unknown server address instead of writing nothing silently', () => {
    const engine = createEngine({ seed: 42, stage: 1 });
    expect(() => engine.setWebFile('10.99', '/about', 'New body')).toThrow(
      /no server at mini-IP 10\.99/,
    );
  });
});

describe('createEngine stage 6b — the CDN edge at 20.1', () => {
  // PINS: the edge instantiates only with the stage-6 engine, seated
  // beside the router's re-seated right leg.
  it('exposes snapshot.cdn on stage 6 and cdn: null on stages 1-5', () => {
    const snap = createEngine({ stage: 6 }).snapshot();
    expect(snap.cdn).toMatchObject({
      address: '20.1',
      originAddress: '10.1',
      ttlTicks: 10,
      hits: 0,
      misses: 0,
      fills: 0,
      ledger: [],
    });
    expect(createEngine({ stage: 5 }).snapshot().cdn).toBe(null);
  });

  // PINS: the first cd.example.com trace rides the MISS shape — the DNS
  // prelude, the forward crossing (`routed` +1), the edge's announce, the
  // REAL pull through the Router into the LB queue (`routed` +1), the
  // drained origin record with its cache-aside status, the fill + reverse
  // crossing (`routed` +1), and the render.
  it('pulls cd.example.com through the Router on an edge MISS and fills the ledger (9 hops)', () => {
    const engine = createEngine({ stage: 6 });
    const frames = [];
    for (let hop = 1; hop <= 9; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: 'cd.example.com/about' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    expect(frames).toEqual([
      '10.2 -> 10.60 | who is cd.example.com?',
      '10.60 -> 10.2 | 20.1',
      '10.2 -> 10.65 | GET /about (to 20.1)',
      '20.1 -> 10.65 | MISS — pulling origin 10.1 via router',
      '20.1 -> 10.1 | GET /about (edge pull via router)',
      'LB 10.1 -> 10.11 (GET /about) queued',
      '10.11 -> 10.65 | 200 This is the about page (cache MISS)',
      '10.65 -> 10.2 | 200 This is the about page delivered (edge FILL /about, ttl 10t)',
      'Browser 10.2 received and displayed 200',
    ]);
    const snap = engine.snapshot();
    expect(snap.router.routed).toBe(3); // forward, pull, reverse — one hop each
    expect(snap.cdn).toMatchObject({ hits: 0, misses: 1, fills: 1 });
    expect(snap.cdn.ledger).toEqual([
      { path: '/about', body: 'This is the about page', expiresAtTick: 11, ttlRemaining: 10 },
    ]);
    // The browser really rendered the pulled origin bytes.
    expect(snap.browserDisplay).toMatchObject({ status: 200, body: 'This is the about page' });
    // The pull really ran the cache-aside chain (miss warmed the shared cache).
    expect(snap.cache.entries).toMatchObject([{ key: '/about' }]);
  });

  // CHECKS: named counter-example — a second cd.example.com GET must NOT
  // replay the 9-hop hosted chain: inside the ledger TTL the edge serves the
  // HIT shape (6 hops), the origin pool sees nothing, and the ledger row is
  // what the frame narrates (ttl Nt read back from the snapshot).
  it('serves a second cd.example.com trace from the ledger in 6 hops (edge HIT)', () => {
    const engine = createEngine({ stage: 6 });
    for (let hop = 0; hop < 9; hop++) {
      engine.traceHop({ method: 'GET', path: 'cd.example.com/about' });
    }
    const frames = [];
    for (let hop = 1; hop <= 6; hop++) {
      const snap = engine.traceHop({ method: 'GET', path: 'cd.example.com/about' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    expect(frames).toEqual([
      '10.2 -> 10.60 | who is cd.example.com?',
      '10.60 -> 10.2 | 20.1',
      '10.2 -> 10.65 | GET /about (to 20.1)',
      '20.1 -> 10.65 | 200 This is the about page (edge HIT, ttl 9t)',
      '10.65 -> 10.2 | 200 This is the about page delivered',
      'Browser 10.2 received and displayed 200',
    ]);
    const snap = engine.snapshot();
    expect(snap.router.routed).toBe(5); // miss run's 3 + this HIT run's 2
    expect(snap.cdn).toMatchObject({ hits: 1, misses: 1, fills: 1 });
    expect(snap.browserDisplay.body).toBe('This is the about page');
  });

  // CHECKS: named counter-example — the ledger row answers only inside the
  // TTL window; past expiry (filled at tick 1, dead at 11) the next lookup
  // evicts and a fresh pull serves the origin's CURRENT bytes. The origin
  // edit is the real write-through: a hosted POST to the origin path writes
  // Primary 10.30 and invalidates the origin Cache (on stage 6 the /
  // /about row lives in the database, so the fs edit alone cannot move the
  // pulled bytes). The same run pins the staleness rule: nothing at the
  // edge changes inside its TTL window.
  it('keeps an origin write stale at the edge inside the TTL and pulls the new bytes after expiry', () => {
    const engine = createEngine({ stage: 6 });
    for (let hop = 0; hop < 9; hop++) {
      engine.traceHop({ method: 'GET', path: 'cd.example.com/about' });
    }
    // The origin's /about really changes: a hosted POST writes through to
    // Primary 10.30 at tick 2 and invalidates the origin Cache (replica
    // catches up 3t later).
    let snap;
    for (let hop = 0; hop < 9; hop++) {
      snap = engine.traceHop({ method: 'POST', path: 'example.com/about' });
      expect(snap.trace.hop).toBe(hop + 1);
    }
    expect(engine.snapshot().trace.dbOp).toBe('WRITE');
    // Inside the edge TTL (filled @1, dead @11; the clock is at 3 after the
    // POST run's own bump): the 4th call here is the HIT announce at hop 4,
    // still the OLD pulled bytes.
    for (let hop = 0; hop < 4; hop++) snap = engine.traceHop({ path: 'cd.example.com/about' });
    expect(snap.trace.hop).toBe(4);
    expect(snap.lastFrame).toBe('20.1 -> 10.65 | 200 This is the about page (edge HIT, ttl 8t)');
    for (let hop = 5; hop <= 6; hop++) {
      snap = engine.traceHop({ path: 'cd.example.com/about' });
      expect(snap.trace.hop).toBe(hop);
    }
    expect(engine.snapshot().browserDisplay.body).toBe('This is the about page');
    // Age the entry out: steps past the expiry tick (the edge lookup evicts
    // at tick >= 11), well past replication lag too.
    for (let i = 0; i < 8; i++) engine.step();
    // The next cd.example.com lookup MISSes and the pull returns the NEW
    // bytes through the Router's left leg (the full 9-hop shape again).
    snap = engine.traceHop({ method: 'GET', path: 'cd.example.com/about' });
    expect(snap.trace.hop).toBe(1);
    for (let hop = 2; hop <= 9; hop++) snap = engine.traceHop();
    expect(snap.trace.hop).toBe(9);
    expect(engine.snapshot().browserDisplay.body).toBe('Updated /about at tick 2');
    const cdn = engine.snapshot().cdn;
    expect(cdn.hits).toBe(1);
    expect(cdn.fills).toBe(2);
    expect(cdn.ledger[0]).toMatchObject({ path: '/about', body: 'Updated /about at tick 2' });
  });

  // CHECKS: named counter-example pinned from the machine side — a POST on
  // a CDN name rides the MISS shape minus the fill (9 hops, a real origin
  // answer) and the edge counters stay at their initial values with the
  // ledger row absent.
  it('passes a POST through to the origin without touching the edge ledger', () => {
    const engine = createEngine({ stage: 6 });
    const frames = [];
    for (let hop = 1; hop <= 9; hop++) {
      const snap = engine.traceHop({ method: 'POST', path: 'cd.example.com/note' });
      expect(snap.trace.hop).toBe(hop);
      frames.push(snap.lastFrame);
    }
    expect(frames).toEqual([
      '10.2 -> 10.60 | who is cd.example.com?',
      '10.60 -> 10.2 | 20.1',
      '10.2 -> 10.65 | POST /note (to 20.1)',
      '20.1 -> 10.65 | PASS — POST /note is not edge-cacheable, pulling origin 10.1 via router',
      '20.1 -> 10.1 | POST /note (edge pull via router)',
      'LB 10.1 -> 10.11 (POST /note) queued',
      '10.11 -> 10.65 | 200 Updated /note at tick 1 (cache INVALIDATE)',
      '10.65 -> 10.2 | 200 Updated /note at tick 1 delivered (no edge FILL — non-GET pass-through)',
      'Browser 10.2 received and displayed 200',
    ]);
    const snap = engine.snapshot();
    expect(snap.router.routed).toBe(3); // forward, pull, reverse — same 3 crossings
    expect(snap.cdn).toMatchObject({ hits: 0, misses: 0, fills: 0, ledger: [] });
  });
});
