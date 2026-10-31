import { describe, it, expect } from 'vitest';
import { createDns } from '../../js/sim/dns.js';
import { createEngine } from '../../js/sim/engine.js';

// B-6f record dropped (docs/plans/2026-10-31-b6f-dns-ledger-drop.md): the
// fault is the DNS component's OWN setDropped flag — the true flip purges
// the record from the authoritative table AND the ledger, the dropped
// name rides the existing NX branch (no new narration tokens anywhere),
// and restore re-arms the name with a fresh authoritative answer. Titles
// are manifest refs (SIM slice tests) — do not reword.

// Drives a fresh stage-6 engine through `hops` traceHop calls, returning
// the narrated frames and the final snapshot (worker-crash.test.js flow).
const runTrace = (path, { dropped = false, hops, method = 'GET' } = {}) => {
  const engine = createEngine({ stage: 6, arrivalProb: 0 });
  if (dropped) engine.setDnsDropped(true);
  const frames = [];
  for (let hop = 0; hop < hops; hop += 1) {
    frames.push(engine.traceHop({ method, path }).lastFrame);
  }
  return { frames, snap: engine.snapshot() };
};

describe('DNS record dropped (B-6f)', () => {
  it('setDropped validates a boolean ON/OFF flag and isDropped reads it back (fail loud)', () => {
    const dns = createDns({});
    expect(dns.isDropped()).toBe(false);
    expect(dns.snapshot().dropped).toBe(false);
    dns.setDropped(true);
    expect(dns.isDropped()).toBe(true);
    dns.setDropped(false);
    expect(dns.isDropped()).toBe(false);
    // Any non-boolean input throws with the flag's own message instead of
    // silently leaving the resolver in an unspecified consult state.
    expect(() => dns.setDropped('yes')).toThrow(/dropped must be a boolean, got yes/);
    expect(() => dns.setDropped(1)).toThrow(/dropped must be a boolean, got 1/);
    expect(() => dns.setDropped(null)).toThrow(/dropped must be a boolean, got null/);
    // A rejected input changes nothing.
    expect(dns.isDropped()).toBe(false);
  });

  // CHECKS: the true flip purges BOTH tables — the example.com record
  // leaves the authoritative table and every ledger row naming either
  // zone name is deleted (by exact stored name), so a stale 300t window
  // cannot keep serving the deleted record. The flip moves no lookup
  // counter: it is a table operation, not traffic.
  it('the true flip purges example.com and cd.example.com from BOTH tables', () => {
    const dns = createDns({ ttlTicks: 300 });
    expect(dns.lookup('example.com', 5)).toEqual({
      status: 'OK',
      target: '10.1',
      source: 'authoritative',
    });
    expect(dns.lookup('cd.example.com', 5)).toEqual({
      status: 'OK',
      target: '20.1',
      source: 'authoritative',
    });
    const before = dns.snapshot(5);
    expect(before.cache.map((e) => e.name)).toEqual(['example.com', 'cd.example.com']);
    expect(before).toMatchObject({
      lookups: 2,
      cachedHits: 0,
      authoritative: 2,
      dropped: false,
      droppedLookups: 0,
      reResolveAfterDrop: 0,
    });
    dns.setDropped(true);
    const after = dns.snapshot(5);
    expect(after.cache).toEqual([]);
    expect(after).toMatchObject({
      dropped: true,
      droppedLookups: 0,
      reResolveAfterDrop: 0,
      lookups: 2,
      cachedHits: 0,
      authoritative: 2,
    });
  });

  // While dropped the name rides the EXISTING NX branch — same return
  // shape, same lastLookup record, no ledger write — and only an NX for
  // the dropped name moves the evidence counter.
  it('a dropped lookup rides the NX branch — droppedLookups grows for the dropped name only', () => {
    const dns = createDns({});
    dns.setDropped(true);
    expect(dns.lookup('example.com', 3)).toEqual({
      status: 'NX',
      name: 'example.com',
      source: 'authoritative',
    });
    expect(dns.lookup('example.com', 4)).toEqual({
      status: 'NX',
      name: 'example.com',
      source: 'authoritative',
    });
    let snap = dns.snapshot(4);
    expect(snap).toMatchObject({ droppedLookups: 2, authoritative: 0 });
    expect(snap.lastLookup).toEqual({ name: 'example.com', status: 'NX', target: null, atTick: 4 });
    // An unknown-host NX reads the same branch and leaves the counter flat.
    expect(dns.lookup('nope.example', 4)).toEqual({
      status: 'NX',
      name: 'nope.example',
      source: 'authoritative',
    });
    expect(dns.snapshot(4).droppedLookups).toBe(2);
    // No NX lookup writes a ledger row.
    expect(dns.snapshot(4).cache).toEqual([]);
  });

  // CHECKS (order pin): cd.example.com's RECORD was not dropped — only
  // its ledger row was purged — so its lookups keep answering (fresh
  // authoritative) and pay the drop-era flag nothing. A pre-drop OK pays
  // it nothing either: the era flag opens on the true flip, not before.
  it('cd.example.com lookups stay OK while dropped and pay the re-resolve era nothing (order pin)', () => {
    const dns = createDns({});
    dns.lookup('example.com', 1);
    dns.lookup('cd.example.com', 2);
    expect(dns.snapshot(2)).toMatchObject({ reResolveAfterDrop: 0, droppedLookups: 0 });
    dns.setDropped(true);
    expect(dns.lookup('cd.example.com', 3)).toEqual({
      status: 'OK',
      target: '20.1',
      source: 'authoritative',
    });
    expect(dns.snapshot(3)).toMatchObject({ reResolveAfterDrop: 0, droppedLookups: 0 });
  });

  // CHECKS: the restored flip re-adds the record with the ledger empty
  // for that name, so the next lookup is a fresh authoritative answer
  // and it pays the era flag exactly once — repeated OKs, a double
  // restore, and the flag-off flip itself multiply nothing; a second
  // drop era adds at most one more.
  it('the restored flip re-adds the record — next lookup AUTH, reResolveAfterDrop counts exactly once', () => {
    const dns = createDns({});
    dns.lookup('example.com', 1); // warm ledger + pre-drop OK
    dns.setDropped(true);
    expect(dns.lookup('example.com', 2)).toEqual({
      status: 'NX',
      name: 'example.com',
      source: 'authoritative',
    });
    dns.setDropped(false);
    expect(dns.lookup('example.com', 3)).toEqual({
      status: 'OK',
      target: '10.1',
      source: 'authoritative',
    });
    expect(dns.snapshot(3)).toMatchObject({ reResolveAfterDrop: 1, droppedLookups: 1 });
    // Repeated OKs do not multiply it, and a double restore is a no-op.
    expect(dns.lookup('example.com', 4)).toEqual({
      status: 'OK',
      target: '10.1',
      source: 'cache',
    });
    dns.setDropped(false);
    expect(dns.snapshot(4).reResolveAfterDrop).toBe(1);
    // A second drop era opens a fresh era flag — one more payout max.
    // (No lookup ran while the second drop was on, so the NX tally holds.)
    dns.setDropped(true);
    dns.setDropped(false);
    expect(dns.lookup('example.com', 5)).toEqual({
      status: 'OK',
      target: '10.1',
      source: 'authoritative',
    });
    expect(dns.snapshot(5)).toMatchObject({ reResolveAfterDrop: 2, droppedLookups: 1 });
  });

  it('engine setDnsDropped is fail-loud below stage 6 — no DNS exists there', () => {
    const stage5 = createEngine({ stage: 5, arrivalProb: 0 });
    expect(() => stage5.setDnsDropped(true)).toThrow(/stage 5 has no DNS/);
    // Flipping false on a stage that has no DNS fails loud too.
    const stage1 = createEngine({ stage: 1, arrivalProb: 0 });
    expect(() => stage1.setDnsDropped(false)).toThrow(/stage 1 has no DNS/);
  });

  // CHECKS: the engine flip routes into the component's own flag — the
  // snapshot reads dropped + both counters back from the DNS component,
  // and a hosted trace while dropped ends at hop 2 with the browser's NX
  // card and nothing served.
  it('engine setDnsDropped routes to the DNS at stage 6 — the snapshot reads the flag and counters back', () => {
    const engine = createEngine({ stage: 6, arrivalProb: 0 });
    expect(engine.snapshot().dns).toMatchObject({
      dropped: false,
      droppedLookups: 0,
      reResolveAfterDrop: 0,
    });
    engine.setDnsDropped(true);
    let snap = engine.traceHop({ method: 'GET', path: 'example.com/about' });
    expect(snap.lastFrame).toBe('10.2 -> 10.60 | who is example.com?');
    snap = engine.traceHop();
    expect(snap.lastFrame).toBe('10.60 -> 10.2 | NX no record');
    expect(snap.trace).toMatchObject({ hop: 2, nx: true, status: null });
    expect(snap.dns).toMatchObject({ dropped: true, droppedLookups: 1, reResolveAfterDrop: 0 });
    expect(snap.browserDisplay).toMatchObject({
      status: 'NX',
      body: 'NX no record — no GET emitted',
    });
    expect(snap.served).toBe(0);
    engine.setDnsDropped(false);
    expect(engine.snapshot().dns).toMatchObject({ dropped: false, droppedLookups: 1 });
  });

  // CHECKS: DL counter-example (1) — the fault generates no new story, it
  // starves an existing one. The NX-drop run and the unknown-host NX run
  // are the same run modulo the typed host token: same hop count, same
  // answer-line bytes, no fault token in any narrated frame.
  it('DL counter-example — the NX-drop run narrates exactly like an unknown-host NX run, no new frame', () => {
    const droppedRun = runTrace('example.com/about', { dropped: true, hops: 2 });
    const unknownRun = runTrace('nope.example/about', { hops: 2 });
    expect(droppedRun.frames).toEqual([
      '10.2 -> 10.60 | who is example.com?',
      '10.60 -> 10.2 | NX no record',
    ]);
    expect(unknownRun.frames).toEqual([
      '10.2 -> 10.60 | who is nope.example?',
      '10.60 -> 10.2 | NX no record',
    ]);
    // Frame-for-frame equal once the host token is normalized — the drop
    // adds no frame, no hop, and no narration token of its own.
    const normalize = (frames) => frames.map((f) => f.replace(/who is \S+\?/, 'who is <host>?'));
    expect(normalize(droppedRun.frames)).toEqual(normalize(unknownRun.frames));
    expect(droppedRun.frames.join('\n')).not.toMatch(/drop/i);
    expect(unknownRun.frames.join('\n')).not.toMatch(/drop/i);
    // Both runs end the same way: hop 2, nx true, nothing served.
    expect(droppedRun.snap.trace).toMatchObject({ hop: 2, nx: true, status: null });
    expect(unknownRun.snap.trace).toMatchObject({ hop: 2, nx: true, status: null });
    expect(droppedRun.snap.served).toBe(0);
    expect(unknownRun.snap.served).toBe(0);
    // Evidence stays on the faulted engine only — the unknown host leaves
    // the counters flat.
    expect(droppedRun.snap.dns.droppedLookups).toBe(1);
    expect(unknownRun.snap.dns.droppedLookups).toBe(0);
  });

  // CHECKS: DL counter-example (2) — a host-less URL never consults DNS,
  // so the full 8-hop stage-5 story runs byte-identically with the
  // record dropped (lookups stay 0).
  it('DL counter-example — host-less /about stays byte-identical while the record is dropped', () => {
    const off = runTrace('/about', { hops: 8 });
    const on = runTrace('/about', { dropped: true, hops: 8 });
    expect(on.frames).toEqual(off.frames);
    expect(on.frames).toEqual([
      '10.2 -> 10.1 | GET /about',
      'routed 10.2 -> 10.1 (GET /about) to LoadBalancer',
      'LB 10.1 -> 10.11 (GET /about) queued',
      'Database SELECT /about @ 10.31 (fresh)',
      '10.11 -> 10.2 | 200 This is the about page (cache MISS)',
      'Network delivered 200 response to 10.2',
      'Browser 10.2 received and displayed 200',
      'Worker 10.41 idle — no async jobs in this trace',
    ]);
    expect(on.snap.dns.lookups).toBe(0);
    expect(on.snap.dns.droppedLookups).toBe(0);
  });

  // CHECKS: DL counter-example (3) — cd.example.com's record was not
  // dropped, so its hosted run (DNS ask/answer prelude included) stays
  // byte-identical with the fault on, and its counters pay nothing.
  it('DL counter-example — cd.example.com hosted runs stay byte-identical with the record dropped', () => {
    const off = runTrace('cd.example.com/about', { hops: 9 });
    const on = runTrace('cd.example.com/about', { dropped: true, hops: 9 });
    expect(on.frames).toEqual(off.frames);
    expect(on.frames).toEqual([
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
    expect(on.snap.dns).toMatchObject({
      lookups: 1,
      droppedLookups: 0,
      reResolveAfterDrop: 0,
    });
  });

  // CHECKS: DL counter-example (4) — the restored run narrates a FRESH
  // authoritative answer (the drop purged the ledger, so no HIT can dress
  // as the old record) and then the normal 200 served story; no NX token
  // survives into the restored run's frames.
  it('DL counter-example — a restored run narrates a fresh AUTH answer then the 200, no NX residue', () => {
    const engine = createEngine({ stage: 6, arrivalProb: 0 });
    engine.setDnsDropped(true);
    // The NX era runs first — the trace ends at the answer hop.
    engine.traceHop({ method: 'GET', path: 'example.com/about' });
    const nxSnap = engine.traceHop();
    expect(nxSnap.trace).toMatchObject({ hop: 2, nx: true });
    engine.setDnsDropped(false);
    const frames = [];
    for (let hop = 1; hop <= 9; hop += 1) {
      frames.push(engine.traceHop({ method: 'GET', path: 'example.com/about' }).lastFrame);
    }
    expect(frames[1]).toBe('10.60 -> 10.2 | 10.1');
    expect(frames.join('\n')).not.toContain('NX');
    const snap = engine.snapshot();
    expect(snap.trace).toMatchObject({ hop: 9, status: 200, nx: false });
    expect(snap.dns.lastLookup).toMatchObject({
      name: 'example.com',
      status: 'AUTH',
      target: '10.1',
    });
    expect(snap.dns).toMatchObject({ droppedLookups: 1, reResolveAfterDrop: 1 });
    expect(snap.browserDisplay).toMatchObject({ status: 200 });
  });

  // CHECKS: off-fault the wiring changes nothing observable — a same-seed
  // replay is byte-green with the fault off, and a flip on + straight off
  // with no traffic between leaves no residue either.
  it('same seed replays the identical tick sequence with the fault off (stage 6)', () => {
    const run = () => {
      const engine = createEngine({ stage: 6, seed: 7, users: 8, arrivalProb: 0.6 });
      return Array.from({ length: 25 }, () => engine.step());
    };
    const first = run();
    expect(first).toEqual(run());
    const toggleRun = () => {
      const engine = createEngine({ stage: 6, seed: 7, users: 8, arrivalProb: 0.6 });
      engine.setDnsDropped(true);
      engine.setDnsDropped(false);
      return Array.from({ length: 25 }, () => engine.step());
    };
    expect(toggleRun()).toEqual(first);
  });
});
